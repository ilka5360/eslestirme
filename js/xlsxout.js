/* Kayıt Kontrol Excel'i (xlsx-js-style ile biçimli) — saf mantık, XLSX parametre. */
(function (root) {
  'use strict';
  const collator = new Intl.Collator('tr');
  const BAD = /[\[\]:*?\/\\]/g;
  function sheetName(name, used) {
    let n = String(name || 'Kategori').replace(BAD, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Kategori';
    let k = 2, base = n;
    while (used.has(n.toLocaleLowerCase('tr'))) { const suf = ' ' + (k++); n = base.slice(0, 31 - suf.length) + suf; }
    used.add(n.toLocaleLowerCase('tr')); return n;
  }
  const kkTitle = (name) => String(name).replace(/KATEGORİSİ$/i, 'KATEGORİ');
  const PHONE_FMT = '[<=9999999]###\\-####;\\(###\\)\\ ###\\-####';
  const thin = { style: 'thin', color: { rgb: '000000' } };
  const BORDER = { top: thin, bottom: thin, left: thin, right: thin };

  /** cats: [{name, short, players}] ; o: {header:false, blank:0, phone:true, includeWithdrawn:true} */
  function buildKayitKontrol(X, cats, o) {
    o = o || {};
    const wb = X.utils.book_new(), used = new Set();
    for (const c of cats) {
      const ps = c.players.filter(p => o.withdrawn || p.status !== 'withdrawn').slice().sort((a, b) => collator.compare(a.ad, b.ad) || collator.compare(a.soyad, b.soyad));
      const font = (sz, b) => ({ name: 'Calibri', sz, bold: !!b });
      const aoa = [], rowsMeta = [];
      const title = { v: kkTitle(c.name), t: 's', s: { font: font(16, true), alignment: { horizontal: 'center', vertical: 'center' }, border: BORDER } };
      aoa.push([title, ...Array.from({ length: 5 }, () => ({ v: '', t: 's', s: { border: BORDER } }))]); rowsMeta.push({ hpt: 24 });
      const cell = (v, num, fmt, center) => {
        const s = { font: font(12), border: BORDER, alignment: { vertical: 'center', horizontal: center ? 'center' : 'left' } };
        if (num && v !== '' && /^\d+$/.test(String(v))) return { v: Number(v), t: 'n', z: fmt, s: Object.assign(s, { alignment: { vertical: 'center', horizontal: 'left' } }) };
        return { v: String(v == null ? '' : v), t: 's', s };      // metin: = + - @ ile başlasa da formül olmaz
      };
      if (o.header) { aoa.push(['No', 'Ad', 'Soyad', 'İl', 'Telefon', 'İmza / Not'].map(h => ({ v: h, t: 's', s: { font: font(12, true), border: BORDER, fill: { fgColor: { rgb: 'E8EFE8' } }, alignment: { horizontal: 'center', vertical: 'center' } } }))); rowsMeta.push({ hpt: 21 }); }
      ps.forEach((p, i) => {
        const tel = o.phone === false ? '' : (p.tel || '');
        aoa.push([cell(i + 1, true, '0', true), cell(p.ad), cell(p.soyad), cell(p.club), cell(tel, true, PHONE_FMT), cell('')]); rowsMeta.push({ hpt: 21 });
      });
      for (let k = 0; k < (o.blank || 0); k++) { aoa.push([cell(ps.length + k + 1, true, '0', true), cell(''), cell(''), cell(''), cell(''), cell('')]); rowsMeta.push({ hpt: 21 }); }
      const ws = X.utils.aoa_to_sheet(aoa);
      ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
      ws['!cols'] = [6.44, 23.66, 18.89, 16.66, 18.5, 20].map(w => ({ wch: Math.round((w - 0.83) * 100) / 100 }));
      ws['!rows'] = rowsMeta;
      X.utils.book_append_sheet(wb, ws, sheetName(c.short && c.short.length <= 3 ? c.short : c.name, used));
    }
    return wb;
  }
  /** Hiçbir hücreye NaN/undefined/Infinity yazılmaz. */
  const cell = (v) => (v == null || (typeof v === 'number' && !isFinite(v)) ? '' : v);
  /** Sıralama + Çapraz Tablo + Turlar çalışma kitabı. rows: E.computeStandings çıktısı; order: eşitlik bozma anahtarları. */
  function buildResults(X, o) {
    const defs = o.defs, order = o.order.filter(k => k !== 'direct' && k !== 'directfide' && defs[k]);
    let pz = 0;
    const head = ['Sıra', 'B.No', 'Ad Soyad', 'Unvan', 'Fed', 'Kulüp', 'Puan', ...order.map(k => defs[k].short), 'Ödül sırası', 'Durum'];
    const aoa = [head].concat(o.rows.map(r => {
      const wd = r.p.status === 'withdrawn';
      return [r.tied ? "" : r.rank, r.p.no, o.nm(r.p), r.p.title, r.p.fed, (o.clubMax ? String(r.p.club || '').slice(0, o.clubMax) : r.p.club), r.pts, ...order.map(k => (typeof r.tb[k] === 'number' ? Math.round(r.tb[k] * 100) / 100 : '')), wd ? '' : ++pz, wd ? 'çekildi' : ''].map(cell);
    }));
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(aoa), 'Sıralama');
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(o.cross.map(r => r.map(cell))), 'Çapraz Tablo');
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['Tur', 'Masa', 'Beyaz', 'Sonuç', 'Siyah']].concat((o.pairings || []).map(r => r.map(cell)))), 'Turlar');
    return wb;
  }
  const API = { buildResults, buildKayitKontrol, sheetName, kkTitle, PHONE_FMT };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.XlsxOut = API;
})(typeof window !== 'undefined' ? window : globalThis);
