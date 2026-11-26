/* Standart sporcu listesi şablonu (sporcu kayıt.xlsx) - TEK kanonik tanım. Saf mantık (UMD).
 * Sütun başlığı -> sporcu alanı eşlemesi, şablon algılama, boş şablon ve liste dışa aktarma burada.
 * Başlıklar dosyadan birebir alınmıştır (' Fed' baştaki boşlukla gelir; karşılaştırma fold ile yapılır). */
(function (root) {
  'use strict';
  /* k: sporcu alanı (null: motor çıktısı, içe aktarmada yok sayılır); req: şablon sayılması için zorunlu başlık; key: Importer eşleme anahtarı */
  const COLS = [
    { h: 'ID no', k: 'tc', key: 'id', req: 1 },
    { h: 'KulupName', k: 'club', key: 'kulupname' },   // kulübün tam adı (varsa içe aktarmada Kulüp'e tercih edilir)
    { h: 'No', k: 'no', key: 'no' },
    { h: 'isim', k: 'isim', key: 'isim', req: 1 },
    { h: 'Unvan', k: 'title', key: 'unvan', req: 1 },
    { h: 'ulusal rating', k: 'rating', key: 'ukd', req: 1 },
    { h: 'ulsulararasi rating', k: 'elo', key: 'elo', req: 1, alt: ['uluslararasirating'] },
    { h: 'DogTar', k: 'birthDate', key: 'dogum', req: 1 },
    { h: ' Fed', k: 'fed', key: 'fed', req: 1 },
    { h: 'Cinsiyet', k: 'female', key: 'cinsiyet', req: 1 },
    { h: 'Tip', k: 'tip', key: 'tip' },
    { h: 'Gr', k: 'gr', key: 'gr', req: 1 },
    { h: 'KulüpNo', k: 'kulupNo', key: 'kulupno' },
    { h: 'FIDE-No', k: 'fideNo', key: 'fideno', req: 1 },
    { h: 'Kaynak', k: 'kaynak', key: 'kaynak' },
    { h: 'puanlar', k: null, out: 'pts' },
    { h: 'tb1', k: null }, { h: 'tb2', k: null }, { h: 'tb3', k: null }, { h: 'tb4', k: null }, { h: 'tb5', k: null }, { h: 'tb6', k: null },
    { h: 'sira', k: null, out: 'rank' },
    { h: 'first name', k: null, key: 'y' },    // ad
    { h: 'surname', k: null, key: 'x' },       // soyad
    { h: 'Kulüp', k: 'club', key: 'kulup', req: 1 },
    { h: 'Telefon', k: 'tel', key: 'tel' },
    { h: 'atitle', k: 'atitle', key: 'atitle' },
  ];
  const fold = (s) => String(s == null ? '' : s).replace(/[İIıi]/g, 'i').toLowerCase().replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  const HEADERS = COLS.map(c => c.h);
  const INFO_KEYS = COLS.filter(c => c.k).map(c => c.k);

  /** Başlık satırı bul. Dönüş: {ok, row, map(key->sütun), missing[], found} - ok: zorunlu tüm başlıklar var. */
  function detect(rows) {
    let best = null;
    for (let r = 0; r < Math.min(10, (rows || []).length); r++) {
      const cells = (rows[r] || []).map(fold), map = {}; let hits = 0;
      const missing = [];
      for (const c of COLS) {
        if (!c.key) continue;
        const names = [fold(c.h)].concat(c.alt || []);
        const i = cells.findIndex(x => x && names.includes(x));
        if (i >= 0) { map[c.key] = i; if (c.req) hits++; } else if (c.req) missing.push(c.h.trim());
      }
      if (!best || hits > best.hits) best = { row: r, map, missing, hits };
    }
    if (!best) return { ok: false, row: 0, map: {}, missing: COLS.filter(c => c.req).map(c => c.h.trim()), hits: 0 };
    best.ok = best.missing.length === 0;
    return best;
  }

  /* ---- dışa aktarma: sporcu -> şablon satırı */
  const SEX = (p) => (p.female === true ? 'K' : p.female === false ? 'E' : '');
  function rowOf(p, gr) {
    const o = {
      no: p.no || '', isim: [p.ad, p.soyad].filter(Boolean).join(' '), title: p.title || '', tc: p.tc ? (+p.tc || p.tc) : '', rating: p.rating || '', elo: p.elo || '',
      birthDate: p.birthDate || (p.birthYear ? String(p.birthYear) : ''), fed: p.fed || '', female: SEX(p), tip: p.tip || '', gr: gr || '', kulupNo: p.kulupNo || '', club: p.club || '',
      fideNo: p.fideNo || '', kaynak: p.kaynak || '', atitle: p.atitle || '', tel: p.tel || '',
    };
    return COLS.map(c => {
      if (c.k) return o[c.k];
      if (c.key === 'x') return p.soyad || '';    // surname = soyad
      if (c.key === 'y') return p.ad || '';       // first name = ad
      return '';
    });
  }
  /** Boş şablon (1-2 örnek satırlı). X: xlsx-js-style (ya da XLSX). */
  function buildBlank(X) {
    const ex = [
      { ad: 'ALİ', soyad: 'YILMAZ', title: '', tc: '', rating: 1650, elo: 0, birthDate: '2012-05-17', fed: 'TUR', female: false, club: 'RİZE', fideNo: '' },
      { ad: 'AYŞE', soyad: 'DEMİR', title: '', tc: '', rating: 0, elo: 0, birthDate: '2014-09-03', fed: 'TUR', female: true, club: 'TRABZON', fideNo: '' },
    ];
    return sheet(X, ex.map((p, i) => rowOf(Object.assign({ no: i + 1 }, p), 'A KATEGORİSİ')), 'Sayfa1');
  }
  /** entries: [{p, gr}] */
  function buildList(X, entries) { return sheet(X, entries.map((e, i) => rowOf(Object.assign({}, e.p, { no: e.p.no || i + 1 }), e.gr)), 'Sayfa1'); }
  function sheet(X, rows, name) {
    const ws = X.utils.aoa_to_sheet([HEADERS.slice()].concat(rows));
    const hs = { font: { bold: true }, fill: { patternType: 'solid', fgColor: { rgb: 'FFE7E1D2' } } };
    HEADERS.forEach((h, c) => { const a = X.utils.encode_cell({ r: 0, c }); if (ws[a]) ws[a].s = hs; });
    COLS.forEach((cl, c) => { if (cl.k === 'tc') for (let r = 1; r <= rows.length; r++) { const a = X.utils.encode_cell({ r, c }); if (ws[a] && ws[a].t === 'n') ws[a].z = '0'; } });
    ws['!cols'] = COLS.map(cl => ({ wch: cl.k === 'isim' ? 28 : cl.k === 'club' ? 14 : cl.k === 'gr' ? 16 : 11 }));
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, name); return wb;
  }
  /** Turnuvadaki tüm sporcular, kişi başına bir satır (kopyalar atlanır). Gr: 'gr' kategorisinde kategori adı, yaş grubunda ilk Gr değeri. */
  function entriesOf(tn) {
    const seen = new Set(), out = [];
    const cats = tn.cats.filter(c => c.kind === 'gr').concat(tn.cats.filter(c => c.kind !== 'gr'));
    for (const c of cats) for (const p of c.players.slice().sort((a, b) => (a.no || 9999) - (b.no || 9999))) {
      const k = p.kisiId || p.id; if (seen.has(k)) continue; seen.add(k);
      out.push({ p, gr: c.kind === 'gr' ? c.name : ((p.src && p.src.gr) || c.name) });
    }
    return out;
  }
  const API = { entriesOf, COLS, HEADERS, INFO_KEYS, fold, detect, rowOf, buildBlank, buildList };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.Template = API;
})(typeof window !== 'undefined' ? window : globalThis);
