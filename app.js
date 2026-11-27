/* Eşleştirme – çekirdek: veri, yönlendirme, Dashboard, sihirbaz, Arşiv, turnuva çerçevesi, yedekleme. */
(function () {
  'use strict';
  const A = window.App, { $, $$, esc, ACT, fmt, fmtDate } = A;
  const M = window.Model, S = window.Store, R = window.Rules, I = window.Importer, E = window.Engine;
  A.M = M; A.S = S; A.E = E;
  A.VERSION = { no: 33, date: '26.11.2026' };   // sw.js içindeki önbellek adıyla (eslestirme-vNN) aynı tutulur

  /* ------------------------------------------------------------- veri */
  const boot = S.load();
  let DB = boot.db;
  let banner = boot.notice ? { msg: boot.notice, level: boot.level || 'ok' } : null;
  let quotaFail = false;
  A.db = () => DB;
  A.setDB = (d) => { DB = d; };
  A.save = (o) => {
    o = o || {};
    if (!o.clean) DB.dirty = true;
    const ok = S.save(DB);
    if (!ok && !quotaFail) { quotaFail = true; A.toast('KAYIT BAŞARISIZ: depolama dolu! Hemen yedek indirin.', 8000); }
    if (ok) quotaFail = false;
    S.fsSchedule(() => DB, (e) => A.toast('Dosyaya yazılamadı: ' + e.message));
    return ok;
  };
  A.snap = (reason) => S.snapshot(DB, reason);
  if (boot.migrated) { A.save({ clean: true }); }
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}

  /* ------------------------------------------------------------- yönlendirme */
  let R_ = { name: 'home' };
  const ID = M.ID_RE;
  function parseRoute() {
    const p = (location.hash || '#/').replace(/^#\/?/, '').split('/').map(x => { try { return decodeURIComponent(x); } catch (e) { return ''; } });
    const n = p[0] || 'home';
    const r = { name: n, tid: null, cid: null, tab: null };
    if (['t', 'sorgu', 'kayit', 'kart'].includes(n)) {
      r.tid = ID.test(p[1] || '') ? p[1] : null;
      if (n === 't') { r.cid = p[2] === 'ayarlar' ? 'ayarlar' : (ID.test(p[2] || '') ? p[2] : null); r.tab = p[3] || 'spor'; }
    } else if (!['home', 'yeni', 'arsiv', 'kurallar'].includes(n)) r.name = 'home';
    return r;
  }
  A.route = () => R_;
  A.go = (path) => { if (location.hash === '#/' + path) A.render(); else location.hash = '#/' + path; };
  A.ctx = () => {
    const tid = R_.tid || (['sorgu', 'kayit', 'kart'].includes(R_.name) ? DB.cur : null);
    const tn = tid && DB.tournaments[tid] || null;
    let cat = null;
    if (tn) cat = tn.cats.find(c => c.id === R_.cid) || (R_.cid === 'ayarlar' ? null : tn.cats.find(c => c.id === DB.curCat) || tn.cats[0] || null);
    return { tn, cat, tid: tn ? tn.id : null };
  };
  A.ro = () => { const { tn } = A.ctx(); return !!(tn && tn.status === 'arsiv' && ['t', 'kayit', 'kart', 'sorgu'].includes(R_.name)); };
  A.tnPath = (tn, cid, tab) => `t/${tn.id}${cid ? '/' + cid : ''}${tab ? '/' + tab : ''}`;

  A.after = [];

  const NAV = [['home', 'Ana', 'p-knight'], ['t', 'Turnuva', 'p-rook'], ['arsiv', 'Arşiv', 'p-bishop'], ['sorgu', 'UKD/ELO', 'p-queen'], ['kayit', 'Kayıt', 'p-pawn'], ['kart', 'Kartlar', 'p-king'], ['kurallar', 'Kurallar', 'p-bishop']];
  function chrome() {
    const { tn } = A.ctx();
    const cur = DB.tournaments[DB.cur] ? DB.cur : null;
    const hrefs = { kurallar: '#/kurallar', home: '#/', t: cur ? '#/t/' + cur : '#/', arsiv: '#/arsiv', sorgu: '#/sorgu' + (cur ? '/' + cur : ''), kayit: '#/kayit' + (cur ? '/' + cur : ''), kart: '#/kart' + (cur ? '/' + cur : '') };
    $('#nav').innerHTML = NAV.map(([k, l, ic]) => `<a href="${hrefs[k]}" class="${(R_.name === k || (k === 'home' && R_.name === 'yeni')) ? 'on' : ''}" ${R_.name === k ? 'aria-current="page"' : ''}><svg class="ic"><use href="#${ic}"/></svg><span>${l}</span></a>`).join('');
    $('#tName').textContent = tn ? tn.info.name : (DB.tournaments[DB.cur] ? DB.tournaments[DB.cur].info.name : 'Satranç turnuva yöneticisi');
    document.title = (tn ? tn.info.name + ' – ' : '') + 'Eşle';
    const bb = $('#banner');
    const parts = [];
    if (banner) parts.push(`<div class="note ${banner.level === 'err' ? 'err' : 'ok'} bn"><span>${esc(banner.msg)}</span><button class="b sm sec" data-act="hideBanner">Tamam</button></div>`);
    if (quotaFail) parts.push(`<div class="note err bn"><span><b>Kayıt başarısız:</b> tarayıcı depolaması dolu. Verileriniz kaybolabilir.</span><button class="b sm" data-act="backup">Şimdi yedek indir</button></div>`);
    bb.innerHTML = parts.join(''); A.bind(bb);
  }
  ACT.hideBanner = () => { banner = null; chrome(); };

  const SAFE_RO = new Set(['goR', 'standR', 'expStand', 'print', 'goStand', 'unarchive', 'expP', 'goTab', 'hideBanner', 'backup', 'openT', 'goCat', 'goTool']);
  A.render = function () {
    R_ = parseRoute();
    const ctx = A.ctx();
    if (R_.tid && !ctx.tn) { R_ = { name: 'home' }; if (location.hash !== '#/') history.replaceState(null, '', '#/'); }
    if (ctx.tn && R_.name !== 'home') { DB.cur = ctx.tn.id; if (ctx.cat) DB.curCat = ctx.cat.id; }
    chrome();
    A.after = [];
    let out;
    try {
      const v = { home: vHome, yeni: vWizard, arsiv: vArsiv, kurallar: toolView('kurallar'), t: vTournament, sorgu: toolView('sorgu'), kayit: toolView('kayit'), kart: toolView('kart') }[R_.name];
      out = v(ctx);
    } catch (e) { console.error(e); out = `<div class="note err">Sayfa çizilemedi: ${esc(e.message)}</div>`; }
    const app = $('#app'); app.innerHTML = out; A.bind(app);
    if (A.ro() && R_.name === 't') $$('[data-act]', app).forEach(el => { if (!SAFE_RO.has(el.dataset.act)) el.disabled = true; });
    const fns = A.after.slice(); A.after = []; fns.forEach(f => { try { f(); } catch (e) { console.error(e); } });
  };
  function toolView(name) { return (ctx) => (A.views[name] ? A.views[name](ctx) : '<div class="note err">Modül yüklenemedi.</div>'); }
  window.addEventListener('hashchange', () => { A.render(); window.scrollTo(0, 0); });

  /* ------------------------------------------------------------- yardımcılar */
  const today = () => new Date().toISOString().slice(0, 10);
  const yearOf = (d) => +String(d || '').slice(0, 4) || new Date().getFullYear();
  const sorted = () => Object.values(DB.tournaments).sort((a, b) => (b.info.date || '').localeCompare(a.info.date || '') || b.created - a.created);
  const catLine = (c) => { const tr = M.totalRounds(c); return `<span class="chip" title="${esc(c.name)}"><b>${esc(c.short || c.name)}</b> ${c.players.length}${tr ? ' · ' + tr + ' tur' : ''}${c.started ? ' · ' + M.completedRounds(c) + '/' + tr : ''}</span>`; };
  const statusPill = (tn) => ({ aktif: '<span class="pill">aktif</span>', tamamlandi: '<span class="pill warn">tamamlandı</span>', arsiv: '<span class="pill gray">arşiv</span>' }[tn.status]);
  const progress = (tn) => { let d = 0, t = 0; tn.cats.forEach(c => { const tr = M.totalRounds(c); if (tr) { t += tr; d += Math.min(M.completedRounds(c), tr); } }); return t ? Math.round(d * 100 / t) : 0; };

  /* ============================================================= DASHBOARD */
  function vHome() {
    const all = Object.values(DB.tournaments), act = sorted().filter(t => t.status !== 'arsiv' && t.status !== 'tamamlandi'), arch = all.filter(t => t.status !== 'aktif');
    const pl = act.reduce((s, t) => s + M.countPlayers(t), 0), kc = act.reduce((s, t) => s + t.cats.length, 0);
    const need = all.length && (!DB.lastBackup || Date.now() - DB.lastBackup > 864e5) && DB.dirty;
    const piece = (id) => `<svg class="pc"><use href="#${id}"/></svg>`;
    let h = `<section class="hero"><div class="heroin"><div class="pieces" aria-hidden="true">${['p-king', 'p-queen', 'p-rook', 'p-bishop', 'p-knight', 'p-pawn'].map(piece).join('')}</div>
      <h1>Eşle</h1><p>Satranç turnuvaları için İsviçre ve Berger eşlendirme, kayıt kontrol, yaka ve masa kartları.</p>
      <div class="row tight"><a class="b big" href="#/yeni">♟ Yeni turnuva</a><button class="b sec big" data-act="impBackup">Yedekten yükle</button></div></div></section>
      <p class="muted ver" style="text-align:right;margin:4px 2px 0;font-size:12px">Sürüm v${A.VERSION.no} • ${A.VERSION.date}</p>
      <div class="stats"><div><b>${act.length}</b><small>Aktif turnuva</small></div><div><b>${pl}</b><small>Sporcu</small></div><div><b>${kc}</b><small>Kategori</small></div><div><b>${arch.length}</b><small>Arşiv</small></div></div>`;
    if (need) h += `<div class="note bn"><span>${DB.lastBackup ? 'Son yedek: ' + A.ago(DB.lastBackup) + ' ve sonrasında değişiklik yapıldı.' : 'Henüz yedek almadınız.'} Tarayıcı verisi silinirse turnuvalar kaybolur.</span><button class="b sm" data-act="backup">Yedek al</button></div>`;
    if (wizHasData() && (W.raw.length || W.manual.length || W.step > 1)) h += `<div class="note info bn"><span><b>Yarım kalan turnuva:</b> “${esc(W.info.name || 'adsız')}” (${W.raw.length + W.manual.length} sporcu, ${W.step}. adım)</span><span class="row tight"><a class="b sm" href="#/yeni">Devam et</a><button class="b sm sec" data-act="wiDrop">Sil</button></span></div>`;
    h += '<h2>Aktif turnuvalar</h2>';
    if (!act.length) h += `<div class="empty board"><div><h3>${all.length ? 'Aktif turnuva yok' : 'İlk turnuvanı oluştur'}</h3><p class="muted">Sporcu kayıt Excel’ini yükleyin; kategoriler ve sporcular otomatik oluşur.</p><a class="b big" href="#/yeni">Turnuva oluştur</a></div></div>`;
    act.forEach(tn => {
      h += `<div class="card tcard"><div class="tc-top"><div><h3 style="margin:0"><a href="#/t/${tn.id}">${esc(tn.info.name)}</a> ${statusPill(tn)}</h3>
        <div class="muted">${esc(fmtDate(tn.info.date))}${tn.info.place ? ' · ' + esc(tn.info.place) : ''} · ${M.countPlayers(tn)} sporcu</div></div>
        <div class="row tight"><a class="b" href="#/t/${tn.id}">Aç</a><button class="b sec" data-act="tnMenu" data-a="${tn.id}" aria-label="Diğer işlemler">⋯</button></div></div>
        <div class="chips">${tn.cats.map(catLine).join('') || '<span class="muted">Kategori yok</span>'}</div>
        <div class="bar" title="İlerleme %${progress(tn)}"><i style="width:${progress(tn)}%"></i></div></div>`;
    });
    h += vData();
    return h;
  }
  ACT.tnMenu = (el) => {
    const tn = DB.tournaments[el.dataset.a]; if (!tn) return;
    A.dialog(`<h3>${esc(tn.info.name)}</h3><div class="stack">
      <button class="b sec" data-act="dupT" data-a="${tn.id}">Kopyala (yalnız sporcular/ayarlar)</button>
      <button class="b sec" data-act="setSt" data-a="${tn.id}|tamamlandi">Tamamlandı olarak işaretle</button>
      <button class="b sec" data-act="setSt" data-a="${tn.id}|arsiv">Arşive taşı</button>
      <button class="b sec" data-act="backup" data-a="${tn.id}">Yedek indir (JSON)</button>
      <button class="b red" data-act="delT" data-a="${tn.id}">Sil…</button><button class="b sec" data-close>Kapat</button></div>`, d => A.bind(d));
  };
  ACT.setSt = async (el) => {
    const [id, st] = el.dataset.a.split('|'); const tn = DB.tournaments[id];
    if (st === 'arsiv' && !(await A.ask(`“${tn.info.name}” arşive taşınsın mı? Arşivdeki turnuva salt okunur olur; istediğiniz zaman geri çıkarabilirsiniz.`, { ok: 'Arşive taşı' }))) return;
    M.setStatus(tn, st); A.save(); $('#dlg').open && $('#dlg').close(); A.toast(st === 'arsiv' ? 'Arşive taşındı' : st === 'aktif' ? 'Aktif yapıldı' : 'Tamamlandı olarak işaretlendi'); A.render();
  };
  ACT.unarchive = () => { const { tn } = A.ctx(); M.setStatus(tn, 'aktif'); A.save(); A.toast('Arşivden çıkarıldı'); A.render(); };
  ACT.dupT = (el) => {
    const s = M.clone(DB.tournaments[el.dataset.a]); const tn = M.newTournament(s.info); tn.info.name += ' (kopya)'; tn.assets = {};
    tn.cats = s.cats.map(c => { const n = M.newCategory(c.name, c); n.settings = c.settings; n.settings.roundsManual = c.settings.roundsManual; n.schedule = c.schedule; M.addPlayers(n, c.players.map(p => { const q = M.newPlayer(Object.assign({}, p, { id: undefined })); q.kisiId = p.kisiId; return q; })); return n; });
    DB.tournaments[tn.id] = tn; A.save(); $('#dlg').open && $('#dlg').close(); A.toast('Kopya oluşturuldu (sonuçlar ve eşlendirmeler alınmadı)'); A.go('t/' + tn.id);
  };
  ACT.delT = async (el) => {
    const tn = DB.tournaments[el.dataset.a]; if (!tn) return;
    $('#dlg').open && $('#dlg').close();
    if (!(await A.ask(`“${tn.info.name}” turnuvası (${M.countPlayers(tn)} sporcu) silinecek.\nSilmeden önce JSON yedek indirmeniz önerilir.`, { title: 'Turnuvayı sil', ok: 'Devam', danger: true }))) return;
    if (!(await A.ask('Bu işlem GERİ ALINAMAZ. Turnuva ve görselleri kalıcı olarak silinsin mi?', { title: 'Son onay', ok: 'Evet, kalıcı sil', danger: true }))) return;
    await A.snap('silme-öncesi'); S.delTournamentImages(tn.id);
    delete DB.tournaments[tn.id]; if (DB.cur === tn.id) { DB.cur = null; DB.curCat = null; }
    A.save(); A.toast('Turnuva silindi (son anlık yedek bu tarayıcıda saklandı)'); if (R_.name === 't') A.go(''); else A.render();
  };

  /* ---------- Veri / yedek bölümü */
  function vData() {
    const F = S.F;
    return `<h2>Veri güvenliği</h2><div class="card noprint">
      <p style="margin-top:0">Son yedek: <b>${esc(A.ago(DB.lastBackup))}</b> ${DB.dirty && DB.lastBackup ? '<span class="pill warn">sonra değişiklik var</span>' : ''}</p>
      <div class="row tight"><button class="b" data-act="backup">Yedek al (JSON)</button><button class="b sec" data-act="impBackup">Yedekten yükle</button><button class="b sec" data-act="snaps">Anlık yedekler</button></div>
      <p class="muted" style="margin:10px 0 0">Veriler bu tarayıcıda saklanır. TC kimlik ve telefon bilgileri yedeğe <b>varsayılan olarak eklenmez</b>. Tarayıcı verisi temizlenirse kayıtlar silinir; düzenli yedek alın.</p>
      ${!F.supported ? '<div class="note">Bu tarayıcı otomatik dosyaya yazmayı desteklemiyor (Chrome/Edge masaüstü gerekir).</div>' :
        `<h3 style="margin-top:14px">Otomatik JSON dosyası</h3><p class="muted" style="margin:0 0 8px">Seçtiğiniz dosyaya her değişiklikte yazılır (TC/telefon yazılmaz). OneDrive klasörüne koyarsanız yedekli olur.</p>
        <div class="row tight">${F.state === 'bagli' ? `<span class="pill">Bağlı: ${esc(F.handle.name)}</span><button class="b sm sec" data-act="saveNow">Şimdi kaydet</button><button class="b sm sec" data-act="unlinkDb">Bağlantıyı kes</button>` :
          F.state === 'izin' ? `<span class="pill warn">${esc(F.handle.name)} – izin gerekli</span><button class="b sm" data-act="reDb">Etkinleştir</button><button class="b sm sec" data-act="unlinkDb">Kaldır</button>` :
          `<button class="b sec" data-act="newDb">Yeni dosya oluştur</button><button class="b sec" data-act="openDb">Mevcut dosyayı aç</button>`}${F.state === 'hata' ? '<span class="pill err">yazma hatası</span>' : ''}</div>
        ${F.state === 'bagli' && F.last ? `<p class="muted" style="margin:6px 0 0">Son yazma: ${F.last.toLocaleTimeString('tr-TR')}</p>` : ''}`}</div>`;
  }
  ACT.backup = (el) => {
    const tid = el && el.dataset && el.dataset.a || null;
    $('#dlg').open && $('#dlg').close();
    A.dialog(`<h3>${tid ? 'Turnuva yedeği' : 'Yedek indir'} (JSON)</h3>
      <label class="chk"><input type="checkbox" id="bk_pii"> TC kimlik ve telefon bilgilerini de ekle <span class="muted">(önerilmez; dosyayı güvenli saklayın)</span></label>
      <label class="chk"><input type="checkbox" id="bk_img"> Kart görsellerini de ekle (dosya büyür)</label>
      <div class="row tight" style="margin-top:12px"><button class="b" id="bk_ok">İndir</button><button class="b sec" data-close>Vazgeç</button></div>`, d => {
      $('#bk_ok', d).onclick = async () => {
        try {
          const o = { includePII: $('#bk_pii', d).checked, tid }; const b = M.exportBundle(DB, o);
          if ($('#bk_img', d).checked) {
            b.assets = {};
            for (const id of Object.keys(b.tournaments)) { b.assets[id] = {}; for (const slot of ['header', 'yHeader', 'footer', 'logoL', 'logoR', 'cardBg']) { const bl = await S.getBlob(id, slot); if (bl) b.assets[id][slot] = await S.toDataURL(bl); } }
          }
          const nm = tid ? A.safeName(DB.tournaments[tid].info.name) : 'tum-turnuvalar';
          A.download(new Blob([JSON.stringify(b, null, 1)], { type: 'application/json' }), `eslestirme-yedek-${nm}-${today()}.json`);
          if (!tid) { DB.lastBackup = Date.now(); DB.dirty = false; A.save({ clean: true }); }
          d.close(); A.toast('Yedek indirildi'); A.render();
        } catch (e) { A.fail(e); }
      };
    });
  };
  ACT.impBackup = () => A.pickFile('.json,application/json', async (f) => {
    if (f.size > S.MAX_JSON) return A.toast('Dosya çok büyük (en fazla 20 MB).');
    let raw, inc;
    try { raw = JSON.parse(await f.text()); inc = M.migrate(raw); } catch (e) { return A.toast('Yedek yüklenemedi: ' + (e instanceof SyntaxError ? 'geçerli bir JSON dosyası değil' : e.message), 6000); }
    const n = Object.keys(inc.tournaments).length;
    A.dialog(`<h3>Yedekten yükle</h3><p><b>${n}</b> turnuva bulundu: ${Object.values(inc.tournaments).slice(0, 6).map(t => esc(t.info.name)).join(', ')}${n > 6 ? '…' : ''}</p>
      <label class="chk"><input type="radio" name="im" value="merge" checked> Birleştir (mevcut turnuvalar korunur)</label>
      <label class="chk"><input type="radio" name="im" value="replace"> Değiştir (mevcut tüm turnuvaların yerine geçer)</label>
      <p class="muted">İşlemden önce otomatik anlık yedek alınır.</p>
      <div class="row tight"><button class="b" id="im_ok">Yükle</button><button class="b sec" data-close>Vazgeç</button></div>`, d => {
      $('#im_ok', d).onclick = async () => {
        const mode = $('input[name=im]:checked', d).value;
        if (mode === 'replace' && !(await A.ask('Mevcut tüm turnuvalar silinip yedektekiler yüklensin mi?', { ok: 'Değiştir', danger: true }))) return;
        await A.snap('içe-aktarma-öncesi');
        const idMap = {};
        if (mode === 'replace') { S.restorePII(inc, DB); inc.prefs = DB.prefs; inc.lastBackup = DB.lastBackup; Object.keys(inc.tournaments).forEach(k => { idMap[k] = k; }); DB = inc; }
        else for (const t of Object.values(inc.tournaments)) { const o = t.id; if (DB.tournaments[o]) t.id = M.uid(); idMap[o] = t.id; DB.tournaments[t.id] = t; }
        if (raw.assets && typeof raw.assets === 'object') for (const [oid, slots] of Object.entries(raw.assets)) {
          if (!idMap[oid] || !slots || typeof slots !== 'object') continue;
          const tn = DB.tournaments[idMap[oid]];
          for (const [slot, url] of Object.entries(slots)) { if (!['header', 'yHeader', 'footer', 'logoL', 'logoR', 'cardBg'].includes(slot)) continue; try { await S.putImage(tn.id, slot, await S.fromDataURL(url)); tn.assets[slot] = true; } catch (e) { /* geçersiz görsel atlanır */ } }
        }
        DB.cur = null; DB.curCat = null; A.save(); d.close(); A.toast(n + ' turnuva yüklendi'); A.go('');
      };
    });
  });
  ACT.snaps = async () => {
    const l = await S.listSnaps();
    A.dialog(`<h3>Anlık yedekler</h3><p class="muted">Önemli işlemlerden önce bu tarayıcıda otomatik alınır (son 5). Tarayıcı verisi silinirse bunlar da silinir.</p>
      ${l.length ? `<table><tr><th>Zaman</th><th>Neden</th><th class="n">KB</th><th></th></tr>${l.map(x => `<tr><td>${esc(new Date(x.at).toLocaleString('tr-TR'))}</td><td>${esc(x.reason)}</td><td class="n">${Math.round(x.size / 1024)}</td><td><button class="b sm sec" data-act="restoreSnap" data-a="${x.id}">Geri yükle</button></td></tr>`).join('')}</table>` : '<div class="note">Henüz anlık yedek yok.</div>'}
      <div class="row tight" style="margin-top:10px"><button class="b sec" data-close>Kapat</button></div>`, d => A.bind(d));
  };
  ACT.restoreSnap = async (el) => {
    if (!(await A.ask('Bu anlık yedek yüklensin mi? Mevcut veriler bunun yerine geçer (önce yeni bir anlık yedek alınır).', { ok: 'Geri yükle', danger: true }))) return;
    const d = await S.getSnap(+el.dataset.a); if (!d) return A.toast('Yedek okunamadı');
    await A.snap('geri-yükleme-öncesi'); DB = M.migrate(d); A.save(); $('#dlg').open && $('#dlg').close(); A.toast('Anlık yedek yüklendi'); A.go('');
  };
  const fsCb = { cur: () => DB, set: (d) => { S.restorePII(d, DB); DB = d; S.save(DB); A.toast('Veritabanı dosyasından yüklendi'); } };
  ACT.newDb = async () => { try { await S.fsBind(await window.showSaveFilePicker({ ...S.pickOpts, suggestedName: 'eslestirme-veritabani.json' })); await S.fsWrite(DB); A.render(); A.toast('Dosya bağlandı'); } catch (e) { if (e.name !== 'AbortError') A.fail(e); } };
  ACT.openDb = async () => {
    try {
      const [h] = await window.showOpenFilePicker(S.pickOpts); await h.requestPermission({ mode: 'readwrite' }); await S.fsBind(h); const d = await S.fsRead();
      if (d && !(await A.ask('Dosyadaki turnuvalar yüklensin mi? (Bu tarayıcıdaki mevcut kayıtların yerine geçer)', { ok: 'Yükle' }))) { await S.fsUnlink(); return A.render(); }
      if (d) { await A.snap('dosya-yükleme-öncesi'); S.restorePII(d, DB); DB = d; A.save(); } else await S.fsWrite(DB);
      A.render();
    } catch (e) { if (e.name !== 'AbortError') A.fail(e); }
  };
  ACT.reDb = async () => { try { if (await S.F.handle.requestPermission({ mode: 'readwrite' }) === 'granted') { await S.fsSync(fsCb); A.render(); } } catch (e) { A.toast('İzin verilmedi'); } };
  ACT.saveNow = async () => { try { await S.fsWrite(DB); A.render(); A.toast('Dosyaya yazıldı'); } catch (e) { A.toast('Yazılamadı'); } };
  ACT.unlinkDb = async () => { await S.fsUnlink(); A.render(); };

  /* ============================================================= ARŞİV */
  let archF = 'all', archQ = '';
  function vArsiv() {
    let l = sorted().filter(t => t.status !== 'aktif');
    const counts = { all: l.length, tamamlandi: l.filter(t => t.status === 'tamamlandi').length, arsiv: l.filter(t => t.status === 'arsiv').length };
    if (archF !== 'all') l = l.filter(t => t.status === archF);
    if (archQ) { const q = archQ.toLocaleLowerCase('tr'); l = l.filter(t => (t.info.name + ' ' + t.info.place).toLocaleLowerCase('tr').includes(q)); }
    const chip = (k, lb) => `<button class="b sm ${archF === k ? '' : 'sec'}" data-act="archF" data-a="${k}">${lb} (${counts[k]})</button>`;
    return `<h2>Arşiv</h2><div class="card noprint"><div class="row" style="align-items:center">${chip('all', 'Tümü')}${chip('tamamlandi', 'Tamamlandı')}${chip('arsiv', 'Arşiv')}
      <div style="flex:1 1 200px"><input type="search" placeholder="Turnuva ara…" value="${esc(archQ)}" data-act="archQ" aria-label="Turnuva ara"></div></div>
      <p class="muted" style="margin:8px 0 0">Tamamlanan veya arşive taşınan turnuvalar burada listelenir. Aktif turnuvalar Ana sayfadadır.</p></div>
      ${l.length ? l.map(tn => `<div class="card acard"><div class="ac-main"><h3 style="margin:0">${esc(tn.info.name)} ${statusPill(tn)}</h3>
        <div class="muted">${esc(fmtDate(tn.info.date)) || 'tarih yok'}${tn.info.place ? ' · ' + esc(tn.info.place) : ''}</div>
        <div class="ac-meta"><span><b>${tn.cats.length}</b> kategori</span><span><b>${M.countPlayers(tn)}</b> sporcu</span></div>
        <div class="chips">${tn.cats.map(catLine).join('')}</div></div>
        <div class="ac-act"><a class="b" href="#/t/${tn.id}">Aç</a><button class="b sec" data-act="backup" data-a="${tn.id}">Yedek indir</button>
        ${tn.status === 'tamamlandi' ? `<button class="b sec" data-act="setSt" data-a="${tn.id}|arsiv">Arşive taşı</button>` : `<button class="b sec" data-act="setSt" data-a="${tn.id}|aktif">Arşivden çıkar</button>`}
        <button class="b red" data-act="delT" data-a="${tn.id}">Sil</button></div></div>`).join('') :
      `<div class="empty board"><div><h3>${archQ || archF !== 'all' ? 'Sonuç bulunamadı' : 'Arşiv boş'}</h3><p class="muted">Bir turnuvayı “Tamamlandı” yaptığınızda veya arşive taşıdığınızda burada görünür.</p></div></div>`}`;
  }
  ACT.archF = (el) => { archF = el.dataset.a; A.render(); };
  ACT.archQ = (el) => { archQ = el.value.trim(); A.render(); const i = $('input[type=search]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } };

  /* Akış şeridi: turnuva kurulumundan çapraz tabloya adım adım */
  const FLOW = ['Turnuva bilgisi', 'Sporcular', 'Kategoriler', 'Özet / oluştur', 'Tur ve zaman bilgileri', 'Kategori / tur başlat', 'Eşlendirme ve sonuç', 'Sıralama', 'Çapraz tablo'];
  A.flowBar = (cur) => `<ol class="flow noprint" aria-label="Akış">${FLOW.map((l, i) => `<li class="${i + 1 === cur ? 'on' : i + 1 < cur ? 'done' : ''}">${l}</li>`).join('')}</ol>`;
  /* ============================================================= SİHİRBAZ */
  let W = null;
  function wizReset() {
    const d = today();
    W = { step: 1, info: { name: '', date: d, dateEnd: '', place: '', arbiter: '', tempo: '35+30', refYear: yearOf(d) }, refManual: false, src: null, wb: null, raw: [], manual: [],
      ageGroups: [], copy: false, stay: new Set(), names: {}, off: new Set(), merges: [], extra: [], lastCat: '' };
  }
  const wizPlayers = () => W.raw.concat(W.manual);
  function wizCats() {
    const cz = M.categorize(wizPlayers(), { refYear: W.info.refYear, ageMaxes: W.ageGroups, copy: W.copy, stay: W.stay });
    let cats = cz.cats;
    W.merges.forEach((m, i) => {
      const hit = cats.filter(c => m.keys.includes(c.key)); if (hit.length < 2) return;
      const seen = new Set(), ps = []; hit.forEach(c => c.players.forEach(p => { if (!seen.has(p.id)) { seen.add(p.id); ps.push(p); } }));
      const first = cats.indexOf(hit[0]); cats = cats.filter(c => !hit.includes(c)); cats.splice(Math.min(first, cats.length), 0, { key: 'm:' + i, name: m.name, short: M.shortOf(m.name), kind: 'custom', ageMax: null, players: ps });
    });
    W.extra.forEach((n, i) => cats.push({ key: 'x:' + i, name: n, short: M.shortOf(n), kind: 'custom', ageMax: null, players: [] }));
    return { cats, noBirth: cz.noBirth };
  }
  const wName = (c) => (W.names[c.key] != null ? W.names[c.key] : c.name);
  const wizHasData = () => !!(W && (W.raw.length || W.manual.length || W.info.name.trim() || W.src));
  ACT.wiDrop = async () => { if (!(await A.ask('Yarım kalan turnuva taslağı (yüklenen Excel, eklenen sporcular, ayarlar) silinsin mi?', { ok: 'Taslağı sil', danger: true }))) return; W = null; A.render(); };
  ACT.wiRestart = async () => { if (!(await A.ask('Sihirbaz baştan başlasın mı? Yüklenen Excel ve eklenen sporcular silinir.', { ok: 'Baştan başla', danger: true }))) return; W = null; A.render(); };
  function vWizard() {
    const resumed = wizHasData() && (W.step > 1 || W.raw.length || W.manual.length);
    if (!W) wizReset();
    const steps = ['Bilgi', 'Sporcular', 'Kategoriler', 'Özet'];
    let h = `<h2>Yeni turnuva</h2>${resumed ? '<div class="note info bn"><span>Yarım kalan turnuva taslağınız devam ediyor.</span><button class="b sm sec" data-act="wiRestart">Baştan başla</button></div>' : ''}${A.flowBar(W.step)}`;
    h += [wiStep1, wiStep2, wiStep3, wiStep4][W.step - 1]();
    return h;
  }
  const wnav = (back, next, nextLabel, disabled) => `<div class="row tight wnav"><button class="b sec" data-act="wiGo" data-a="${back}">${back ? '← Geri' : 'Vazgeç'}</button>${next ? `<button class="b" data-act="wiGo" data-a="${next}" ${disabled ? 'disabled' : ''}>${nextLabel || 'İleri →'}</button>` : ''}</div>`;
  function wiStep1() {
    const f = (k, l, ph, type) => `<div><label>${l}</label><input data-act="wi" data-a="${k}" type="${type || 'text'}" value="${esc(W.info[k] || '')}" ${ph ? `placeholder="${esc(ph)}"` : ''} maxlength="120"></div>`;
    return `<div class="card"><div class="row frm">${f('name', 'Turnuva adı *', 'Örn. 3. Mübin Boysan Anma Turnuvası')}${f('date', 'Başlama tarihi', '', 'date')}${f('dateEnd', 'Bitiş tarihi', '', 'date')}</div>
      <div class="row frm" style="margin-top:10px">${f('place', 'Yer', 'Rize')}${f('arbiter', 'Başhakem')}${f('tempo', 'Zaman kontrolü', '35+30')}
      <div><label>Yaş hesabı yılı</label><input type="number" data-act="wi" data-a="refYear" min="1990" max="2100" value="${W.info.refYear}"><small class="muted">Yaş = bu yıl − doğum yılı</small></div></div><div class="note info">Başlama / bitiş tarihi ve zaman kontrolü, kategorilerin <b>Tur ve zaman bilgileri</b> sayfasına otomatik taşınır (1. tur 10:00, turlar arası 150 dk).</div></div>${wnav(0, 2, 'İleri →')}`;
  }
  ACT.wi = (el) => {
    const k = el.dataset.a; let v = el.value.trim();
    if (k === 'refYear') { W.info.refYear = Math.max(1990, Math.min(2100, +v || yearOf(W.info.date))); W.refManual = true; }
    else { W.info[k] = v; if (k === 'date' && !W.refManual && v) { W.info.refYear = yearOf(v); A.render(); } }
  };
  ACT.wiGo = (el) => {
    const to = +el.dataset.a;
    if (!to) { W = null; return A.go(''); }
    if (W.step === 1 && to > 1 && !W.info.name.trim()) return A.toast('Turnuva adı girin.');
    W.step = to; A.render(); window.scrollTo(0, 0);
  };
  function issues(list, cls) { return list.length ? `<details class="iss ${cls}"><summary>${list.length} ${cls === 'err' ? 'hata' : 'uyarı'}</summary><ul>${list.slice(0, 60).map(x => `<li>${esc(x)}</li>`).join('')}${list.length > 60 ? `<li>… ${list.length - 60} satır daha</li>` : ''}</ul></details>` : ''; }
  function wiStep2() {
    const s = W.src;
    let h = `<div class="card"><h3>1) Sporcu kayıt Excel’i <small class="muted">(standart şablon)</small></h3>
      <p class="muted" style="margin-top:0">Sütun başlıkları standart şablondaki gibi olmalıdır. <button class="b sm sec" data-act="tplBlank">Şablonu indir (.xlsx)</button></p>
      <label class="drop" data-drop="wiFile"><input type="file" data-act="wiFile" accept=".xlsx,.xls,.csv" hidden><b>Excel dosyasını buraya bırakın</b><span>veya dokunup seçin (.xlsx, .xls, .csv · en çok 5 MB)</span></label>`;
    if (s) {
      h += `<div class="note ${s.res.errors.length && !s.res.players.length ? 'err' : 'ok'}"><b>${esc(s.name)}</b> <span class="pill ${s.res.info.mode === 'sablon' ? '' : 'warn'}">${s.res.info.mode === 'sablon' ? 'şablon biçimi' : 'tahmini eşleme'}</span>${s.sheets.length > 1 ? ` · sayfa: <select data-act="wiSheet" style="width:auto;display:inline-block">${s.sheets.map(n => `<option ${n === s.sheet ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>` : ''}<br>${s.res.info.rows} satır okundu · ${s.res.players.length} sporcu alındı · ${s.res.errors.length} hata · ${s.res.warnings.length} uyarı
        <button class="b sm sec" data-act="wiClear" style="margin-left:8px">Dosyayı kaldır</button></div>${issues(s.res.errors, 'err')}${issues(s.res.warnings, 'warn')}`;
    }
    h += `</div><div class="card"><h3>2) Elle sporcu ekle</h3>
      <div style="margin-bottom:8px"><label>Kategori (Gr)</label><input id="m_gr" list="grs" value="${esc(W.lastCat)}" placeholder="Örn. A KATEGORİSİ" maxlength="40"><datalist id="grs">${[...new Set(wizPlayers().map(p => p.src.gr).filter(Boolean))].map(g => `<option value="${esc(g)}">`).join('')}</datalist></div>
      ${A.pForm({}, 'm_')}
      <div style="margin-top:10px"><button class="b" data-act="wiAdd">+ Sporcuyu ekle</button></div>
      ${W.manual.length ? `<div class="tblw" style="margin-top:10px;max-height:260px"><table><tr><th>Ad Soyad</th><th>Kategori</th><th class="n">UKD</th><th>Doğum</th><th></th></tr>${W.manual.map(p => `<tr><td>${esc(p.ad)} ${esc(p.soyad)}</td><td>${esc(p.src.gr)}</td><td class="n">${p.rating || ''}</td><td>${esc(fmtDate(p.birthDate))}</td><td><button class="b sm red" data-act="wiRm" data-a="${p.id}" aria-label="Kaldır">✕</button></td></tr>`).join('')}</table></div>` : ''}</div>
      <p class="muted">Excel yüklemeden, sporcu eklemeden de devam edebilirsiniz (boş kategorilerle başlanır).</p>`;
    return h + wnav(1, 3, 'İleri →');
  }
  async function readWizFile(f, sheetName) {
    if (f.size > I.LIMITS.bytes) throw new Error(`Dosya çok büyük (${(f.size / 1048576).toFixed(1)} MB). En fazla 5 MB.`);
    let wb = W.wb;
    if (!sheetName) { wb = I.readWorkbook(XLSX, await f.arrayBuffer(), f.size); W.wb = wb; W.file = f; }
    const tryOrder = sheetName ? [sheetName] : wb.SheetNames;
    const pass = (loose) => { let res = null, used = null; for (const sn of tryOrder) { const r = I.parseRegistration(I.sheetRows(XLSX, wb.Sheets[sn]), { maxYear: new Date().getFullYear(), loose }); if (!res || (r.players.length > res.players.length)) { res = r; used = sn; } if (r.players.length) break; } return { res, used }; };
    let { res, used } = pass(false);
    if (res.notTemplate) {   // şablon başlıkları yok: net uyarı, yalnız onayla tahmini eşleme
      const ok = await A.ask(res.warnings[0] + '.\n\nBu dosya şablon biçiminde değil. Sütunları adlarına göre tahmin ederek yüklemek ister misiniz? (Önizlemeyi kontrol edin; şablonu “Şablonu indir” ile alabilirsiniz.)', { title: 'Şablon biçimi bulunamadı', ok: 'Tahmini eşleme ile yükle' });
      if (!ok) { W.src = null; W.wb = null; W.raw = []; return; }
      ({ res, used } = pass(true));
    }
    W.raw = res.players; W.raw.forEach(p => { p.id = M.uid(); p.kisiId = p.id; });
    W.src = { name: (W.file && W.file.name) || 'dosya', sheet: used, sheets: wb.SheetNames, res };
    W.stay = new Set(); W.names = {}; W.off = new Set(); W.merges = [];
    if (res.errors.length && !res.players.length) A.toast(res.errors[0], 6000);
  }
  ACT.wiFile = async (el) => { const f = el.files && el.files[0]; if (!f) return; try { await readWizFile(f); } catch (e) { A.toast(e.message, 6000); } A.render(); };
  ACT.wiSheet = async (el) => { try { await readWizFile(W.file, el.value); } catch (e) { A.toast(e.message); } A.render(); };
  ACT.wiClear = () => { W.src = null; W.wb = null; W.raw = []; W.stay = new Set(); A.render(); };
  ACT.wiRm = (el) => { W.manual = W.manual.filter(p => p.id !== el.dataset.a); A.render(); };
  ACT.wiAdd = () => {
    const root = $('#app'), id = M.uid(), p = A.readForm(root, { id, kisiId: id }, 'm_');
    if (!p.ad && !p.soyad) return A.toast('Ad veya soyad girin.');
    W.lastCat = $('#m_gr').value.trim();
    W.manual.push(Object.assign(M.newPlayer(Object.assign(p, { id })), { src: { gr: W.lastCat || 'KATEGORİ 1', row: 0 } }));
    A.render(); const i = $('#m_ad'); if (i) i.focus();
  };

  function wiStep3() {
    const { cats, noBirth } = wizCats();
    const rows = cats.map(c => {
      const sug = R.suggestRounds(c.players.length), on = !W.off.has(c.key);
      const grc = {}; c.players.forEach(p => { const k = M.shortOf(p.src.gr) || p.src.gr || '?'; grc[k] = (grc[k] || 0) + 1; });
      const detail = c.kind === 'age' ? Object.entries(grc).map(([k, v]) => `${esc(k)}:${v}`).join(' ') : '';
      return `<tr class="${on ? '' : 'off'}"><td><input type="checkbox" data-act="wiOn" data-a="${esc(c.key)}" ${on ? 'checked' : ''} aria-label="Oluşturulsun"></td>
        <td><input value="${esc(wName(c))}" data-act="wiName" data-a="${esc(c.key)}" maxlength="40" aria-label="Kategori adı"> ${c.kind === 'age' ? `<small class="muted">${c.ageMax} yaş ve altı · doğum yılı ≥ ${R.ageMinBirthYear(W.info.refYear, c.ageMax)}</small>` : ''}</td>
        <td class="n"><b>${c.players.length}</b></td><td>${sug.system === 'swiss' ? 'İsviçre' : sug.system === 'berger' ? 'Berger' : '—'}</td><td class="n">${sug.rounds != null ? sug.rounds : (c.players.length >= 129 ? '<span class="pill warn">elle</span>' : '—')}</td>
        <td class="muted">${detail}</td><td><input type="checkbox" class="mg" data-key="${esc(c.key)}" aria-label="Birleştirmek için seç"></td></tr>`;
    }).join('');
    let h = `<div class="card"><h3>Kategoriler</h3>
      ${W.src ? '<p class="muted" style="margin-top:0">Kategoriler Excel’deki <b>Gr</b> sütununa göre oluşturuldu. Adı değiştirebilir, kategoriyi kapatabilir veya birleştirebilirsiniz.</p>' : ''}
      <div class="tblw"><table class="cats"><tr><th></th><th>Kategori</th><th class="n">Sporcu</th><th>Sistem</th><th class="n">Tur (öneri)</th><th>Dağılım</th><th title="Birleştir">⇄</th></tr>${rows || '<tr><td colspan="7" class="muted">Henüz kategori yok. Aşağıdan boş kategori ekleyin veya geri dönüp sporcu ekleyin.</td></tr>'}</table></div>
      <div class="row tight" style="margin-top:8px"><button class="b sm sec" data-act="wiMerge">Seçilenleri birleştir</button>${W.merges.length ? '<button class="b sm sec" data-act="wiUnmerge">Birleştirmeleri geri al</button>' : ''}</div>
      ${W.extra.length || !cats.length ? '' : ''}
      <div class="row" style="margin-top:10px;align-items:flex-end"><div><label>Boş kategori ekle</label><input id="wx_name" placeholder="Örn. KIZLAR" maxlength="40"></div><div style="flex:0 0 auto"><button class="b sec" data-act="wiExtra">Ekle</button></div></div></div>
      <div class="card"><h3>Yaş kategorisi ekle <small class="muted">(8 yaş ve altı, 10 yaş ve altı…)</small></h3>
      <div class="row" style="align-items:flex-end"><div><label>Yaş sınırı (N yaş ve altı)</label><input id="wa_max" type="number" min="4" max="30" placeholder="8"></div>
        <div><label>Referans yıl</label><input id="wa_ref" type="number" value="${W.info.refYear}"></div>
        <div style="flex:0 0 auto"><button class="b" data-act="wiAge">+ Ekle</button></div></div>
      <label class="chk" style="margin-top:8px"><input type="checkbox" data-act="wiCopy" ${W.copy ? 'checked' : ''}> Aynı sporcu birden çok kategoride oynayabilsin <span class="muted">(Gr kategorisinde de kalır; varsayılan kapalı = sporcu en küçük yaş kategorisine <b>taşınır</b>)</span></label>
      ${W.ageGroups.length ? `<div class="chips" style="margin-top:8px">${W.ageGroups.slice().sort((a, b) => a - b).map(m => `<span class="chip">${m} yaş ve altı (doğum yılı ≥ ${R.ageMinBirthYear(W.info.refYear, m)}) <button class="x" data-act="wiAgeRm" data-a="${m}" aria-label="Kaldır">✕</button></span>`).join('')}</div>` : ''}
      ${noBirth && W.ageGroups.length ? `<div class="note">Doğum tarihi olmayan ${noBirth} sporcu yaş kategorilerine girmez.</div>` : ''}
      ${W.ageGroups.length && !W.copy ? wizMoveList(cats) : ''}</div>`;
    const off = cats.filter(c => W.off.has(c.key)).reduce((s, c) => s + c.players.length, 0);
    if (off) h += `<div class="note">Kapatılan kategorilerdeki ${off} sporcu turnuvaya alınmayacak.</div>`;
    return h + wnav(2, 4, 'İleri →');
  }
  function wizMoveList(cats) {
    const age = cats.filter(c => c.kind === 'age' && c.players.length); if (!age.length) return '';
    const stayList = W.stay.size;
    return `<details style="margin-top:10px"><summary>Taşınan sporcular (${age.reduce((s, c) => s + c.players.length, 0)})${stayList ? ` · ${stayList} sporcu Gr’de bırakıldı` : ''}</summary>
      ${age.map(c => `<h4 style="margin:8px 0 4px">${esc(c.name)}</h4><div class="tblw" style="max-height:220px"><table><tr><th>Taşı</th><th>Ad Soyad</th><th>Gr</th><th class="n">Doğum</th></tr>${c.players.map(p => `<tr><td><input type="checkbox" data-act="wiMove" data-a="${p.id}" checked></td><td>${esc(p.ad)} ${esc(p.soyad)}</td><td>${esc(p.src.gr)}</td><td class="n">${p.birthYear}</td></tr>`).join('')}</table></div>`).join('')}
      ${stayList ? `<div class="muted" style="margin-top:6px">Gr’de bırakılan sporcular: ${[...W.stay].map(id => { const p = wizPlayers().find(x => x.id === id); return p ? `<button class="chip" data-act="wiMove" data-a="${p.id}" data-undo="1">${esc(p.ad)} ${esc(p.soyad)} ↶</button>` : ''; }).join(' ')}</div>` : ''}</details>`;
  }
  ACT.wiOn = (el) => { const k = el.dataset.a; if (el.checked) W.off.delete(k); else W.off.add(k); A.render(); };
  ACT.wiName = (el) => { W.names[el.dataset.a] = el.value.trim().slice(0, 40); };
  ACT.wiCopy = (el) => { W.copy = el.checked; A.render(); };
  ACT.wiMove = (el) => { const id = el.dataset.a; if (el.dataset.undo) W.stay.delete(id); else if (!el.checked) W.stay.add(id); else W.stay.delete(id); A.render(); };
  ACT.wiAge = () => {
    const m = Math.round(+$('#wa_max').value), ref = Math.round(+$('#wa_ref').value);
    if (!(m >= 4 && m <= 30)) return A.toast('Yaş sınırı 4 ile 30 arasında olmalı.');
    if (ref >= 1990 && ref <= 2100) W.info.refYear = ref;
    if (W.ageGroups.includes(m)) return A.toast(m + ' yaş ve altı zaten ekli.');
    W.ageGroups.push(m); A.render();
  };
  ACT.wiAgeRm = (el) => { W.ageGroups = W.ageGroups.filter(m => m !== +el.dataset.a); A.render(); };
  ACT.wiExtra = () => { const n = $('#wx_name').value.trim(); if (!n) return A.toast('Kategori adı girin.'); W.extra.push(n.slice(0, 40)); A.render(); };
  ACT.wiMerge = () => {
    const keys = $$('.mg:checked').map(c => c.dataset.key); if (keys.length < 2) return A.toast('Birleştirmek için en az 2 kategori seçin.');
    const nm = 'BİRLEŞİK';
    A.dialog(`<h3>Kategorileri birleştir</h3><label>Yeni kategori adı</label><input id="mg_name" value="${nm}" maxlength="40"><div class="row tight" style="margin-top:12px"><button class="b" id="mg_ok">Birleştir</button><button class="b sec" data-close>Vazgeç</button></div>`,
      d => { $('#mg_ok', d).onclick = () => { W.merges.push({ keys, name: $('#mg_name', d).value.trim() || nm }); d.close(); A.render(); }; });
  };
  ACT.wiUnmerge = () => { W.merges = []; A.render(); };
  function wizFinal() {
    const { cats } = wizCats();
    const kept = cats.filter(c => !W.off.has(c.key));
    return { kept, excluded: cats.filter(c => W.off.has(c.key)).reduce((s, c) => s + c.players.length, 0) };
  }
  function wiStep4() {
    const { kept, excluded } = wizFinal();
    const tot = kept.reduce((s, c) => s + c.players.length, 0);
    return `<div class="card"><h3>${esc(W.info.name)}</h3><div class="muted">${esc(fmtDate(W.info.date))}${W.info.place ? ' · ' + esc(W.info.place) : ''}</div>
      <div class="stats" style="margin:10px 0"><div><b>${kept.length}</b><small>Kategori</small></div><div><b>${tot}</b><small>Sporcu kaydı</small></div></div>
      <table><tr><th>Kategori</th><th class="n">Sporcu</th><th>Sistem</th><th class="n">Tur</th></tr>${kept.map(c => { const s = R.suggestRounds(c.players.length); return `<tr><td>${esc(wName(c))}</td><td class="n">${c.players.length}</td><td>${s.system === 'swiss' ? 'İsviçre' : s.system === 'berger' ? 'Berger' : '—'}</td><td class="n">${s.rounds != null ? s.rounds : '<span class="pill warn">elle girilecek</span>'}</td></tr>`; }).join('')}</table>
      ${excluded ? `<div class="note">${excluded} sporcu (kapatılan kategoriler) alınmayacak.</div>` : ''}
      <div class="note info">Tur sayıları öneridir; turnuva sayfasında her kategori için değiştirebilirsiniz.</div></div>
      ${wnav(3, 0)}<div class="row tight" style="margin-top:-6px"><button class="b big" data-act="wiCreate" ${kept.length ? '' : 'disabled'}>✔ Turnuvayı oluştur</button></div>`;
  }
  ACT.wiCreate = async () => {
    const { kept } = wizFinal(); if (!kept.length) return A.toast('En az bir kategori gerekli.');
    const info = Object.assign({}, W.info, { name: W.info.name.trim() });
    const tn = M.newTournament(info);
    M.addCategoriesTo(tn, kept.map(c => ({ name: wName(c) || c.name, short: c.short, kind: c.kind, ageMax: c.ageMax, refYear: c.refYear || W.info.refYear, players: c.players })));
    DB.tournaments[tn.id] = tn; DB.cur = tn.id; DB.curCat = tn.cats[0].id;
    A.save(); A.snap('sihirbaz-sonu'); W = null;
    A.toast(`Turnuva oluşturuldu: ${tn.cats.length} kategori, ${M.countPlayers(tn)} sporcu`);
    A.go(A.tnPath(tn, tn.cats[0].id, 'spor'));
  };

  /* ============================================================= TURNUVA ÇERÇEVESİ */
  const TABS = [['spor', 'Sporcular'], ['ayar', 'Tur ve zaman bilgileri'], ['rounds', 'Eşlendirme ve sonuç'], ['stand', 'Sıralama'], ['cross', 'Çapraz Tablo']];
  const FLOWSTEP = { spor: 2, ayar: 5, rounds: 7, stand: 8, cross: 9 };
  function vTournament(ctx) {
    const { tn, cat } = ctx;
    if (!tn) return '<div class="note">Turnuva bulunamadı.</div>';
    if (!R_.cid) { setTimeout(() => A.go(tn.cats[0] ? A.tnPath(tn, tn.cats[0].id, 'spor') : A.tnPath(tn, 'ayarlar')), 0); return ''; }
    const ro = tn.status === 'arsiv';
    let h = `${ro ? `<div class="note bn"><span><b>Arşivdeki turnuva:</b> salt okunur görünüm.</span><button class="b sm" data-act="unarchive">Arşivden çıkar</button></div>` : ''}
      <div class="thead noprint"><div><h2 style="margin:0">${esc(tn.info.name)} ${statusPill(tn)}</h2><div class="muted">${esc(fmtDate(tn.info.date))}${tn.info.place ? ' · ' + esc(tn.info.place) : ''}</div></div>
      <div class="row tight"><a class="b sec sm" href="#/kayit/${tn.id}">Kayıt Kontrol</a><a class="b sec sm" href="#/kart/${tn.id}">Kartlar</a><a class="b sec sm" href="#/sorgu/${tn.id}">UKD/ELO</a><a class="b ${R_.cid === 'ayarlar' ? '' : 'sec'} sm" href="#/t/${tn.id}/ayarlar">⚙ Ayarlar</a></div></div>
      <div class="cattabs noprint" role="tablist">${tn.cats.map(c => `<a role="tab" class="ctab ${cat && c.id === cat.id && R_.cid !== 'ayarlar' ? 'on' : ''}" href="#/t/${tn.id}/${c.id}/${R_.tab || 'spor'}">${esc(c.name)} <span>${c.players.length}</span></a>`).join('')}
        <button class="ctab add" data-act="addCat">+ Kategori</button></div>`;
    if (R_.cid === 'ayarlar') return h + vTnSettings(tn);
    if (!cat) return h + '<div class="note">Bu turnuvada henüz kategori yok. “+ Kategori” ile ekleyin.</div>';
    h += A.flowBar(cat.started && R_.tab === 'ayar' ? 6 : (FLOWSTEP[R_.tab] || 2));
    h += `<div class="subtabs noprint">${TABS.map(([k, l]) => `<a class="${R_.tab === k ? 'on' : ''}" href="#/t/${tn.id}/${cat.id}/${k}">${l}</a>`).join('')}</div>`;
    const v = A.views.cat;
    return h + (v ? v(R_.tab, tn, cat) : '<div class="note err">Modül yüklenemedi.</div>');
  }
  A.stampCat = (cat) => `<span class="muted noprint">${esc(cat.name)}</span>`;

  function vTnSettings(tn) {
    const inf = (k, label, ph, type) => `<div><label>${label}</label><input data-act="info" data-a="${k}" type="${type || 'text'}" value="${esc(tn.info[k] == null ? '' : tn.info[k])}" ${ph ? `placeholder="${esc(ph)}"` : ''} maxlength="150"></div>`;
    return `<h2>Turnuva ayarları</h2><div class="card">
      <div class="row frm">${inf('name', 'Turnuva adı')}${inf('date', 'Başlama tarihi', '', 'date')}${inf('dateEnd', 'Bitiş tarihi', '', 'date')}</div>
      <div class="row frm" style="margin-top:10px">${inf('place', 'Yer')}${inf('organizer', 'Organizatör(ler)')}${inf('tempo', 'Zaman kontrolü', '35+30')}${inf('federation', 'Federasyon', 'TUR')}</div>
      <div class="row" style="margin-top:10px">${inf('director', 'Turnuva direktörü')}${inf('arbiter', 'Başhakem')}${inf('deputy', 'Başhakem yardımcısı')}${inf('referees', 'Hakemler')}</div>
      <div class="row" style="margin-top:10px">${inf('web', 'İnternet sayfası')}${inf('email', 'E-posta')}<div><label>Yaş hesabı yılı</label><input type="number" data-act="info" data-a="refYear" value="${tn.info.refYear || yearOf(tn.info.date)}" min="1990" max="2100"></div></div></div>
      <h2>Kategoriler</h2><div class="card"><table><tr><th>Kategori</th><th class="n">Sporcu</th><th class="n">Tur</th><th>Durum</th><th></th></tr>
      ${tn.cats.map(c => `<tr><td><input value="${esc(c.name)}" data-act="catName" data-a="${c.id}" maxlength="40" aria-label="Kategori adı"></td><td class="n">${c.players.length}</td><td class="n">${M.totalRounds(c) || '—'}</td><td>${c.started ? (M.completedRounds(c) >= M.totalRounds(c) && M.totalRounds(c) ? 'bitti' : M.completedRounds(c) + '. tur bitti') : 'başlamadı'}</td>
        <td style="text-align:right"><button class="b sm red" data-act="delCat" data-a="${c.id}" ${M.canDelete(c) ? '' : 'disabled title="Eşleştirmesi yapılmış kategori silinemez"'}>Sil</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Kategori yok</td></tr>'}</table>
      <div style="margin-top:10px"><button class="b" data-act="addCat">+ Kategori ekle</button></div></div>
      <h2>Durum</h2><div class="card"><p style="margin-top:0">Durum: ${statusPill(tn)} ${M.allDone(tn) && tn.status === 'aktif' ? '<span class="pill">tüm kategoriler bitti</span>' : ''}</p>
      <div class="row tight"><button class="b sec" data-act="setSt" data-a="${tn.id}|tamamlandi" ${tn.status === 'tamamlandi' ? 'disabled' : ''}>Tamamlandı olarak işaretle</button>
      <button class="b sec" data-act="setSt" data-a="${tn.id}|arsiv" ${tn.status === 'arsiv' ? 'disabled' : ''}>Arşive taşı</button><button class="b sec" data-act="backup" data-a="${tn.id}">Yedek indir</button><button class="b red" data-act="delT" data-a="${tn.id}">Turnuvayı sil…</button></div></div>`;
  }
  ACT.info = A.mut((el) => {
    const { tn } = A.ctx(); const k = el.dataset.a; let v = el.value.trim();
    if (k === 'refYear') v = Math.max(1990, Math.min(2100, +v || yearOf(tn.info.date)));
    if (k === 'name' && !v) { A.toast('Turnuva adı boş olamaz.'); return A.render(); }
    tn.info[k] = v; A.save(); if (k === 'name') $('#tName').textContent = v;
  });
  ACT.catName = A.mut((el) => { const { tn } = A.ctx(); const c = tn.cats.find(x => x.id === el.dataset.a); const n = M.uniqueName(tn, el.value, c.id); c.name = n; c.short = M.shortOf(n); A.save(); A.render(); });
  ACT.delCat = A.mut(async (el) => {
    const { tn } = A.ctx(); const c = tn.cats.find(x => x.id === el.dataset.a);
    if (!(await A.ask(`“${c.name}” kategorisi${c.players.length ? ' ve içindeki ' + c.players.length + ' sporcu' : ''} silinsin mi?`, { ok: 'Sil', danger: true }))) return;
    await A.snap('kategori-silme'); M.deleteCategory(tn, c.id); A.save(); if (DB.curCat === c.id) DB.curCat = null; A.toast('Kategori silindi'); A.go(A.tnPath(tn, 'ayarlar'));
  });
  ACT.addCat = A.mut(() => {
    const { tn } = A.ctx();
    A.dialog(`<h3>Kategori ekle</h3><label>Kategori adı</label><input id="ac_name" maxlength="40" placeholder="Örn. 12 YAŞ VE ALTI">
      <div class="row" style="margin-top:8px"><div><label>Yaş sınırı (isteğe bağlı)</label><input id="ac_max" type="number" min="4" max="30" placeholder="12"></div><div><label>Referans yıl</label><input id="ac_ref" type="number" value="${tn.info.refYear || yearOf(tn.info.date)}"></div></div>
      <label class="chk" style="margin-top:8px"><input type="checkbox" id="ac_pull" checked> Yaşa uyan sporcuları diğer kategorilerden getir <span class="muted">(yalnız eşleştirmesi başlamamış kategorilerden)</span></label>
      <label class="chk"><input type="checkbox" id="ac_copy"> Taşımak yerine kopyala</label>
      <div class="row tight" style="margin-top:12px"><button class="b" id="ac_ok">Ekle</button><button class="b sec" data-close>Vazgeç</button></div>`, d => {
      $('#ac_ok', d).onclick = () => {
        const max = Math.round(+$('#ac_max', d).value) || null; const ref = Math.round(+$('#ac_ref', d).value) || yearOf(tn.info.date);
        const name = $('#ac_name', d).value.trim() || (max ? max + ' YAŞ VE ALTI' : 'Yeni kategori');
        const c = M.newCategory(M.uniqueName(tn, name), { kind: max ? 'age' : 'custom', ageMax: max, refYear: ref }); tn.cats.push(c);
        let n = 0; if (max && $('#ac_pull', d).checked) n = M.pullByAge(tn, c, { max, refYear: ref, copy: $('#ac_copy', d).checked });
        A.save(); d.close(); A.toast('Kategori eklendi' + (n ? ` (${n} sporcu getirildi)` : '')); A.go(A.tnPath(tn, c.id, 'spor'));
      };
    });
  });

  /* ------------------------------------------------------------- başlat */
  window.addEventListener('beforeunload', (e) => { if (DB.dirty && Object.keys(DB.tournaments).length && (!DB.lastBackup || Date.now() - DB.lastBackup > 30 * 60000)) { e.preventDefault(); e.returnValue = ''; } });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  S.fsInit(fsCb).then(() => A.render());
  A.render();
})();
