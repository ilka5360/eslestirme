/* Veri modeli v2: turnuva > kategoriler > sporcular. Saf mantık (UMD, node'da test edilir).
 * engine.js'e DOKUNMAZ; her kategori kendi {players,rounds,settings} üçlüsünü motora verir. */
(function (root) {
  'use strict';
  const E = root.Engine || (typeof require !== 'undefined' ? require('../engine.js') : null);
  const R = root.Rules || (typeof require !== 'undefined' ? require('./rules.js') : null);
  const SCHEMA = 2;
  const ID_RE = /^[A-Za-z0-9_-]{3,40}$/;
  const BAD_KEYS = ['__proto__', 'constructor', 'prototype'];

  function uid() {
    let r = '';
    try { const a = new Uint32Array(3); (root.crypto || require('crypto').webcrypto).getRandomValues(a); r = [...a].map(x => x.toString(36)).join(''); }
    catch (e) { r = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); }
    return 'x' + r.slice(0, 14) + Date.now().toString(36).slice(-4);
  }
  const clone = (o) => JSON.parse(JSON.stringify(o));

  /* ------------------------------------------------------------ yapılar */
  function emptyDB() {
    return { schema: SCHEMA, saved: 0, cur: null, curCat: null, lastBackup: 0, dirty: false,
      prefs: { tsfUrlTpl: '', fideUrlTpl: 'https://ratings.fide.com/profile/{fideNo}' }, tournaments: {} };
  }
  function newSettings() {
    return { rounds: null, roundsManual: false, byePoints: 1, initialWhite: true, double: null,
      tbSwiss: E.DEFAULT_TB.swiss.slice(), tbBerger: E.DEFAULT_TB.berger.slice() };
  }
  function newCategory(name, o) {
    o = o || {};
    return { id: uid(), name: name || 'Kategori', short: o.short || shortOf(name), kind: o.kind || 'custom', ageMax: o.ageMax == null ? null : o.ageMax,
      refYear: o.refYear || null, settings: newSettings(), system: null, sysPref: null, started: false, bergerDrawn: false, skipNext: {},
      schedule: null, players: [], rounds: [] };
  }
  function shortOf(name) {
    const m = /^(\S)\s+KATEGOR/i.exec(String(name || '').trim());
    return m ? m[1].toLocaleUpperCase('tr') : String(name || '').trim();
  }
  function newTournament(info) {
    const now = Date.now();
    return { id: uid(), created: now, updated: now, status: 'aktif',
      info: Object.assign({ name: 'Yeni Turnuva', date: '', dateEnd: '', place: '', arbiter: '', deputy: '', director: '', organizer: '', referees: '', web: '', email: '', tempo: '', federation: 'TUR', refYear: null }, info || {}),
      assets: {}, card: {}, cats: [] };
  }
  /** Kulüp: şablondaki tek alan. Eski veride ayrı 'il' vardı: boşsa il'i al, ikisi de doluysa 'Kulüp / İl' birleştir (veri kaybı yok). */
  function clubOf(o) {
    const c = String(o.club || '').trim(), il = String(o.il || '').trim();
    if (!il) return c; if (!c || c === il) return il;
    return (c + ' / ' + il).slice(0, 80);
  }
  function newPlayer(o) {
    o = o || {};
    const id = o.id || uid();
    return { id, kisiId: o.kisiId || id, no: 0, ad: String(o.ad || '').trim(), soyad: String(o.soyad || '').trim(), title: o.title || '',
      rating: +o.rating || 0, elo: +o.elo || 0, birthDate: o.birthDate || '', birthYear: +o.birthYear || '',
      female: o.female == null ? null : !!o.female, club: clubOf(o), fed: o.fed || '', fideNo: o.fideNo || '',
      kulupNo: o.kulupNo == null ? '' : String(o.kulupNo), tip: o.tip || '', kaynak: o.kaynak || '', atitle: o.atitle || '',
      tc: o.tc || '', tel: o.tel || '', src: o.src || { gr: '', row: 0 },
      status: 'active', joinRound: 1, wdFrom: null, wdNote: '', ratingLog: [] };
  }

  /* ------------------------------------------------------------ kategori yardımcıları */
  const n2 = (c) => c.players.length;
  const stateOf = (c) => ({ players: c.players, rounds: c.rounds, settings: c.settings, system: c.system });
  const effDouble = (c) => (c.settings.double == null ? R.autoDouble(n2(c)) : !!c.settings.double);   // null = otomatik (3-4 sporcu çift devre)
  const suggest = (c) => R.suggestRounds(n2(c), c.settings.double);
  function sysOf(c) { return c.system || c.sysPref || (n2(c) > R.BERGER_MAX ? 'swiss' : 'berger'); }
  function totalRounds(c) {
    if (sysOf(c) === 'berger') return R.bergerRounds(n2(c), effDouble(c));
    return +c.settings.rounds || 0;
  }
  function completedRounds(c) {
    let k = 0;
    for (const r of c.rounds) { if (r.pairings.length && r.pairings.every(p => p.result)) k++; else break; }
    return k;
  }
  /** Tur sayısı: hakem elle değiştirmediyse (ve başlamadıysa) öneriyle güncellenir. */
  function recalcRounds(c) {
    if (c.started || c.settings.roundsManual) return;
    const s = suggest(c), n = n2(c);
    let r = s.rounds;
    if (sysOf(c) === 'swiss' && s.system === 'berger') r = Math.min(5, n - 1);
    c.settings.rounds = r;
  }
  function setRounds(c, v) {
    if (c.started) throw new Error('Turnuva başladıktan sonra tur sayısı değiştirilemez.');
    v = +v;
    if (!Number.isInteger(v)) throw new Error('Tur sayısı tam sayı olmalıdır (örn. 5).');
    if (!(v >= 1 && v <= 30)) throw new Error('Tur sayısı 1 ile 30 arasında olmalıdır.');
    c.settings.rounds = v; c.settings.roundsManual = true;
  }
  function resetRounds(c) { c.settings.roundsManual = false; recalcRounds(c); }
  /** Sistem seçimi (başlamadan önce): swiss n>=6, berger n<=8. */
  function setSystem(c, sys) {
    if (c.started) throw new Error('Turnuva başladıktan sonra sistem değiştirilemez.');
    const n = n2(c);
    if (sys === 'berger' && n > R.BERGER_MAX) throw new Error('Berger sistemi en çok ' + R.BERGER_MAX + ' sporcu için kullanılır.');
    if (sys === 'swiss' && n < 6) throw new Error('İsviçre sistemi en az 6 sporcu için seçilebilir.');
    c.sysPref = sys; resetRounds(c);
  }
  function renumber(c) {
    E.sortStartingList(c.players).forEach((p, i) => { p.no = i + 1; });
    c.players.sort((a, b) => a.no - b.no);
  }
  const canDelete = (c) => c.rounds.length === 0;
  const canAddPlayer = (c) => !c.started || (c.system === 'swiss' && c.rounds.length <= 1);

  function addPlayers(c, list) {
    let late = 0;
    const jr = c.started ? c.rounds.length + 1 : 1;
    list.forEach(p => {
      const q = (p.status && p.no !== undefined && p.joinRound) ? p : newPlayer(p);
      q.joinRound = c.started && c.rounds.length >= 1 ? jr : 1;
      if (q.joinRound > 1) late++;
      q.no = 0; c.players.push(q);
    });
    if (!c.started) c.bergerDrawn = false;
    renumber(c); recalcRounds(c);
    return late;
  }
  /** 1. eşlendirme yapıldıktan sonra gelen sporcuyu 1. tura ekler (yalnız İsviçre, yalnız 1. tur).
   *  Turda bye'daki sporcu varsa yeni sporcu onunla masaya oturtulur; yoksa ve sonuç girilmemişse 1. tur silinir (yeniden eşleştirilir). */
  function addToRound1(c, p) {
    if (!(c.started && c.system === 'swiss' && c.rounds.length === 1)) throw new Error('1. tura ekleme yalnızca 1. tur eşlendikten sonra, 2. tur eşlenmeden yapılabilir.');
    const rd = c.rounds[0], bi = rd.byes.findIndex(b => b.type === 'bye');
    const hasRes = rd.pairings.some(x => x.result);
    if (bi < 0 && hasRes) throw new Error('1. turda bye yok ve sonuçlar girilmiş: sporcu 2. turdan itibaren eklenebilir.');
    const q = (p.status && p.no !== undefined && p.joinRound) ? p : newPlayer(p);
    q.joinRound = 1; q.no = 0; c.players.push(q); renumber(c);
    if (bi >= 0) {
      const byeP = c.players.find(x => x.id === rd.byes[bi].p);
      const lo = q.no < byeP.no ? q : byeP, hi = lo === q ? byeP : q;
      const loWhite = (lo.no % 2 === 1) === !!c.settings.initialWhite;   // 1. tur: tek numara başlangıç rengini alır
      rd.byes.splice(bi, 1);
      rd.pairings.push({ board: rd.pairings.length + 1, w: loWhite ? lo.id : hi.id, b: loWhite ? hi.id : lo.id, result: null });
      rd.notes = (rd.notes || []).concat(`${q.ad} ${q.soyad}: geç geldi, 1. tura elle eklendi (bye’daki sporcuyla eşleştirildi).`);
      recalcRounds(c); return 'bye';
    }
    c.rounds.pop(); recalcRounds(c); return 'repair';
  }
  function deletePlayer(c, id) {
    if (!canDelete(c)) throw new Error('Eşleştirme yapıldıktan sonra sporcu silinemez; "Turnuvadan çek" kullanın.');
    const i = c.players.findIndex(p => p.id === id);
    if (i < 0) throw new Error('Sporcu bulunamadı.');
    c.players.splice(i, 1);
    c.bergerDrawn = false; renumber(c); recalcRounds(c);
  }


  /* ------------------------------------------------------------ başlat / eşleştir */
  function drawBerger(c, rnd) {
    rnd = rnd || Math.random;
    const ids = c.players.map(p => p.id);
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    ids.forEach((id, i) => { c.players.find(p => p.id === id).no = i + 1; });
    c.players.sort((a, b) => a.no - b.no); c.bergerDrawn = true;
  }
  function buildBerger(c) {
    const tab = E.bergerTable(n2(c), effDouble(c));
    const byNo = new Map(c.players.map(p => [p.no, p.id]));
    c.rounds = tab.map(r => {
      const pairings = [], byes = [];
      r.forEach(p => { if (p.bye) byes.push({ p: byNo.get(p.bye), type: 'zero', rest: true }); else pairings.push({ board: pairings.length + 1, w: byNo.get(p.w), b: byNo.get(p.b), result: null }); });
      return { pairings, byes };
    });
  }
  /** Kategoriyi başlat: sistem kilitlenir. İsviçre'de tur oluşturmaz; Berger'de tüm tabloyu üretir. */
  function startCategory(c, rnd) {
    const n = n2(c);
    if (n < 3) throw new Error('En az 3 sporcu gerekir.');
    const sys = sysOf(c);
    if (sys === 'swiss' && !(totalRounds(c) >= 1)) throw new Error('Tur sayısı girilmemiş. Bu sporcu sayısı için öneri yok; tur sayısını elle girin.');
    c.system = sys;
    if (sys === 'swiss') renumber(c);
    else { if (!c.bergerDrawn) drawBerger(c, rnd); buildBerger(c); }
    c.started = true;
  }
  function unstartCategory(c) {
    if (c.rounds.some(r => r.pairings.some(p => p.result))) throw new Error('Sonuç girilmiş; başlatma geri alınamaz.');
    c.started = false; c.rounds = []; c.system = null;
  }
  /** İsviçre: round. turu eşleştirir (motor: E.pairSwiss). */
  /** Son turda hükmen yenik (gelmedi: -/+ , +/- veya -/-) sonuç alan, 'sadece bu tur' işaretli olmayan aktif sporcular (İsviçre). */
  function noShows(c) {
    if (c.system !== 'swiss' || !c.rounds.length) return [];
    const last = c.rounds[c.rounds.length - 1], out = [];
    last.pairings.forEach(pr => [[pr.w, '-+'], [pr.b, '+-']].forEach(([id, loss]) => {
      if ((pr.result === loss || pr.result === '--') && !String(pr.auto || '').startsWith('once:')) {
        const p = c.players.find(x => x.id === id); if (p && p.status !== 'withdrawn' && !out.includes(p)) out.push(p);
      }
    }));
    return out;
  }
  function pairRound(c, round) {
    /* Dilekçe vermeden hükmen yenik gelmeyen sporcu çekilmiş sayılır ve eşlendirmeden çıkarılır; dilekçesi olan (c.excuse) oynamaya devam eder. */
    const autoWd = noShows(c).filter(p => !(c.excuse && c.excuse[p.id]));
    autoWd.forEach(p => withdrawPlayer(c, p.id, { mode: 'next', note: 'Son turda hükmen yenik (gelmedi), dilekçe yok' }));
    const skip = Object.keys(c.skipNext || {}).filter(id => { const p = c.players.find(x => x.id === id); return p && p.status !== 'withdrawn' && (p.joinRound || 1) <= round; });
    const rd = { pairings: [], byes: [], skip };
    c.rounds.push(rd);
    try {
      const res = E.pairSwiss(stateOf(c), { round, totalRounds: totalRounds(c), initialWhite: c.settings.initialWhite });
      rd.pairings = res.pairs;
      skip.forEach(id => rd.byes.push({ p: id, type: c.skipNext[id] === 'half' ? 'half' : 'zero' }));
      if (res.bye) rd.byes.push({ p: res.bye, type: 'bye' });
      rd.notes = (res.notes || []).slice(); c.skipNext = {}; c.excuse = {};
      rd.autoWd = autoWd.map(p => p.id);
      autoWd.forEach(p => rd.notes.push(`${p.ad} ${p.soyad}: son turda hükmen yenik (gelmedi, dilekçe yok) – çekilmiş sayıldı, eşlendirmeye alınmadı.`));
      return res;
    } catch (e) { c.rounds.pop(); autoWd.forEach(p => { try { reactivatePlayer(c, p.id); } catch (x) { /* yut */ } }); throw e; }
  }
  function setResult(c, r, i, val) {
    const pr = c.rounds[r - 1].pairings[i];
    pr.result = pr.result === val ? null : val; delete pr.auto;
    return pr;
  }

  /* ------------------------------------------------------------ çekilme */
  const FORFEIT_LOSS = (isWhite) => (isWhite ? '-+' : '+-');   // sporcu aleyhine hükmen
  /** mode: 'next' = sonraki turdan itibaren, 'now' = bu turdan itibaren (bu turdaki sonuçsuz eşleşme hükmen). */
  function withdrawPlayer(c, pid, o) {
    o = o || {};
    const p = c.players.find(x => x.id === pid);
    if (!p) throw new Error('Sporcu bulunamadı.');
    if (p.status === 'withdrawn') throw new Error('Sporcu zaten turnuvadan çekilmiş.');
    if (c.system === 'berger') throw new Error('Berger turnuvasında çekilme yoktur.');
    if (!c.started) throw new Error('Turnuva başlamadan sporcu silinebilir; çekilme için önce turnuva başlamalıdır.');
    const mode = o.mode === 'now' ? 'now' : o.mode === 'once' ? 'once' : 'next';
    let wdFrom, forfeited = 0;
    if (mode === 'once') {   // yalnız bu tur: bu turdaki sonuçsuz eşleşme hükmen, sporcu aktif kalır
      const rd = c.system === 'berger' ? c.rounds[completedRounds(c)] : c.rounds[c.rounds.length - 1];
      const pr = rd && rd.pairings.find(x => (x.w === pid || x.b === pid) && !x.result);
      if (!pr && c.system !== 'berger') {   // sonuçlar tamam, sıradaki tur henüz eşlenmedi: sporcu yalnız sıradaki turu atlar
        c.skipNext = c.skipNext || {}; c.skipNext[pid] = c.settings.byePoints == 0.5 ? 'half' : 'zero';
        return { wdFrom: c.rounds.length + 1, forfeited: 0, once: true, skipped: true };
      }
      if (!pr) throw new Error('Bu turda sonuçsuz eşleşmesi yok.');
      pr.result = FORFEIT_LOSS(pr.w === pid); pr.auto = 'once:' + pid;
      return { wdFrom: c.rounds.indexOf(rd) + 1, forfeited: 1, once: true };
    }
    if (c.system === 'berger') {
      const cr = completedRounds(c);
      const from = mode === 'now' ? cr + 1 : cr + 2;
      c.rounds.forEach((rd, i) => {
        if (i + 1 < from) return;
        rd.pairings.forEach(pr => {
          if ((pr.w === pid || pr.b === pid) && !pr.result) { pr.result = FORFEIT_LOSS(pr.w === pid); pr.auto = 'wd:' + pid; forfeited++; }
        });
      });
      wdFrom = from;
    } else {
      const last = c.rounds[c.rounds.length - 1];
      if (mode === 'now' && last) {
        const pr = last.pairings.find(x => (x.w === pid || x.b === pid) && !x.result);
        if (pr) {
          pr.result = FORFEIT_LOSS(pr.w === pid); pr.auto = 'wd:' + pid; forfeited++;
          wdFrom = c.rounds.length;
        } else wdFrom = c.rounds.length + 1;
      } else wdFrom = c.rounds.length + 1;
      if (c.skipNext) delete c.skipNext[pid];
    }
    p.status = 'withdrawn'; p.wdFrom = wdFrom; p.wdRound = wdFrom - 1; p.wdNote = String(o.note || '').slice(0, 200);
    return { wdFrom, forfeited };
  }
  function reactivatePlayer(c, pid) {
    const p = c.players.find(x => x.id === pid);
    if (!p || p.status !== 'withdrawn') throw new Error('Sporcu çekilmiş durumda değil.');
    p.status = 'active'; p.wdFrom = null; delete p.wdRound; p.wdNote = '';
    let cleared = 0;
    c.rounds.forEach(rd => rd.pairings.forEach(pr => { if (pr.auto === 'wd:' + pid) { pr.result = null; delete pr.auto; cleared++; } }));
    return { cleared };
  }

  /* ------------------------------------------------------------ kategorileme */
  const GR_NONE = 'KATEGORİSİZ';
  /** Gr sütununa göre gruplar + elle girilen yaş sınırı grupları.
   *  o: { refYear, ageMaxes:[8,10], copy:false, stay:Set(playerId) -> yaş grubuna taşınmayacaklar } */
  function categorize(players, o) {
    o = o || {};
    const ages = (o.ageMaxes || []).slice().sort((a, b) => a - b);
    const ref = o.refYear || new Date().getFullYear();
    const stay = o.stay || new Set();
    const grMap = new Map(), ageMap = new Map(ages.map(m => [m, []]));
    let noBirth = 0;
    const moved = {};
    for (const p of players) {
      const gr = (p.src && p.src.gr || '').trim() || GR_NONE;
      let toGr = true;
      if (ages.length && !stay.has(p.id)) {
        if (!p.birthYear) noBirth++;
        else {
          const fit = ages.filter(m => R.inAgeGroup(p.birthYear, ref, m));
          if (fit.length) {
            if (o.copy) fit.forEach(m => ageMap.get(m).push(p));
            else { ageMap.get(fit[0]).push(p); toGr = false; }
            (moved[fit[0]] = moved[fit[0]] || {})[gr] = ((moved[fit[0]] || {})[gr] || 0) + 1;
          }
        }
      }
      if (toGr) { if (!grMap.has(gr)) grMap.set(gr, []); grMap.get(gr).push(p); }
    }
    const cats = [];
    for (const [name, ps] of grMap) cats.push({ key: 'gr:' + name, name, short: shortOf(name), kind: 'gr', ageMax: null, players: ps });
    for (const m of ages) cats.push({ key: 'age:' + m, name: m + ' YAŞ VE ALTI', short: m + ' YAŞ', kind: 'age', ageMax: m, refYear: ref, players: ageMap.get(m) });
    return { cats, noBirth, moved };
  }
  function uniqueName(tn, name, exceptId) {
    const used = new Set(tn.cats.filter(c => c.id !== exceptId).map(c => c.name.toLocaleLowerCase('tr')));
    let n = String(name || 'Kategori').trim().slice(0, 40) || 'Kategori', k = 2, base = n;
    while (used.has(n.toLocaleLowerCase('tr'))) n = base + ' (' + (k++) + ')';
    return n;
  }
  /** specs: [{name,short,kind,ageMax,refYear,players:[ham sporcu]}] -> turnuvaya kategori olarak ekler (sporcular kopyalanır). */
  function addCategoriesTo(tn, specs) {
    for (const s of specs) {
      const c = newCategory(uniqueName(tn, s.name), { kind: s.kind, ageMax: s.ageMax, refYear: s.refYear, short: s.short });
      c.short = c.short || c.name;
      tn.cats.push(c);
      const ps = s.players.map(raw => { if (!raw.kisiId) raw.kisiId = raw.id || uid(); return newPlayer(Object.assign({}, raw, { id: undefined })); });
      addPlayers(c, ps);
    }
    return tn;
  }

  /* ------------------------------------------------------------ kategori işlemleri */
  function deleteCategory(tn, cid) {
    const c = tn.cats.find(x => x.id === cid);
    if (!c) throw new Error('Kategori bulunamadı.');
    if (!canDelete(c)) throw new Error('Eşleştirmesi yapılmış kategori silinemez.');
    tn.cats.splice(tn.cats.indexOf(c), 1);
  }
  function movePlayer(tn, fromId, pid, toId) {
    const a = tn.cats.find(x => x.id === fromId), b = tn.cats.find(x => x.id === toId);
    if (!a || !b || a === b) throw new Error('Kategori seçimi geçersiz.');
    if (a.rounds.length || b.rounds.length) throw new Error('Kategorilerden birinde eşleştirme yapılmış; sporcu taşınamaz.');
    const i = a.players.findIndex(p => p.id === pid);
    if (i < 0) throw new Error('Sporcu bulunamadı.');
    const [p] = a.players.splice(i, 1);
    a.bergerDrawn = false; renumber(a); recalcRounds(a);
    p.no = 0; b.players.push(p); b.bergerDrawn = false; renumber(b); recalcRounds(b);
  }
  /** Mevcut kategorilerden yaşa uyan sporcuları hedef kategoriye taşır/kopyalar (yalnız eşleştirmesi başlamamışlar). */
  function pullByAge(tn, cat, o) {
    const ref = o.refYear || +String(tn.info.date).slice(0, 4) || new Date().getFullYear();
    let cnt = 0;
    if (cat.rounds.length) throw new Error('Hedef kategoride eşleştirme yapılmış.');
    const have = new Set(cat.players.map(p => p.kisiId));
    for (const src of tn.cats) {
      if (src === cat || src.rounds.length) continue;
      for (const p of src.players.slice()) {
        if (p.status !== 'active' || have.has(p.kisiId) || !R.inAgeGroup(p.birthYear, ref, o.max)) continue;
        if (o.copy) { const q = clone(p); q.id = uid(); q.no = 0; q.joinRound = 1; q.ratingLog = []; addPlayers(cat, [q]); }
        else { src.players.splice(src.players.indexOf(p), 1); src.bergerDrawn = false; renumber(src); recalcRounds(src); p.no = 0; addPlayers(cat, [p]); }
        have.add(p.kisiId); cnt++;
      }
    }
    return cnt;
  }

  /* ------------------------------------------------------------ durum / arşiv */
  function setStatus(tn, st) {
    if (!['aktif', 'tamamlandi', 'arsiv'].includes(st)) throw new Error('Geçersiz durum.');
    tn.status = st; tn.updated = Date.now();
    if (st === 'tamamlandi') tn.completedAt = Date.now();
    if (st === 'arsiv') tn.archivedAt = Date.now();
    if (st === 'aktif') { delete tn.archivedAt; delete tn.completedAt; }
  }
  const allDone = (tn) => tn.cats.length > 0 && tn.cats.every(c => c.started && totalRounds(c) > 0 && completedRounds(c) >= totalRounds(c));
  const countPlayers = (tn) => tn.cats.reduce((s, c) => s + c.players.length, 0);

  /* ------------------------------------------------------------ KVKK */
  function stripPII(db) {
    const d = clone(db);
    for (const t of Object.values(d.tournaments)) for (const c of t.cats) for (const p of c.players) { p.tc = ''; p.tel = ''; }
    return d;
  }
  const maskTC = (s) => { s = String(s || ''); return s.length >= 6 ? s.slice(0, 3) + '*'.repeat(s.length - 5) + s.slice(-2) : (s ? '***' : ''); };

  /* ------------------------------------------------------------ göç + doğrulama */
  function scanKeys(o, depth) {
    if (depth > 12) throw new Error('Veri çok derin iç içe.');
    if (Array.isArray(o)) { for (const x of o) scanKeys(x, depth + 1); return; }
    if (o && typeof o === 'object') for (const k of Object.keys(o)) { if (BAD_KEYS.includes(k)) throw new Error('Geçersiz anahtar bulundu: ' + k); scanKeys(o[k], depth + 1); }
  }
  function fixPlayer(p) {
    const q = newPlayer(p);
    q.id = ID_RE.test(String(p.id)) ? String(p.id) : uid();
    q.kisiId = ID_RE.test(String(p.kisiId)) ? String(p.kisiId) : q.id;
    q.no = +p.no || 0; q.status = p.status === 'withdrawn' ? 'withdrawn' : 'active'; q.joinRound = +p.joinRound || 1;
    q.wdFrom = p.wdFrom == null ? null : +p.wdFrom; if (p.wdRound != null) q.wdRound = +p.wdRound;
    q.wdNote = String(p.wdNote || ''); q.ratingLog = Array.isArray(p.ratingLog) ? p.ratingLog.slice(0, 50) : [];
    ['ad', 'soyad', 'title', 'club', 'fed', 'fideNo', 'kulupNo', 'tip', 'kaynak', 'atitle', 'tc', 'tel', 'birthDate'].forEach(k => { q[k] = String(q[k] == null ? '' : q[k]).slice(0, 200); });
    return q;
  }
  function fixCat(c) {
    const base = newCategory(String(c.name || 'Kategori').slice(0, 40), c);
    const o = Object.assign(base, c);
    o.id = ID_RE.test(String(c.id)) ? String(c.id) : uid();
    o.settings = Object.assign(newSettings(), c.settings || {});
    ['tbSwiss', 'tbBerger'].forEach(k => { if (!Array.isArray(o.settings[k])) o.settings[k] = E.DEFAULT_TB[k === 'tbSwiss' ? 'swiss' : 'berger'].slice(); });
    // Eski varsayılan (direct) Swiss-Manager ile uyuşmuyordu: yalnız eski varsayılan sırayı olduğu gibi taşıyoruz, hakemin özelleştirdiği sıraya dokunmuyoruz.
    if (o.settings.tbSwiss.join() === 'direct,buchc1,sb,aob,wins') o.settings.tbSwiss = E.DEFAULT_TB.swiss.slice();
    if (!Array.isArray(c.players) || !Array.isArray(c.rounds || [])) throw new Error('Kategori verisi bozuk.');
    const idMap = new Map();
    o.players = c.players.map(p => { const q = fixPlayer(p); idMap.set(p.id, q.id); return q; });
    const mp = (id) => (idMap.has(id) ? idMap.get(id) : id);
    o.rounds = (c.rounds || []).map(r => ({
      pairings: (Array.isArray(r.pairings) ? r.pairings : []).map(x => Object.assign({}, x, { w: mp(x.w), b: mp(x.b) })),
      byes: (Array.isArray(r.byes) ? r.byes : []).map(x => Object.assign({}, x, { p: mp(x.p) })),
      skip: (Array.isArray(r.skip) ? r.skip : []).map(mp), notes: r.notes }));
    o.skipNext = {}; if (c.skipNext && typeof c.skipNext === 'object') for (const k of Object.keys(c.skipNext)) o.skipNext[mp(k)] = c.skipNext[k];
    return o;
  }
  /** Ham veriyi (v1 yerel/yedek, v2) güvenli v2 DB'ye çevirir. Geçersizse Error fırlatır. */
  function migrate(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Yedek dosyası geçerli bir veri içermiyor.');
    scanKeys(raw, 0);
    const db = emptyDB();
    if (raw.schema != null) {
      if (+raw.schema > SCHEMA) throw new Error('Bu yedek daha yeni bir sürüme ait (schema ' + raw.schema + '). Uygulamayı güncelleyin.');
      if (+raw.schema === SCHEMA) {
        if (!raw.tournaments || typeof raw.tournaments !== 'object') throw new Error('Yedekte turnuva bulunamadı.');
        for (const [k, t] of Object.entries(raw.tournaments)) {
          if (!ID_RE.test(k) || !t || !Array.isArray(t.cats)) throw new Error('Turnuva kaydı geçersiz.');
          const tn = Object.assign(newTournament(t.info), t);
          tn.id = k; tn.info = Object.assign(newTournament().info, t.info || {});
          if (!['aktif', 'tamamlandi', 'arsiv'].includes(tn.status)) tn.status = 'aktif';
          tn.cats = t.cats.map(fixCat); tn.assets = t.assets && typeof t.assets === 'object' ? t.assets : {};
          db.tournaments[k] = tn;
        }
        db.cur = raw.cur && db.tournaments[raw.cur] ? raw.cur : null; db.curCat = raw.curCat || null;
        db.lastBackup = +raw.lastBackup || 0; db.saved = +raw.saved || 0;
        if (raw.prefs && typeof raw.prefs === 'object') db.prefs = Object.assign(db.prefs, raw.prefs);
        return db;
      }
    }
    if (raw.list && typeof raw.list === 'object') {   // v1
      for (const t of Object.values(raw.list)) {
        if (!t || !Array.isArray(t.players)) continue;
        const tn = newTournament(Object.assign({}, t.info));
        if (t.id && ID_RE.test(String(t.id))) tn.id = String(t.id);
        tn.created = t.created || tn.created;
        if (tn.info.date && /^\d{2}\.\d{2}\.\d{4}$/.test(tn.info.date)) { const [d, m, y] = tn.info.date.split('.'); tn.info.date = y + '-' + m + '-' + d; }
        const c = newCategory(String(t.info && (t.info.name2 || t.info.ageGroup) || 'Genel').slice(0, 40));
        c.settings = Object.assign(newSettings(), t.settings || {}, { roundsManual: true });
        c.system = t.system || null; c.started = !!t.started; c.bergerDrawn = !!t.bergerDrawn; c.skipNext = t.skipNext || {}; c.schedule = t.schedule || null;
        c.rounds = clone(t.rounds || []);
        c.players = t.players.map(p => Object.assign({}, p, { club: p.club || '', birthDate: '', kisiId: undefined,
          wdFrom: p.status === 'withdrawn' ? (p.wdRound != null ? +p.wdRound + 1 : null) : null }));
        tn.cats = [fixCat(c)];
        const cc = tn.cats[0];
        tn.status = cc.started && totalRounds(cc) > 0 && completedRounds(cc) >= totalRounds(cc) ? 'tamamlandi' : 'aktif';
        let id = tn.id; while (db.tournaments[id]) id = uid(); tn.id = id;
        db.tournaments[id] = tn;
      }
      db.cur = raw.cur && db.tournaments[raw.cur] ? raw.cur : null;
      db.migratedFromV1 = true;
      return db;
    }
    throw new Error('Yedek dosyası tanınmadı.');
  }
  /** İçe aktarılan DB'yi mevcutla birleştirir (aynı id varsa yeni id verilir). */
  function mergeDB(db, inc) {
    let n = 0;
    for (const t of Object.values(inc.tournaments)) {
      if (db.tournaments[t.id]) t.id = uid();
      db.tournaments[t.id] = t; n++;
    }
    return n;
  }
  function exportBundle(db, o) {
    o = o || {};
    let d = o.includePII ? clone(db) : stripPII(db);
    if (o.tid) { const t = d.tournaments[o.tid]; d.tournaments = {}; if (t) d.tournaments[o.tid] = t; d.cur = o.tid; }
    d.exported = new Date().toISOString(); delete d.dirty;
    return d;
  }

  const API = { addToRound1, effDouble, SCHEMA, ID_RE, uid, clone, emptyDB, newSettings, newCategory, newTournament, newPlayer, shortOf, n2, stateOf, suggest, sysOf, totalRounds, completedRounds,
    recalcRounds, drawBerger, buildBerger, startCategory, unstartCategory, pairRound, noShows, setResult, setRounds, resetRounds, setSystem, renumber, canDelete, canAddPlayer, addPlayers, deletePlayer, withdrawPlayer, noShows, reactivatePlayer,
    categorize, uniqueName, addCategoriesTo, deleteCategory, movePlayer, pullByAge, setStatus, allDone, countPlayers, stripPII, maskTC, migrate, mergeDB, exportBundle, GR_NONE };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.Model = API;
})(typeof window !== 'undefined' ? window : globalThis);
