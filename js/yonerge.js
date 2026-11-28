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

    /* ---- Paragraf biçimi: "…Rize ili, Merkez ilçesinde, 28.02-01.03.2026 tarihleri arasında, … Salonu'nda, İsviçre sistem ile, 35 dakika 30 saniye eklemeli …" ---- */
    if (!res.info.date) {
      const dr = /(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?\s*[-–—]\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(flat1) || /(\d{1,2})\.(\d{1,2})\.(\d{4})\s*tarihleri/i.exec(flat1);
      if (dr && dr.length > 4) { const y2 = +dr[6], y1 = dr[3] ? +dr[3] : (+dr[2] > +dr[5] ? y2 - 1 : y2); res.info.date = iso(dr[1], dr[2], y1); res.info.dateEnd = iso(dr[4], dr[5], y2); res.found.push('Tarih'); }
      else if (dr) { res.info.date = iso(dr[1], dr[2], dr[3]); res.found.push('Tarih'); }
    }
    if (!res.info.place) {
      const pm = /tarihleri\s+arasında,?\s*([^,]+?)['’]\s*(?:n?[dt][ae])\b/i.exec(flat1);
      if (pm) { res.info.place = pm[1].replace(/\s+/g, ' ').trim(); res.found.push('Yer'); }
      const cm = /,\s*([^,]+?)\s+ili\s*,/i.exec(flat1), dm2 = /,\s*([^,]+?)\s+ilçesinde\s*,/i.exec(flat1);
      if (cm) res.extra.city = cm[1].trim(); if (dm2) res.extra.district = dm2[1].trim();
    }
    if (!res.system) {
      const sm = /(İsviçre|Isviçre|Isvicre|Swiss|Berger)\s+sistem/i.exec(flat1);
      if (sm) { res.system = /berger/i.test(sm[1]) ? 'berger' : 'swiss'; res.found.push('Sistem'); }
    }
    if (!res.info.tempo) {
      const tm2 = /(\d+)\s*dakika\s*(\d+)\s*saniye/i.exec(flat1) || /\b(\d{1,3})\s*\+\s*(\d{1,3})\b/.exec(flat1);
      if (tm2) { res.info.tempo = `${tm2[1]}+${tm2[2]}`; res.found.push('Zaman kontrolü'); }
    }
    if (!res.extra.deadline) {
      const sd = /ba[sş]vuru(?:lar)?[^.]{0,40}?(\d{1,2}\.\d{1,2}\.\d{4})\s*(?:tarihi\s*)?(?:saat\s*)?(\d{1,2}[.:]\d{2})?/i.exec(flat1);
      if (sd) { res.extra.deadline = dmy(sd[1]) + (sd[2] ? ' ' + sd[2].replace('.', ':') : ''); res.found.push('Son başvuru'); }
    }
    if (!res.info.organizer) {
      const om = /\b1\.1\.?\s*(.+?)\s+tarafından/i.exec(flat1);
      if (om && om[1].length < 140) { res.info.organizer = om[1].replace(/\s+/g, ' ').trim(); res.found.push('Organizasyon'); }
    }
    const ph1 = /Telefon[^:]{0,20}:\s*(\+?[\d ()-]{7,20})/i.exec(flat); if (ph1) res.extra.phone = ph1[1].trim();
    /* ---- Kategoriler (tablo; sol ya da sağ sütunda olabilir) ---- */
    const hdr = all.find(i => /^Kategori\s+Ad[ıi]$/i.test(i.s.trim()));
    if (hdr) {
      const hc = all.find(i => /^Kategori\s+Kriteri$/i.test(i.s.trim()) && Math.abs(i.y - hdr.y) < 4 && i.x > hdr.x);
      const inR = hdr.x >= mid - 8, colOK = (i) => (inR ? i.x >= mid - 8 : i.x < mid - 8);
      const col = all.filter(colOK);
      /* tablonun altı: aynı sütunda aşağıdaki ilk madde/başlık numarası ("2.3.", "7.") — tablonun solunda durur */
      const stops = col.filter(i => i.y < hdr.y - 8 && i.x <= hdr.x - 5 && /^\d+(\.\d+)*\.$/.test(i.s.trim()));
      const bot = stops.length ? Math.max(...stops.map(i => i.y)) + 4 : 0, top = hdr.y - 3;
      const tbl = col.filter(i => i.y < top && i.y > bot);
      const critX = hc ? (hdr.x + hc.x) / 2 : hdr.x + 60;
      const crit = rowsOf(tbl.filter(i => i.x >= critX));
      const names = rowsOf(tbl.filter(i => i.x < critX));
      const buckets = names.map(r => ({ y: r.y, text: r.text, crit: '' }));
      // aynı kategori adı birden çok satıra yayılabilir ("8 Yaş" + "Kategorisi"): yakın satırları birleştir
      const merged = []; buckets.forEach(b => { const l = merged[merged.length - 1]; if (l && !/kategori/i.test(l.text) && /^kategori/i.test(b.text)) { l.text += ' ' + b.text; } else merged.push(b); });
      crit.forEach(r => { let bi = 0, bd = 1e9; merged.forEach((b, i) => { const d = Math.abs(b.y - r.y); if (d < bd) { bd = d; bi = i; } }); if (merged[bi]) merged[bi].crit += ' ' + r.text; });
      merged.forEach(b => {
        const nm = tu(b.text.replace(/\s*Kategori(si)?\s*$/i, '').trim()); if (!nm) return;
        const age = /(\d+)\s*YAŞ/i.exec(nm), ys = (b.crit.match(/\b(?:19|20)\d{2}\b/g) || []).map(Number);
        res.cats.push({ name: nm, ageMax: age ? +age[1] : null, minYear: ys.length ? Math.min(...ys) : null, maxYear: ys.length ? Math.max(...ys) : null, crit: b.crit.replace(/\s+/g, ' ').trim() });
      });
      if (res.cats.length) res.found.push(res.cats.length + ' kategori');
    }
    /* Tablo okunamadıysa düz metinden: "8 Yaş ve Altı (2019-2018)" / "10 Yaş ve Altı Kategorisi: 2017-2016 doğumlular" */
    if (!res.cats.length) {
      const re = /(\d{1,2})\s*Yaş(?:\s+ve\s+Altı)?(?:\s+Kategorisi)?\s*[:(–-]?\s*((?:19|20)\d{2})\s*[-–—/]\s*((?:19|20)\d{2})/gi; let mm;
      while ((mm = re.exec(flat1))) { const y1 = +mm[2], y2 = +mm[3]; res.cats.push({ name: tu(mm[1] + ' Yaş' + (/ve\s+Altı/i.test(mm[0]) ? ' ve Altı' : '')), ageMax: +mm[1], minYear: Math.min(y1, y2), maxYear: Math.max(y1, y2), crit: mm[2] + '-' + mm[3] }); }
      if (res.cats.length) { res.found.push(res.cats.length + ' kategori'); res.warnings.push('Kategoriler tablo yerine düz metinden okundu; kontrol edin.'); }
    }
    const refs = res.cats.filter(c => c.ageMax && c.minYear).map(c => c.minYear + c.ageMax);
    if (refs.length && refs.every(r => r === refs[0]) && refs.length === res.cats.filter(c => c.ageMax).length) { res.refYear = refs[0]; res.refOK = true; }
    else if (res.cats.length) res.warnings.push('Kategorilerin doğum yılı aralıkları “N yaş ve altı” kuralıyla birebir kurulamadı; kategoriler boş açılır, yaşa göre dağıtımı kontrol edin.');

    /* ---- Tur programı (tablo; sol ya da sağ sütunda ya da tüm genişlikte olabilir) ---- */
    const ph = all.find(i => /^(\d+\.\s*)?(TURNUVA\s+)?(PROGRAMI|AKIŞI)$/i.test(i.s.trim()) || /TURNUVA\s+PROGRAMI/i.test(i.s));
    const below = (re) => all.filter(i => ph && i.y < ph.y - 3 && i.y > ph.y - 70 && re.test(i.s.trim())).sort((a, b) => b.y - a.y)[0];
    const cTar = below(/^(TARİH|GÜN)$/i), cSaat = below(/^(SAAT|ZAMAN)$/i), cPrg = below(/^(PROGRAM|ETKİNLİK|FAALİYET)$/i);
    if (ph && cSaat && cTar && cPrg) {
      const xs = [cTar.x, cSaat.x, cPrg.x], allL = Math.max(...xs) < mid - 8, allR = Math.min(...xs) >= mid - 8;
      const colOK = (i) => (allL ? i.x < mid - 8 : allR ? i.x >= mid - 8 : true), colHx = Math.min(...xs);
      const next = all.find(i => colOK(i) && i.y < cSaat.y - 5 && /^\d+\.$/.test(i.s.trim()) && i.x <= colHx + 6 && i.x < ph.x + 40);
      const bot = next ? next.y + 2 : 0, rgt = all.filter(i => colOK(i) && i.y < cSaat.y - 3 && i.y > bot);
      const ord = [cTar, cSaat, cPrg].sort((p, q) => p.x - q.x), bnd = [(ord[0].x + ord[1].x) / 2, (ord[1].x + ord[2].x) / 2];
      const colOf = (i) => (i.x < bnd[0] ? ord[0] : i.x < bnd[1] ? ord[1] : ord[2]);
      const dItems = rgt.filter(i => colOf(i) === cTar), tItems = rgt.filter(i => colOf(i) === cSaat), pItems = rgt.filter(i => colOf(i) === cPrg);
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
        } else res.warnings.push('Tur programı tam okunamadı' + (gaps.length ? ' (eksik turlar: ' + gaps.join(', ') + ')' : '') + '; “Kategori ve tur başlat” sayfasından girin.');
      } else res.warnings.push('Tur programı tablosu okunamadı; “Kategori ve tur başlat” sayfasından girin.');
    } else res.warnings.push('Tur programı tablosu bulunamadı; “Kategori ve tur başlat” sayfasından girin.');

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
