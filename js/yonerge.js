/* Yarışma yönergesi (TSF/İl temsilciliği PDF'i) ayrıştırıcı — saf mantık, DOM yok.
   Girdi: sayfalar [{w, h, items:[{s, x, y, w}]}] (pdf.js getTextContent çıktısından). Çıktı: turnuva bilgileri, kategoriler, tur programı. */
(function (root) {
  'use strict';
  const GAP = 1.5;
  const MONTHS = { ocak: 1, şubat: 2, mart: 3, nisan: 4, mayıs: 5, haziran: 6, temmuz: 7, ağustos: 8, eylül: 9, ekim: 10, kasım: 11, aralık: 12 };
  const tl = (s) => String(s).toLocaleLowerCase('tr'), tu = (s) => String(s).toLocaleUpperCase('tr');
  const p2 = (n) => String(n).padStart(2, '0');
  const iso = (d, m, y) => `${y}-${p2(m)}-${p2(d)}`;
  const title = (s) => String(s).trim().split(/\s+/).map(w => (/\d/.test(w) ? w : w.charAt(0).toLocaleUpperCase('tr') + w.slice(1).toLocaleLowerCase('tr'))).join(' ');
  const hm = (h, m) => `${p2(+h)}:${p2(+m)}`;

  /** Aynı satırdaki parçaları (x'e göre) birleştirir; küçük boşluk = bitişik. */
  function joinRow(its) {
    const a = its.slice().sort((p, q) => p.x - q.x); let out = '', end = null;
    for (const it of a) { if (end != null && it.x - end > GAP) out += ' '; out += it.s; end = it.x + (it.w || 0); }
    return out.replace(/\s+/g, ' ').trim();
  }
  /** y'ye göre satırlara böl (yukarıdan aşağı). */
  function rowsOf(items, tol) {
    tol = tol || 3; const a = items.slice().sort((p, q) => q.y - p.y), out = [];
    for (const it of a) { const r = out.find(o => Math.abs(o.y - it.y) <= tol); if (r) { r.items.push(it); r.y = (r.y * (r.items.length - 1) + it.y) / r.items.length; } else out.push({ y: it.y, items: [it] }); }
    return out.map(r => ({ y: r.y, x: Math.min(...r.items.map(i => i.x)), items: r.items, text: joinRow(r.items) }));
  }
  const dmy = (s) => { const m = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(s || ''); return m ? iso(m[1], m[2], m[3]) : ''; };

  /** Ardışık gruplara bölerek her tarihi kendi satır grubunun ortasına en yakın yap. */
  function splitRows(rows, dates) {
    const n = rows.length, D = dates.length; if (!D || n < D) return null;
    let best = null;
    (function rec(j, from, cuts, cost) {
      if (best && cost >= best.cost) return;
      if (j === D) { if (from === n) best = { cost, cuts: cuts.slice() }; return; }
      const last = j === D - 1;
      for (let e = from + 1; e <= (last ? n : n - (D - j - 1)); e++) {
        if (last && e !== n) continue;
        const g = rows.slice(from, e), mean = g.reduce((s, r) => s + r.y, 0) / g.length;
        cuts.push(e); rec(j + 1, e, cuts, cost + Math.abs(dates[j].y - mean)); cuts.pop();
      }
    })(0, 0, [], 0);
    if (!best) return null;
    const map = []; let from = 0; best.cuts.forEach((e, j) => { for (let i = from; i < e; i++) map[i] = j; from = e; });
    return map;
  }

  function parse(pages) {
    const res = { ok: false, info: {}, cats: [], refYear: null, refOK: false, schedule: null, rounds: null, system: null, extra: {}, warnings: [], found: [] };
    if (!pages || !pages.length || !pages[0].items.length) { res.warnings.push('PDF’den metin okunamadı (taranmış/görüntü PDF olabilir).'); return res; }
    const P = pages[0], mid = (P.w || 595) / 2;
    const all = P.items;

    /* ---- Üst tablo ---- */
    const sec1 = all.find(i => /^1\.$/.test(i.s.trim()) && i.x < 40);
    const hy = sec1 ? sec1.y + 2 : 0;
    const head = rowsOf(all.filter(i => i.y > hy));
    let htxt = ''; const titleRows = [];
    const LABELS = ['İLİ', 'İLÇESİ', 'BAŞLAMA\\s*-\\s*BİTİŞ\\s+TARİHİ', 'YERİ', 'SON\\s+BAŞVURU\\s+TARİHİ', 'SİSTEM', 'DÜŞÜNME\\s+SÜRESİ', 'ORGANİZASYON'];
    const lre = new RegExp('(' + LABELS.join('|') + ')(?=\\s|$)', 'g');
    const firstLabelRow = head.findIndex(r => new RegExp('^(' + LABELS.join('|') + ')').test(r.text));
    head.forEach((r, i) => { if (firstLabelRow < 0 || i < firstLabelRow) titleRows.push(r.text); else htxt += r.text + '\n'; });
    const cells = {}; const hits = []; let m;
    while ((m = lre.exec(htxt))) hits.push({ k: m[1].replace(/\s+/g, ''), i: m.index, e: m.index + m[0].length });
    hits.forEach((h, j) => { cells[h.k] = htxt.slice(h.e, j + 1 < hits.length ? hits[j + 1].i : htxt.length).replace(/\s+/g, ' ').trim(); });
    const cell = (re) => { const k = Object.keys(cells).find(x => re.test(x)); return k ? cells[k] : ''; };

    const ttl = titleRows.join(' ').replace(/\s*(TURNUVA(SI)?\s+)?YÖNERGES[İI].*$/i, (mm) => (/TURNUVASI/i.test(mm) ? ' TURNUVASI' : '')).replace(/\s+/g, ' ').trim();
    if (ttl && (firstLabelRow >= 0 || /YÖNERGES/i.test(titleRows.join(' ')))) { res.info.name = title(ttl); res.found.push('Turnuva adı'); }
    const dt = cell(/BAŞLAMA/);
    const dm = /(\d{1,2}\.\d{1,2}\.\d{4})\s*[–—-]\s*(\d{1,2}\.\d{1,2}\.\d{4})/.exec(dt) || /(\d{1,2}\.\d{1,2}\.\d{4})/.exec(dt);
    if (dm) { res.info.date = dmy(dm[1]); res.info.dateEnd = dm[2] ? dmy(dm[2]) : ''; res.found.push('Tarih'); }
    const yer = cell(/^YERİ$/); if (yer) { res.info.place = title(yer); res.found.push('Yer'); }
    const il = cell(/^İLİ$/); if (il) res.extra.city = title(il);
    const ilce = cell(/^İLÇESİ$/); if (ilce) res.extra.district = title(ilce);
    const sb = cell(/SONBAŞVURU/), sbm = /(\d{1,2}\.\d{1,2}\.\d{4})\s*(\d{1,2}[.:]\d{2})?/.exec(sb);
    if (sbm) { res.extra.deadline = dmy(sbm[1]) + (sbm[2] ? ' ' + sbm[2].replace('.', ':') : ''); res.found.push('Son başvuru'); }
    const sys = cell(/^SİSTEM$/);
    if (sys) {
      res.system = /İSVİÇRE|ISVICRE|SWISS/i.test(sys) ? 'swiss' : /BERGER|DÖNER|LİG|ROUND/i.test(sys) ? 'berger' : null;
      const rm = /\/\s*(\d+)\s*TUR/i.exec(sys) || /(\d+)\s*TUR/i.exec(sys); if (rm) res.rounds = +rm[1];
      if (res.system) res.found.push('Sistem' + (res.rounds ? ' ve tur sayısı' : ''));
    }
    const ds = cell(/DÜŞÜNME/), tm = /(\d+)\s*DAKİKA\s*\+\s*HAMLE\s+BAŞINA\s*(\d+)\s*SANİYE/i.exec(ds);
    if (tm) { res.info.tempo = `${tm[1]}+${tm[2]}`; res.found.push('Zaman kontrolü'); } else if (ds) { res.info.tempo = ds; res.found.push('Zaman kontrolü'); }
    const org = cell(/^ORGANİZASYON$/); if (org) { res.info.organizer = title(org).replace(/\bGsim\b/g, 'GSİM').replace(/\bİl\b/g, 'İl'); res.found.push('Organizasyon'); }

    /* ---- Gövde (iki sütun): sol sütun sonra sağ sütun ---- */
    const body = []; pages.forEach((pg, pi) => {
      const m2 = (pg.w || 595) / 2, its = pg.items.filter(i => pi > 0 || i.y <= hy);
      const L = rowsOf(its.filter(i => i.x < m2 - 8)), R = rowsOf(its.filter(i => i.x >= m2 - 8));
      L.concat(R).forEach(r => body.push(r.text));
    });
    const flat = body.join('\n').replace(/[ \t]+/g, ' '), flat1 = flat.replace(/\s+/g, ' ');
    const dir = /Yarışma\s+Direktörü\s*:?\s*([^\n]+)/i.exec(flat); if (dir) { res.info.director = dir[1].trim(); res.found.push('Yarışma direktörü'); }
    const ba = /Başhakem\s*:?\s*([^\n]+)/i.exec(flat); if (ba && !/yardımcı/i.test(ba[0])) res.info.arbiter = ba[1].trim();
    const em = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.exec(flat); if (em) { res.info.email = em[0]; res.found.push('E-posta'); }
    const q = /(\d+)\s*sporcu\s+ile\s+sınırlıdır/i.exec(flat1); if (q) { res.extra.quota = +q[1]; res.found.push('Kontenjan'); }
    const fm = /hükmen\s+yenik\s+sayılma\s+süresi\s*(\d+)/i.exec(flat1); if (fm) { res.extra.forfeitMin = +fm[1]; res.found.push('Hükmen süresi'); }
    const aw = /(İlk\s[^.]*?(?:Madalya|Kupa|Plaket|Ödül)[^.]*\.)/.exec(flat1); if (aw) { res.extra.awards = aw[1].replace(/\s+/g, ' ').trim(); res.found.push('Ödüller'); }

    /* ---- Kategoriler (sol sütun tablosu) ---- */
    const left = all.filter(i => i.x < mid - 8 && i.y <= hy);
    const hdr = left.find(i => /^Kategori\s+Adı$/i.test(i.s.trim()));
    const endRow = left.find(i => /^2\.3\.$/.test(i.s.trim()));
    if (hdr) {
      const top = hdr.y - 3, bot = endRow ? endRow.y + 4 : 0;
      const tbl = left.filter(i => i.y < top && i.y > bot);
      const hc = left.find(i => /^Kategori\s+Kriteri$/i.test(i.s.trim())), critX = hc ? (hdr.x + hc.x) / 2 : hdr.x + 60;
      const crit = rowsOf(tbl.filter(i => i.x >= critX));
      const names = rowsOf(tbl.filter(i => i.x < critX));
      const buckets = names.map(r => ({ y: r.y, text: r.text, crit: '' }));
      // aynı kategori adı birden çok satıra yayılabilir ("8 Yaş" + "Kategorisi"): yakın satırları birleştir
      const merged = []; buckets.forEach(b => { const l = merged[merged.length - 1]; if (l && !/kategori/i.test(l.text) && /^kategori/i.test(b.text)) { l.text += ' ' + b.text; } else merged.push(b); });
      crit.forEach(r => { let bi = 0, bd = 1e9; merged.forEach((b, i) => { const d = Math.abs(b.y - r.y); if (d < bd) { bd = d; bi = i; } }); merged[bi].crit += ' ' + r.text; });
      merged.forEach(b => {
        const nm = tu(b.text.replace(/\s*Kategori(si)?\s*$/i, '').trim()); if (!nm) return;
        const age = /(\d+)\s*YAŞ/i.exec(nm), ys = (b.crit.match(/\b(?:19|20)\d{2}\b/g) || []).map(Number);
        res.cats.push({ name: nm, ageMax: age ? +age[1] : null, minYear: ys.length ? Math.min(...ys) : null, maxYear: ys.length ? Math.max(...ys) : null, crit: b.crit.replace(/\s+/g, ' ').trim() });
      });
      if (res.cats.length) res.found.push(res.cats.length + ' kategori');
    }
    const refs = res.cats.filter(c => c.ageMax && c.minYear).map(c => c.minYear + c.ageMax);
    if (refs.length && refs.every(r => r === refs[0]) && refs.length === res.cats.filter(c => c.ageMax).length) { res.refYear = refs[0]; res.refOK = true; }
    else if (res.cats.length) res.warnings.push('Kategorilerin doğum yılı aralıkları “N yaş ve altı” kuralıyla birebir kurulamadı; kategoriler boş açılır, yaşa göre dağıtımı kontrol edin.');

    /* ---- Tur programı (sağ sütun tablosu) ---- */
    const ph = all.find(i => i.x >= mid - 8 && /^TURNUVA\s+PROGRAMI$/i.test(i.s.trim()));
    const cSaat = all.find(i => i.x >= mid - 8 && /^SAAT$/i.test(i.s.trim())), cTar = all.find(i => i.x >= mid - 8 && /^TARİH$/i.test(i.s.trim())), cPrg = all.find(i => i.x >= mid - 8 && /^PROGRAM$/i.test(i.s.trim()));
    if (ph && cSaat && cTar && cPrg) {
      const next = all.find(i => i.x >= mid - 8 && i.y < cSaat.y - 5 && /^\d\.$/.test(i.s.trim()) && i.x < mid + 40);
      const bot = next ? next.y + 2 : 0, rgt = all.filter(i => i.x >= mid - 8 && i.y < cSaat.y - 3 && i.y > bot);
      const b1 = (cTar.x + cSaat.x) / 2, b2 = (cSaat.x + cPrg.x) / 2;
      const dItems = rgt.filter(i => i.x < b1), tItems = rgt.filter(i => i.x >= b1 && i.x < b2), pItems = rgt.filter(i => i.x >= b2);
      const prog = rowsOf(pItems);
      const dates = []; rowsOf(dItems).forEach(r => { const mm = /(\d{1,2})\s+([A-Za-zÇĞİÖŞÜçğıöşü]+)\s+(\d{4})/.exec(r.text); if (mm && MONTHS[tl(mm[2])]) dates.push({ y: r.y, d: iso(mm[1], MONTHS[tl(mm[2])], mm[3]) }); });
      const tRows = rowsOf(tItems);
      prog.forEach(r => { r.time = ''; });
      tRows.slice().sort((a, b) => b.y - a.y).forEach(tr => { let bi = 0, bd = 1e9; prog.forEach((p, i) => { const d = Math.abs(p.y - tr.y); if (d < bd) { bd = d; bi = i; } }); prog[bi].time += (prog[bi].time ? ' ' : '') + tr.text; });
      const dmap = splitRows(prog, dates);
      if (prog.length && dates.length && dmap) {
        const S = { rounds: [], kayit: { d: '', t: '', t2: '' }, teknik: { d: '', t: '' }, odul: { d: '', t: '' }, manual: true };
        const tmx = (s) => { const x = /(\d{1,2})[.:](\d{2})(?:\s*[-–]\s*(\d{1,2})[.:](\d{2}))?/.exec(s || ''); return x ? { t: hm(x[1], x[2]), t2: x[3] != null ? hm(x[3], x[4]) : '' } : null; };
        let maxR = 0;
        prog.forEach((r, i) => {
          const d = dates[dmap[i]].d, t = tmx(r.time), rm = /^(\d+)\.\s*Tur$/i.exec(r.text);
          if (rm && t) { S.rounds[+rm[1] - 1] = { d, t: t.t }; maxR = Math.max(maxR, +rm[1]); }
          else if (/Kay[ıi]t/i.test(r.text) && t) S.kayit = { d, t: t.t, t2: t.t2 };
          else if (/Teknik/i.test(r.text) && t) S.teknik = { d, t: t.t };
          else if (/Ödül/i.test(r.text)) S.odul = { d, t: t ? t.t : '' };
        });
        const gaps = []; for (let i = 0; i < maxR; i++) if (!S.rounds[i]) gaps.push(i + 1);
        if (maxR && !gaps.length) {
          res.schedule = S; res.found.push('Tur programı (' + maxR + ' tur)');
          if (!res.rounds) res.rounds = maxR;
          else if (res.rounds !== maxR) res.warnings.push(`Sistem satırında ${res.rounds} tur, program tablosunda ${maxR} tur var; kontrol edin.`);
        } else res.warnings.push('Tur programı tam okunamadı' + (gaps.length ? ' (eksik turlar: ' + gaps.join(', ') + ')' : '') + '; “Tur ve zaman bilgileri” sayfasından girin.');
      } else res.warnings.push('Tur programı tablosu okunamadı; “Tur ve zaman bilgileri” sayfasından girin.');
    } else res.warnings.push('Tur programı tablosu bulunamadı; “Tur ve zaman bilgileri” sayfasından girin.');

    res.ok = res.found.filter(f => f !== 'Turnuva adı').length >= 2;
    if (!res.ok) res.warnings.push('Bu dosya bir yarışma yönergesine benzemiyor.');
    return res;
  }

  /** Tarayıcı: pdf.js'i (vendor/) tembel yükler, sayfa metin öğelerini çıkarır. */
  function loadPdfJs() {
    if (root.pdfjsLib) return Promise.resolve(root.pdfjsLib);
    return new Promise((ok, no) => {
      const s = document.createElement('script'); s.src = 'vendor/pdf.min.js';
      s.onload = () => { try { root.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js'; ok(root.pdfjsLib); } catch (e) { no(e); } };
      s.onerror = () => no(new Error('PDF okuyucu yüklenemedi (çevrimdışıysanız bir kez internetle açıp tekrar deneyin).'));
      document.head.appendChild(s);
    });
  }
  async function readFile(file) {
    const lib = await loadPdfJs(), buf = new Uint8Array(await file.arrayBuffer());
    const doc = await lib.getDocument({ data: buf, isEvalSupported: false, useSystemFonts: false }).promise, pages = [];
    for (let p = 1; p <= Math.min(doc.numPages, 6); p++) {
      const pg = await doc.getPage(p), vp = pg.getViewport({ scale: 1 }), tc = await pg.getTextContent();
      pages.push({ w: vp.width, h: vp.height, items: tc.items.filter(i => i.str && i.str.trim()).map(i => ({ s: i.str, w: i.width, x: i.transform[4], y: i.transform[5] })) });
    }
    return pages;
  }
  const API = { parse, readFile, joinRow, rowsOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.Yonerge = API;
})(typeof window !== 'undefined' ? window : globalThis);
