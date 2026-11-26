/* Excel / CSV içe aktarma: başlık tanıma, ad-soyad ayrıştırma, doğrulama. Saf mantık (UMD).
 * XLSX kütüphanesi parametre olarak verilir (tarayıcıda window.XLSX, node'da require). */
(function (root) {
  'use strict';
  const Tpl = (typeof module !== 'undefined' && module.exports) ? require('./template.js') : root.Template;
  const LIMITS = { bytes: 5 * 1024 * 1024, rows: 5000, cell: 200 };
  const TITLES = ['GM', 'IM', 'FM', 'CM', 'WGM', 'WIM', 'WFM', 'WCM'];

  /** Türkçe duyarsız, boşluk/noktalamasız katlama: "ULUSAL RATING" -> "ulusalrating", "İSTANBUL" -> "istanbul" */
  function fold(s) {
    s = String(s == null ? '' : s).replace(/[İIıi]/g, 'i').toLowerCase()
      .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u');
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  }
  const ALIAS = {
    gr: ['gr', 'grup', 'kategori', 'group'], isim: ['isim', 'adsoyad', 'adisoyadi', 'sporcu', 'oyuncu', 'adsoyadi'],
    unvan: ['unvan', 'title'], tip: ['tip'], kulupno: ['kulupno'], kaynak: ['kaynak'], atitle: ['atitle'], id: ['idno', 'id', 'tc', 'tckn', 'tckimlikno', 'tcno'],
    ukd: ['ulusalrating', 'ukd', 'rtgnat', 'rating', 'rtg'], elo: ['ulsulararasirating', 'uluslararasirating', 'elo', 'rtgint', 'fiderating'],
    dogum: ['dogtar', 'dogumtarihi', 'birthday', 'dogum', 'dogumyili', 'birth'], fed: ['fed', 'federasyon', 'federation'],
    cinsiyet: ['cinsiyet', 'sex', 'gender'], kulup: ['kulup', 'il', 'sehir', 'club', 'clubname'], fideno: ['fideno', 'fideid'],
    ad: ['ad', 'adi'], soyad: ['soyad', 'soyadi'], x: ['surname'], y: ['firstname'],
    tel: ['telefon', 'tel', 'gsm', 'cep', 'ceptelefonu', 'phone', 'mobile'],
  };
  const NAT_ALIAS = {
    id: ['idno', 'id', 'tc', 'tckn', 'tckimlikno', 'tcno'], ad: ['firstname', 'ad', 'adi'], soyad: ['name', 'soyad', 'soyadi', 'lastname', 'surname'],
    isim: ['isim', 'adsoyad', 'adisoyadi', 'sporcu', 'playername', 'fullname'],
    dogum: ['birthday', 'dogtar', 'dogumtarihi', 'dogum', 'birth'], ukd: ['rtgnat', 'ulusalrating', 'ukd', 'rating', 'rtg'],
    elo: ['rtgint', 'ulsulararasirating', 'uluslararasirating', 'elo', 'fiderating', 'rtgfide', 'rtgi'], fideno: ['fideno', 'fideid', 'fide'],
    kulup: ['clubname', 'kulup', 'il', 'club'], fed: ['federation', 'fed', 'federasyon'],
  };
  const TEL_ALIAS = { ad: ['ad', 'adi', 'firstname'], soyad: ['soyad', 'soyadi', 'name', 'lastname'], il: ['il', 'kulup', 'sehir'], tel: ['telefon', 'tel', 'gsm', 'cep', 'ceptelefonu'], no: ['no', 'sira'] };

  /** Başlık satırı: ilk 10 satırda en az 3 tanınan başlık içeren satır. */
  function detectHeader(rows, aliases, minHits) {
    minHits = minHits || 3;
    for (let r = 0; r < Math.min(10, rows.length); r++) {
      const map = {}; let hits = 0;
      rows[r].forEach((c, i) => {
        const f = fold(c); if (!f) return;
        for (const k in aliases) if (map[k] == null && aliases[k].includes(f)) { map[k] = i; hits++; break; }
      });
      if (hits >= minHits) return { row: r, map };
    }
    return null;
  }

  /* ----- değer ayrıştırıcılar */
  function pad(n) { return String(n).padStart(2, '0'); }
  /** Excel seri sayısı -> UTC takvim günü (saat dilimi etkisiz). */
  function serialToYMD(n) { const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000); return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]; }
  function parseDate(v, maxYear) {
    maxYear = maxYear || new Date().getFullYear();
    let y = 0, m = 0, d = 0;
    if (v === '' || v == null) return { birthDate: '', birthYear: '' };
    if (v instanceof Date) { y = v.getFullYear(); m = v.getMonth() + 1; d = v.getDate(); }
    else if (typeof v === 'number') { if (v > 1000 && v < 80000) [y, m, d] = serialToYMD(v); else if (v >= 1900 && v <= maxYear) y = v; }
    else {
      const s = String(v).trim(); let a;
      if ((a = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) { y = +a[1]; m = +a[2]; d = +a[3]; }
      else if ((a = /^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/.exec(s))) { d = +a[1]; m = +a[2]; y = +a[3]; }
      else if ((a = /^(\d{4})$/.exec(s))) y = +a[1];
    }
    if (y < 1900 || y > maxYear) return { birthDate: '', birthYear: '', bad: true };
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return { birthDate: y + '-' + pad(m) + '-' + pad(d), birthYear: y };
    return { birthDate: '', birthYear: y };
  }
  function parseRating(v, label, row, warns) {
    if (v == null) return 0;
    let t = typeof v === 'number' ? String(Math.round(v)) : String(v).trim();
    if (t === '' || t === '-' || t === '0') return 0;
    let n;
    if (/^\d{3,4}$/.test(t)) n = +t;
    else { const a = /^(\d+)/.exec(t); n = a ? +a[1] : 0; warns.push(`Satır ${row}: ${label} '${t.slice(0, 20)}' sayı değil → ${n >= 100 && n <= 4000 ? n : 0} alındı`); }
    return n >= 100 && n <= 4000 ? n : 0;
  }
  const digits = (v) => (typeof v === 'number' ? String(Math.round(v)) : String(v == null ? '' : v)).replace(/\D/g, '');
  function tcValid(t) {
    if (!/^[1-9]\d{10}$/.test(t)) return false;
    const d = t.split('').map(Number);
    const c10 = (((d[0] + d[2] + d[4] + d[6] + d[8]) * 7) - (d[1] + d[3] + d[5] + d[7])) % 10;
    return ((c10 + 10) % 10) === d[9] && d.slice(0, 10).reduce((a, b) => a + b, 0) % 10 === d[10];
  }
  function normTel(v) {
    let t = digits(v);
    if (t.startsWith('90') && t.length === 12) t = t.slice(2);
    if (t.startsWith('0') && t.length === 11) t = t.slice(1);
    return t;
  }
  const up = (s) => String(s == null ? '' : s).trim().slice(0, LIMITS.cell).toLocaleUpperCase('tr');
  const txt = (s) => String(s == null ? '' : s).trim().slice(0, LIMITS.cell);

  /** Ad/Soyad ayrıştırma: first name = ad, surname = soyad esastır; yoksa ad+soyad sütunları, yoksa isim sütunu (son kelime soyad). */
  function splitName(isim, x, y, ad, soyad) {
    if (ad && soyad) return { ad, soyad, guess: false };
    // Excel'de "first name" sütunu ad'ı, "surname" sütunu soyad'ı taşır: ikisi de doluysa esas alınır (isim sütunu yalnız yedek)
    if (x && y) return { ad: y, soyad: x, guess: false };
    if (isim) {
      const parts = isim.trim().split(/\s+/);
      if (parts.length === 1) return { ad: parts[0], soyad: '', guess: true };
      const s = parts.pop(); return { ad: parts.join(' '), soyad: s, guess: true };
    }
    if (x || y) return { ad: y || '', soyad: x || '', guess: true };   // standart anlam: surname=soyad, first name=ad
    return { ad: ad || '', soyad: soyad || '', guess: false };
  }

  /** Kayıt listesi (sporcu kayıt.xlsx) -> sporcular + hata/uyarı. rows: dizi dizisi (başlık dahil). */
  function parseRegistration(rows, o) {
    o = o || {};
    const out = { players: [], errors: [], warnings: [], info: { rows: 0, headerRow: null, missing: [] } };
    if (!rows || !rows.length) { out.errors.push('Dosyada satır bulunamadı.'); return out; }
    if (rows.length > LIMITS.rows + 12) { out.errors.push(`Dosya çok büyük: en fazla ${LIMITS.rows} satır okunur.`); return out; }
    /* Önce standart şablon başlıkları aranır. Uyuşmazsa (loose verilmedikçe) hiçbir şey alınmaz; çağıran onay isteyip loose:true ile tekrar çağırır. */
    const T = Tpl.detect(rows);
    let h, few = false;
    out.info.mode = 'sablon';
    if (T.ok) h = { row: T.row, map: T.map };
    else {
      out.notTemplate = true; out.info.missing = T.missing;
      out.warnings.push('Standart şablon başlıkları bulunamadı: eksikler ' + T.missing.join(', '));
      if (!o.loose) return out;
      out.info.mode = 'tahmini';
      h = detectHeader(rows, ALIAS, 3);
      if (!h) { h = detectHeader(rows, ALIAS, 2); if (h && (h.map.isim != null || h.map.ad != null || h.map.soyad != null || h.map.x != null)) few = true; else h = null; }
      if (!h) { out.errors.push('Başlık satırı bulunamadı. Beklenen başlıklar: isim, Gr (kategori), ulusal rating, DogTar, Kulüp… İlk satırda sütun başlıkları olmalı.'); return out; }
    }
    const m = h.map; out.info.headerRow = h.row + 1;
    if (!(m.isim != null || (m.ad != null && m.soyad != null) || (m.x != null && m.y != null))) {
      out.errors.push('Ad Soyad sütunu bulunamadı (isim veya ad+soyad gerekli). Bulunan başlıklar: ' + rows[h.row].map(c => txt(c)).filter(Boolean).join(', ').slice(0, 300));
      return out;
    }
    const maxYear = o.maxYear || new Date().getFullYear();
    const g = (r, k) => (m[k] != null ? r[m[k]] : '');
    const seenTC = new Map(), seenFide = new Map(), seenKey = new Map();
    let guessed = 0, xyWarn = false;
    if (m.isim == null && m.x != null && m.y != null) xyWarn = true;
    for (let i = h.row + 1; i < rows.length; i++) {
      const r = rows[i], xr = i + 1;
      if (!r || !r.some(c => String(c == null ? '' : c).trim() !== '')) continue;
      out.info.rows++;
      const sp = splitName(txt(g(r, 'isim')), txt(g(r, 'x')), txt(g(r, 'y')), txt(g(r, 'ad')), txt(g(r, 'soyad')));
      const ad = up(sp.ad), soyad = up(sp.soyad);
      if (!ad && !soyad) { out.errors.push(`Satır ${xr}: Ad Soyad boş, satır alınmadı`); continue; }
      if (sp.guess) guessed++;
      const tcRaw = digits(g(r, 'id')); let tc = '';
      if (tcRaw) {
        if (seenTC.has(tcRaw)) { out.errors.push(`Satır ${xr}: TC kimlik no Satır ${seenTC.get(tcRaw)} ile aynı, satır alınmadı`); continue; }
        seenTC.set(tcRaw, xr); tc = tcRaw;
        if (!tcValid(tc)) out.warnings.push(`Satır ${xr}: TC kimlik no 11 hane/algoritma kontrolünden geçmedi`);
      }
      const warns = [];
      const rating = parseRating(g(r, 'ukd'), 'UKD', xr, warns), elo = parseRating(g(r, 'elo'), 'ELO', xr, warns);
      warns.forEach(w => out.warnings.push(w));
      const dt = parseDate(g(r, 'dogum'), maxYear);
      if (m.dogum != null && !dt.birthYear) out.warnings.push(`Satır ${xr}: doğum tarihi ${dt.bad ? 'geçersiz' : 'boş'} (yaş kategorisine girmez)`);
      let title = up(g(r, 'unvan')).replace(/\s+/g, '');
      if (title && !TITLES.includes(title)) { out.warnings.push(`Satır ${xr}: bilinmeyen unvan '${title.slice(0, 10)}' yok sayıldı`); title = ''; }
      const sx = fold(g(r, 'cinsiyet'));
      const female = ['k', 'f', 'kiz', 'kadin', 'w', 'female', 'woman'].includes(sx) ? true : (['e', 'm', 'erkek', 'male', 'man'].includes(sx) ? false : null);
      let fideNo = digits(g(r, 'fideno')); if (/^0+$/.test(fideNo)) fideNo = '';
      if (fideNo) { if (seenFide.has(fideNo)) out.warnings.push(`Satır ${xr}: FIDE no Satır ${seenFide.get(fideNo)} ile aynı`); else seenFide.set(fideNo, xr); }
      const gr = txt(g(r, 'gr'));
      if (m.gr != null && !gr) out.warnings.push(`Satır ${xr}: Gr (kategori) boş → KATEGORİSİZ`);
      const key = fold(ad + soyad) + '|' + dt.birthDate + '|' + gr;
      if (seenKey.has(key)) out.warnings.push(`Satır ${xr}: aynı kategoride aynı ad+doğum tarihi (Satır ${seenKey.get(key)})`); else seenKey.set(key, xr);
      out.players.push({
        ad, soyad, title, rating, elo, birthDate: dt.birthDate, birthYear: dt.birthYear, female,
        club: (txt(g(r, 'kulupname')) || txt(g(r, 'kulup'))).slice(0, 80), kulupNo: txt(g(r, 'kulupno')).slice(0, 12), tip: txt(g(r, 'tip')).slice(0, 20), kaynak: txt(g(r, 'kaynak')).slice(0, 40), atitle: up(g(r, 'atitle')).slice(0, 12), fed: up(g(r, 'fed')).replace(/\s+/g, ''), fideNo, tc, tel: normTel(g(r, 'tel')), src: { gr, row: xr },
      });
    }
    if (few) out.warnings.unshift('Yalnız ' + Object.keys(m).length + ' sütun tanındı (' + Object.keys(m).join(', ') + '); diğer bilgiler boş kalacak');
    if (guessed) out.warnings.unshift(`${guessed} satırda ad/soyad ayrımı tahmin edildi (son kelime soyad); önizlemede kontrol edin`);
    if (xyWarn) out.warnings.unshift('"isim" sütunu yok: first name = ad, surname = soyad olarak okundu; kontrol edin');
    if (!out.players.length && !out.errors.length) out.errors.push('Dosyada sporcu satırı bulunamadı.');
    return out;
  }

  /* ----- çalışma kitabı okuma */
  function checkSize(size) { if (size > LIMITS.bytes) throw new Error(`Dosya çok büyük (${(size / 1048576).toFixed(1)} MB). En fazla ${LIMITS.bytes / 1048576} MB yüklenebilir.`); }
  function readWorkbook(X, buf, size) {
    checkSize(size == null ? (buf.byteLength || buf.length) : size);
    let wb;
    try { wb = X.read(buf, { type: 'array', cellDates: false, cellFormula: false, cellHTML: false, cellStyles: false }); }
    catch (e) { throw new Error('Dosya okunamadı: geçerli bir Excel (.xlsx/.xls) veya CSV değil.'); }
    if (!wb.SheetNames.length) throw new Error('Dosyada sayfa bulunamadı.');
    return wb;
  }
  function sheetRows(X, ws) {
    const ref = ws['!ref']; if (!ref) return [];
    return X.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: true });
  }
  /** Kayıt Kontrol Excel'inden telefon: sayfa = kategori; B=Ad C=Soyad D=İl E=Telefon (başlık varsa ona göre). */
  function parsePhoneSheets(X, wb) {
    const list = [];
    for (const sn of wb.SheetNames) {
      const rows = sheetRows(X, wb.Sheets[sn]);
      const h = detectHeader(rows, TEL_ALIAS, 3);
      const cm = h ? h.map : { ad: 1, soyad: 2, il: 3, tel: 4 };
      for (let i = h ? h.row + 1 : 0; i < rows.length; i++) {
        const r = rows[i]; const ad = txt(r[cm.ad]), soyad = txt(r[cm.soyad]), tel = normTel(r[cm.tel]);
        if (!ad && !soyad) continue; if (typeof r[0] === 'string' && /KATEGOR/i.test(r[0]) && !ad) continue;
        list.push({ sheet: sn, ad: up(ad), soyad: up(soyad), tel, il: up(r[cm.il]) });
      }
    }
    return list;
  }


  /** Telefon eşleme: fold(ad)+fold(soyad) (yoksa ad/soyad belirteç kümesi). Yalnız hesaplar; uygulamak çağıranın işi. */
  function matchPhones(cats, list) {
    const tok = (a, b) => (a + ' ' + b).split(/\s+/).map(fold).filter(Boolean).sort().join('|');
    const exact = new Map(), toks = new Map();
    list.forEach(e => { if (!e.tel) return; exact.set(fold(e.ad) + '|' + fold(e.soyad), e); toks.set(tok(e.ad, e.soyad), e); });
    const hits = [], missing = [], used = new Set();
    for (const c of cats) for (const p of c.players) {
      const e = exact.get(fold(p.ad) + '|' + fold(p.soyad)) || toks.get(tok(p.ad, p.soyad));
      if (e) { hits.push({ p, tel: e.tel, cat: c.name }); used.add(e); } else missing.push({ p, cat: c.name });
    }
    return { hits, missing, unused: list.filter(e => e.tel && !used.has(e)) };
  }

  const API = { matchPhones, Template: Tpl, LIMITS, TITLES, fold, ALIAS, NAT_ALIAS, TEL_ALIAS, detectHeader, parseDate, parseRating, parseRegistration, tcValid, normTel, digits, up, txt, splitName, readWorkbook, sheetRows, parsePhoneSheets, serialToYMD };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.Importer = API;
})(typeof window !== 'undefined' ? window : globalThis);
