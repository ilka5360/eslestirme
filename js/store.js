/* Kalıcılık (yalnız tarayıcı): localStorage v2, IndexedDB anlık yedekler + görseller, isteğe bağlı JSON dosyası (File System Access). */
(function (root) {
  'use strict';
  const M = root.Model;
  const LS2 = 'eslestirme.v2', LS1 = 'eslestirme.v1';
  const MAX_JSON = 20 * 1024 * 1024, MAX_IMG = 2 * 1024 * 1024, MAX_PX = 1600;

  /* ---------------- IndexedDB ---------------- */
  const conns = {};
  function open(name, store) {
    if (!conns[name]) conns[name] = new Promise((res, rej) => {
      if (!root.indexedDB) return rej(new Error('IndexedDB yok'));
      const rq = indexedDB.open(name, 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore(store);
      rq.onerror = () => rej(rq.error); rq.onsuccess = () => res(rq.result);
    });
    return conns[name];
  }
  async function idb(name, store, mode, fn) {
    const db = await open(name, store);
    return new Promise((res, rej) => { const tx = db.transaction(store, mode); const r = fn(tx.objectStore(store)); tx.oncomplete = () => res(r && r.result); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
  }

  /* ---------------- ana veri ---------------- */
  function load() {
    let raw2 = null, raw1 = null;
    try { raw2 = localStorage.getItem(LS2); raw1 = localStorage.getItem(LS1); } catch (e) { return { db: M.emptyDB(), notice: 'Tarayıcı depolamasına erişilemiyor (gizli sekme olabilir). Veriler kaydedilmeyecek!', level: 'err' }; }
    if (raw2) {
      try { return { db: M.migrate(JSON.parse(raw2)), notice: '' }; }
      catch (e) {
        try { localStorage.setItem(LS2 + '.bozuk-' + Date.now(), raw2); } catch (e2) {}
        return { db: M.emptyDB(), notice: 'Kayıtlı veri okunamadı (' + e.message + '). Bozuk kayıt ayrıca saklandı; eski sürüm verisi silinmedi.', level: 'err', noSave: true };
      }
    }
    if (raw1) {
      try {
        const db = M.migrate(JSON.parse(raw1)); delete db.migratedFromV1;
        const n = Object.keys(db.tournaments).length;
        return { db, notice: n ? `Eski veriler yeni sürüme taşındı (${n} turnuva; eski kayıt silinmedi).` : '', level: 'ok', migrated: true };
      } catch (e) { return { db: M.emptyDB(), notice: 'Eski sürüm verisi taşınamadı: ' + e.message + ' (eski kayıt silinmedi).', level: 'err', noSave: true }; }
    }
    return { db: M.emptyDB(), notice: '' };
  }
  function save(db) {
    db.saved = Date.now();
    try { localStorage.setItem(LS2, JSON.stringify(db)); return true; } catch (e) { return false; }
  }
  /** Dosya/yedekten gelen DB'de TC/telefon yoksa yerel kayıttan geri al (aynı sporcu id). */
  function restorePII(nd, old) {
    const m = new Map();
    for (const t of Object.values(old.tournaments)) for (const c of t.cats) for (const p of c.players) if (p.tc || p.tel || p.email) m.set(p.id, p);
    for (const t of Object.values(nd.tournaments)) for (const c of t.cats) for (const p of c.players) { const o = m.get(p.id); if (o) { if (!p.tc) p.tc = o.tc; if (!p.tel) p.tel = o.tel; if (!p.email) p.email = o.email; } }
  }

  /* ---------------- anlık yedekler (son 5) ---------------- */
  async function snapshot(db, reason) {
    try {
      const id = Date.now();
      await idb('eslestirme-snap', 's', 'readwrite', s => s.put({ id, at: id, reason: String(reason || ''), data: JSON.stringify(db) }, id));
      const keys = await idb('eslestirme-snap', 's', 'readonly', s => s.getAllKeys());
      const old = keys.sort((a, b) => b - a).slice(15);
      if (old.length) await idb('eslestirme-snap', 's', 'readwrite', s => { old.forEach(k => s.delete(k)); });
      return true;
    } catch (e) { return false; }
  }
  async function listSnaps() {
    try { const all = await idb('eslestirme-snap', 's', 'readonly', s => s.getAll()); return all.sort((a, b) => b.at - a.at).map(x => ({ id: x.id, at: x.at, reason: x.reason, size: x.data.length })); } catch (e) { return []; }
  }
  async function getSnap(id) { const x = await idb('eslestirme-snap', 's', 'readonly', s => s.get(id)); return x ? JSON.parse(x.data) : null; }

  /* ---------------- görseller ---------------- */
  const urls = new Map();
  const akey = (tid, slot) => tid + ':' + slot;
  async function putImage(tid, slot, blob) { await idb('eslestirme-assets', 'img', 'readwrite', s => s.put(blob, akey(tid, slot))); const k = akey(tid, slot); if (urls.has(k)) { URL.revokeObjectURL(urls.get(k)); urls.delete(k); } }
  async function getBlob(tid, slot) { try { return await idb('eslestirme-assets', 'img', 'readonly', s => s.get(akey(tid, slot))); } catch (e) { return null; } }
  async function getURL(tid, slot) {
    const k = akey(tid, slot); if (urls.has(k)) return urls.get(k);
    const b = await getBlob(tid, slot); if (!b) return null;
    const u = URL.createObjectURL(b); urls.set(k, u); return u;
  }
  async function delImage(tid, slot) { const k = akey(tid, slot); try { await idb('eslestirme-assets', 'img', 'readwrite', s => s.delete(k)); } catch (e) {} if (urls.has(k)) { URL.revokeObjectURL(urls.get(k)); urls.delete(k); } }
  async function delTournamentImages(tid) { for (const s of ['header', 'yHeader', 'footer', 'logoL', 'logoR', 'cardBg']) await delImage(tid, s); }
  const toDataURL = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
  const fromDataURL = async (u) => { if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/=]+$/.test(u)) throw new Error('Geçersiz görsel verisi'); return (await fetch(u)).blob(); };
  /** Görseli doğrula (png/jpeg/webp, <=2 MB) ve en çok 1600 px'e küçült. */
  async function processImage(file, spec) {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Yalnız PNG, JPG veya WEBP görsel yüklenebilir (SVG kabul edilmez).');
    if (file.size > MAX_IMG) throw new Error('Görsel çok büyük (' + (file.size / 1048576).toFixed(1) + ' MB). En fazla 2 MB.');
    const url = URL.createObjectURL(file);
    try {
      const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Görsel okunamadı.')); i.src = url; });
      const nw = im.naturalWidth, nh = im.naturalHeight, cv = document.createElement('canvas'), cx = cv.getContext('2d');
      const png = file.type !== 'image/jpeg' || !!(spec && spec.contain);
      if (spec && spec.w && spec.h) {
        /* Hedef piksele ayarla: cover = oranı koruyup kırp (arka plan), contain = oranı koruyup sığdır (şeffaf boşluk) */
        cv.width = spec.w; cv.height = spec.h;
        const k = spec.cover ? Math.max(spec.w / nw, spec.h / nh) : Math.min(spec.w / nw, spec.h / nh), dw = nw * k, dh = nh * k;
        cx.imageSmoothingQuality = 'high'; cx.drawImage(im, (spec.w - dw) / 2, (spec.h - dh) / 2, dw, dh);
      } else {
        const k = Math.min(1, MAX_PX / Math.max(nw, nh)), w = Math.max(1, Math.round(nw * k)), h = Math.max(1, Math.round(nh * k));
        cv.width = w; cv.height = h; cx.drawImage(im, 0, 0, w, h);
      }
      return await new Promise((res, rej) => cv.toBlob(b => (b ? res(b) : rej(new Error('Görsel işlenemedi.'))), png ? 'image/png' : 'image/jpeg', 0.9));
    } finally { URL.revokeObjectURL(url); }
  }

  /* ---------------- JSON dosyası (File System Access, Chrome/Edge masaüstü) ---------------- */
  const FSA = typeof root.showSaveFilePicker === 'function';
  const F = { supported: FSA, state: FSA ? 'yok' : 'desteklenmiyor', handle: null, last: null, timer: null };
  const pickOpts = { types: [{ description: 'Eşleştirme veritabanı (JSON)', accept: { 'application/json': ['.json'] } }] };
  const fsGet = () => idb('eslestirme-fs', 'h', 'readonly', s => s.get('db'));
  async function fsInit(onLoaded) {
    if (!FSA) return;
    try { F.handle = await fsGet(); } catch (e) { F.handle = null; }
    if (F.handle) { F.state = 'izin'; if (await F.handle.queryPermission({ mode: 'readwrite' }) === 'granted') await fsSync(onLoaded); }
  }
  async function fsRead() { const txt = await (await F.handle.getFile()).text(); if (!txt.trim()) return null; if (txt.length > MAX_JSON) throw new Error('Dosya çok büyük'); return M.migrate(JSON.parse(txt)); }
  async function fsSync(onLoaded) {
    try { const d = await fsRead(); if (d && (d.saved || 0) > (onLoaded.cur().saved || 0)) { onLoaded.set(d); } else await fsWrite(onLoaded.cur()); F.state = 'bagli'; }
    catch (e) { F.state = 'hata'; }
  }
  async function fsWrite(db) { if (!F.handle) return; const w = await F.handle.createWritable(); await w.write(JSON.stringify(M.stripPII(db), null, 1)); await w.close(); F.last = new Date(); }
  function fsSchedule(db, onErr) {
    if (!F.handle || F.state !== 'bagli') return;
    clearTimeout(F.timer);
    F.timer = setTimeout(async () => { try { await fsWrite(db()); } catch (e) { F.state = 'hata'; onErr(e); } }, 500);
  }
  async function fsBind(handle, cb) { F.handle = handle; try { await idb('eslestirme-fs', 'h', 'readwrite', s => s.put(handle, 'db')); } catch (e) {} F.state = 'bagli'; }
  async function fsUnlink() { F.handle = null; F.state = 'yok'; try { await idb('eslestirme-fs', 'h', 'readwrite', s => s.delete('db')); } catch (e) {} }

  root.Store = { LS1, LS2, MAX_JSON, load, save, restorePII, snapshot, listSnaps, getSnap, putImage, getBlob, getURL, delImage, delTournamentImages, toDataURL, fromDataURL, processImage, F, pickOpts, fsInit, fsSync, fsRead, fsWrite, fsSchedule, fsBind, fsUnlink };
})(window);
