/* UKD/ELO: TSF ulusal liste Excel'i ile toplu eşleştirme (ağ çağrısı YOK). Saf mantık (UMD). */
(function (root) {
  'use strict';
  const I = root.Importer || require('./importer.js');
  const M = root.Model || require('./model.js');
  const { fold } = I;

  const tokens = (ad, soyad) => (String(ad || '') + ' ' + String(soyad || '')).split(/\s+/).map(fold).filter(Boolean).sort().join('|');

  /** Liste Excel'i (nat ornek.xlsx: ID_No, FirstName, Name, Birthday, Rtg_Nat, ClubName, Federation; opsiyonel FIDE-No/ELO). */
  function readNatList(X, wb, o) {
    o = o || {};
    const maxYear = new Date().getFullYear();
    for (const sn of wb.SheetNames) {
      const rows = I.sheetRows(X, wb.Sheets[sn]);
      const h = I.detectHeader(rows, I.NAT_ALIAS, 3);
      if (!h) continue;
      const m = h.map;
      if (!(m.isim != null || (m.firstname != null && m.surname != null))) continue;
      if (m.ukd == null && m.elo == null) continue;
      const list = []; const warns = [];
      for (let i = h.row + 1; i < rows.length; i++) {
        const r = rows[i]; const g = (k) => (m[k] != null ? r[m[k]] : '');
        if (!r.some(c => String(c == null ? '' : c).trim() !== '')) continue;
        let ad = I.up(g('firstname')), soyad = I.up(g('surname'));
        if (m.isim != null && !(ad && soyad)) { const s = I.splitName(I.txt(g('isim'))); ad = I.up(s.firstname); soyad = I.up(s.surname); }
        if (!ad && !soyad) continue;
        const dt = I.parseDate(g('dogum'), maxYear);
        const w = [];
        const ukd = I.parseRating(g('ukd'), 'UKD', i + 1, w), elo = I.parseRating(g('elo'), 'ELO', i + 1, w);
        let fideNo = I.digits(g('fideno')); if (/^0+$/.test(fideNo)) fideNo = '';
        list.push({ firstname: ad, surname: soyad, tc: I.digits(g('id')), birthDate: dt.birthDate, birthYear: dt.birthYear, ukd, elo, fideNo, il: I.up(g('kulup')), fed: I.up(g('fed')), row: i + 1 });
      }
      if (!list.length) continue;
      return { sheet: sn, list, hasUkd: m.ukd != null, hasElo: m.elo != null, hasFide: m.fideno != null, hasTC: m.id != null, errors: [] };
    }
    return { list: [], errors: ['Listede tanınan sütunlar bulunamadı. Gerekli: ad+soyad (FirstName, Name) ve Rtg_Nat (UKD) veya ELO sütunu.'] };
  }

  function buildIndex(list) {
    const ix = { tc: new Map(), fide: new Map(), full: new Map(), tokYear: new Map(), tok: new Map() };
    const put = (map, k, e) => { if (!k) return; if (!map.has(k)) map.set(k, []); map.get(k).push(e); };
    for (const e of list) {
      if (e.tc.length === 11) put(ix.tc, e.tc, e);
      put(ix.fide, e.fideNo, e);
      if (e.birthDate) put(ix.full, fold(e.firstname) + '|' + fold(e.surname) + '|' + e.birthDate, e);
      const t = tokens(e.firstname, e.surname);
      if (e.birthYear) put(ix.tokYear, t + '#' + e.birthYear, e);
      put(ix.tok, t, e);
    }
    return ix;
  }

  /** Turnuvadaki kategorilerden (benzersiz kişi: kisiId) liste ile eşleştirir. */
  function matchPlayers(cats, nat) {
    const ix = buildIndex(nat.list);
    const people = new Map();
    for (const c of cats) for (const p of c.players) {
      if (!people.has(p.kisiId)) people.set(p.kisiId, { p, cats: [] });
      people.get(p.kisiId).cats.push(c.name);
    }
    const rows = [];
    for (const [kisiId, { p, cats: cn }] of people) {
      let type = 'yok', cand = [];
      const one = (arr, t) => { if (arr && arr.length === 1) { cand = arr; type = t; return true; } if (arr && arr.length > 1) { cand = arr; type = 'belirsiz'; return true; } return false; };
      (p.tc.length === 11 && one(ix.tc.get(p.tc), 'kesin-tc')) ||
        (p.fideNo && nat.hasFide && one(ix.fide.get(p.fideNo), 'kesin-fide')) ||
        (p.birthDate && one(ix.full.get(fold(p.firstname) + '|' + fold(p.surname) + '|' + p.birthDate), 'kesin-ad')) ||
        (p.birthYear && one(ix.tokYear.get(tokens(p.firstname, p.surname) + '#' + p.birthYear), 'olasi')) ||
        one(ix.tok.get(tokens(p.firstname, p.surname)), 'zayif');
      const row = { kisiId, p, cats: cn, type, cand, match: type !== 'belirsiz' && cand.length === 1 ? cand[0] : null, oldUkd: p.rating, oldElo: p.elo, newUkd: null, newElo: null, note: '', apply: false };
      if (row.match) proposals(row, nat);
      rows.push(row);
    }
    return rows;
  }
  function proposals(row, nat) {
    const e = row.match;
    if (nat.hasUkd) {
      if (e.ukd > 0 && e.ukd !== row.oldUkd) row.newUkd = e.ukd;
      else if (e.ukd === 0 && row.oldUkd > 0) row.note = 'listede 0, mevcut korunur';
    }
    if (nat.hasElo && e.elo > 0 && e.elo !== row.oldElo) row.newElo = e.elo;
    row.apply = row.type.startsWith('kesin') && (row.newUkd != null || row.newElo != null);
  }
  const level = (t) => (t.startsWith('kesin') ? 'kesin' : t);
  function chooseCandidate(row, idx, nat) { row.match = row.cand[idx]; row.type = 'olasi'; row.newUkd = row.newElo = null; proposals(row, nat); row.apply = false; }

  /** Uygula: yalnız eşleştirmesi başlamamış kategorilerde. */
  function applyMatches(cats, rows, o) {
    o = o || {};
    const sel = new Map(rows.filter(r => r.apply && r.match).map(r => [r.kisiId, r]));
    const batch = o.batch || M.uid(), at = o.now || Date.now();
    let updated = 0; const blocked = new Set();
    for (const c of cats) {
      if (c.rounds.length) { if (c.players.some(p => sel.has(p.kisiId))) blocked.add(c.name); continue; }
      let ch = false;
      for (const p of c.players) {
        const r = sel.get(p.kisiId); if (!r) continue;
        const oU = p.rating, oE = p.elo;
        if (r.newUkd != null) p.rating = r.newUkd;
        if (r.newElo != null) p.elo = r.newElo;
        if (o.saveTC && !p.tc && r.match.tc.length === 11) p.tc = r.match.tc;
        if (o.saveFide && !p.fideNo && r.match.fideNo) p.fideNo = r.match.fideNo;
        p.ratingLog.push({ at, ukd: [oU, p.rating], elo: [oE, p.elo], src: o.src || 'liste', batch });
        if (p.ratingLog.length > 50) p.ratingLog.shift();
        updated++; ch = true;
      }
      if (ch) M.renumber(c);
    }
    return { updated, blocked: [...blocked], batch };
  }
  function undoBatch(cats, batch) {
    let n = 0;
    for (const c of cats) {
      if (c.rounds.length) continue;
      let ch = false;
      for (const p of c.players) {
        const l = p.ratingLog[p.ratingLog.length - 1];
        if (l && l.batch === batch) { p.rating = l.ukd[0]; p.elo = l.elo[0]; p.ratingLog.pop(); n++; ch = true; }
      }
      if (ch) M.renumber(c);
    }
    return n;
  }
  /** Bağlantı şablonu: yalnız https; {firstname} {surname} {fideNo} {tc}(izinli ise); eski {ad} {soyad} da çalışır. */
  function linkFrom(tpl, p, allowTC) {
    if (!tpl || !/^https:\/\//i.test(tpl)) return '';
    if (/\{fideNo\}/.test(tpl) && !p.fideNo) return '';
    if (/\{tc\}/.test(tpl) && (!allowTC || !p.tc)) return '';
    const u = tpl.replace(/\{(firstname|surname|ad|soyad|fideNo|tc)\}/g, (_, k) => encodeURIComponent(p[k === 'ad' ? 'firstname' : k === 'soyad' ? 'surname' : k] || ''));
    return /^https:\/\//i.test(u) ? u : '';
  }

  const API = { readNatList, matchPlayers, chooseCandidate, applyMatches, undoBatch, linkFrom, level, tokens };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.RatingMatch = API;
})(typeof window !== 'undefined' ? window : globalThis);
