/* =========================================================================
 * Eşlendirme motoru  (İsviçre / FIDE-Dutch ilkeleri + Berger + Eşitlik bozma)
 * Kaynak: TSF Yarışma Yönergeleri Hazırlama ve Uygulama Prosedürü, MHK eğitim
 * notları (Eşlendirme-1/2, Eşitlik Bozma), "Eşitlik bozma yöntemleri" belgesi.
 * Tarayıcıda window.Engine, Node'da module.exports olarak kullanılır.
 * ========================================================================= */
(function (root) {
  'use strict';

  /* ------------------------------------------------------------------ *
   *  Yardımcılar
   * ------------------------------------------------------------------ */
  const TITLE_ORDER = ['GM', 'IM', 'WGM', 'FM', 'WIM', 'CM', 'WFM', 'WCM'];
  const trCollator = new Intl.Collator('tr', { sensitivity: 'base' });

  function titleRank(t) {
    const i = TITLE_ORDER.indexOf((t || '').toUpperCase());
    return i < 0 ? 99 : i;
  }
  function startRating(p) { return Math.max(+p.rating || 0, +p.elo || 0); }

  /** Başlangıç sıralaması: kuvvet puanı (UKD/ELO yüksek olan) > unvan (yalnız puanlılarda) > alfabetik (soyad, ad; Türkçe A–Z). UKD/ELO’su olmayanlar yalnız soyada göre. */
  function sortStartingList(players) {
    return players.slice().sort((a, b) =>
      startRating(b) - startRating(a) ||
      (startRating(a) > 0 ? titleRank(a.title) - titleRank(b.title) : 0) ||   // puansızlarda unvan değil, yalnız soyad A–Z
      trCollator.compare(a.soyad || '', b.soyad || '') ||
      trCollator.compare(a.ad || '', b.ad || ''));
  }

  /* ------------------------------------------------------------------ *
   *  Turnuva verisinden oyuncu geçmişi
   *
   *  state = { players:[{id,no,...,status,joinRound}], rounds:[{pairings:[{board,w,b,result}],
   *            byes:[{p,type}]}], settings:{ byePoints, totalRounds, ...} }
   *  result: '1-0' | '0-1' | '1/2' | '+-' (beyaz hükmen kazanır) | '-+' | '--' | null
   * ------------------------------------------------------------------ */
  function resultPoints(res, asWhite) {
    switch (res) {
      case '1-0': return asWhite ? 1 : 0;
      case '0-1': return asWhite ? 0 : 1;
      case '1/2': return 0.5;
      case '+-': return asWhite ? 1 : 0;
      case '-+': return asWhite ? 0 : 1;
      case '--': return 0;
      default: return null;
    }
  }
  const isForfeit = (res) => res === '+-' || res === '-+' || res === '--';

  /**
   * Her oyuncu için tur tur kayıt çıkarır.
   * kayıt: { r, kind:'game'|'fwin'|'floss'|'bye'|'half'|'none', opp, color:'W'|'B'|null, pts, played }
   * 'none' = eşlendirilmedi / tura katılmadı (0 puan).
   * Yalnızca sonucu girilmiş turlar (upto) dikkate alınır.
   */
  function buildHistory(state, upto) {
    const hist = new Map();
    state.players.forEach(p => hist.set(p.id, []));
    const nR = Math.min(upto == null ? state.rounds.length : upto, state.rounds.length);
    for (let r = 1; r <= nR; r++) {
      const rd = state.rounds[r - 1];
      const seen = new Set();
      for (const pr of rd.pairings) {
        const res = pr.result;
        const wp = resultPoints(res, true), bp = resultPoints(res, false);
        const mk = (me, opp, color, pts) => {
          let kind = 'game';
          if (isForfeit(res)) kind = pts === 1 ? 'fwin' : 'floss';
          return { r, kind, opp, color: kind === 'game' ? color : null, pts: pts == null ? 0 : pts,
                   played: kind === 'game', pending: pts == null, forfeitColor: color };
        };
        if (hist.has(pr.w)) { hist.get(pr.w).push(mk(pr.w, pr.b, 'W', wp)); seen.add(pr.w); }
        if (hist.has(pr.b)) { hist.get(pr.b).push(mk(pr.b, pr.w, 'B', bp)); seen.add(pr.b); }
      }
      for (const by of (rd.byes || [])) {
        const pts = by.type === 'bye' ? (state.settings.byePoints != null ? +state.settings.byePoints : 1)
                  : by.type === 'half' ? 0.5 : 0;
        hist.get(by.p).push({ r, kind: by.type === 'bye' ? 'bye' : by.type === 'half' ? 'half' : 'none',
                              opp: null, color: null, pts, played: false });
        seen.add(by.p);
      }
      // bu turda hiçbir kaydı olmayan oyuncular (geç katılan, çekilen) -> 'none'
      for (const p of state.players) {
        if (!seen.has(p.id)) hist.get(p.id).push({ r, kind: 'none', opp: null, color: null, pts: 0, played: false });
      }
    }
    return hist;
  }

  const totalPoints = (h) => h.reduce((s, x) => s + x.pts, 0);

  /* ------------------------------------------------------------------ *
   *  Renk tercihi (FIDE Dutch)
   * ------------------------------------------------------------------ */
  function colorInfo(h) {
    const seq = h.filter(x => x.played).map(x => x.color);
    const W = seq.filter(c => c === 'W').length, B = seq.length - W;
    const cd = W - B;
    const last = seq[seq.length - 1] || null;
    const last2 = seq.length >= 2 && seq[seq.length - 1] === seq[seq.length - 2] ? last : null;
    let pref = null, strength = -1;
    if (seq.length === 0) { pref = null; strength = -1; }
    else if (Math.abs(cd) >= 2) { pref = cd > 0 ? 'B' : 'W'; strength = 2; }
    else if (last2) { pref = last2 === 'W' ? 'B' : 'W'; strength = 2; }
    else if (Math.abs(cd) === 1) { pref = cd > 0 ? 'B' : 'W'; strength = 1; }
    else { pref = last === 'W' ? 'B' : 'W'; strength = 0; }
    return { seq, cd, last, pref, strength };
  }
  const opposite = (c) => (c === 'W' ? 'B' : 'W');

  /* ------------------------------------------------------------------ *
   *  İSVİÇRE SİSTEMİ (FIDE Dutch ilkeleri)
   * ------------------------------------------------------------------ */

  /**
   * opts: { round, totalRounds, initialWhite:boolean (1 nolu sporcu 1. turda beyaz mı),
   *         nodeBudget }
   * dönüş: { pairs:[{w,b}], bye:id|null, notes:[], relaxed:bool }
   */
  function pairSwiss(state, opts) {
    const round = opts.round;
    const totalRounds = opts.totalRounds;
    const hist = buildHistory(state, round - 1);
    const active = state.players.filter(p => p.status !== 'withdrawn' && (p.joinRound || 1) <= round &&
                                             !(state.rounds[round - 1] && (state.rounds[round - 1].skip || []).includes(p.id)));
    // Bu tur oynamayacağını bildiren (bye 0) oyuncular dışarıda tutulur
    const info = new Map();
    for (const p of active) {
      const h = hist.get(p.id) || [];
      const ci = colorInfo(h);
      const opps = new Set(h.filter(x => x.opp != null).map(x => x.opp));
      const gotUnplayedPoint = h.some(x => !x.played && x.pts > 0 && (x.kind === 'bye' || x.kind === 'fwin' || x.kind === 'half'));
      // aşağı kayma geçmişi (son tur): önceki turda daha düşük puanlıyla eşlendiyse
      info.set(p.id, { p, no: p.no, score: totalPoints(h), ci, opps, gotUnplayedPoint, h });
    }
    // Float geçmişi (FIDE C.04.3 C12-C15): her tur için 'D' aşağı, 'U' yukarı, '-' float yok. Bye = aşağı float.
    const scoreBefore = (id, idx) => (hist.get(id) || []).slice(0, idx).reduce((s, x) => s + x.pts, 0);
    for (const x of info.values()) {
      x.floatSeq = x.h.map((e, i) => {
        if (e.kind === 'bye') return 'D';
        if (e.opp == null || !hist.has(e.opp)) return '-';
        const a = scoreBefore(x.p.id, i), b = scoreBefore(e.opp, i);
        return b < a ? 'D' : b > a ? 'U' : '-';
      });
    }
    // Aşağı kayacak oyuncular için ceza: bir önceki turda da aşağı kayanlar (C12) ağır, iki tur önce kayanlar (C14) hafif
    const floatPenalty = (F) => F.reduce((s, x) => {
      const q = x.floatSeq, n = q.length;
      return s + (n >= 1 && q[n - 1] === 'D' ? 10 : 0) + (n >= 2 && q[n - 2] === 'D' ? 1 : 0);
    }, 0);
    const list = active.map(p => info.get(p.id)).sort((a, b) => b.score - a.score || a.no - b.no);

    // Son turda en üst puan grubu için renk gevşetmesi (FIDE C3): puanı > %50 olanlar
    const lastRound = round === totalRounds;
    const topscorer = (x) => x.score * 2 > (totalRounds - 1);

    // ------- Round 1 (veya hiç oynanmış maç yoksa): ortadan böl, çapraz eşle
    const firstRound = list.every(x => x.h.length === 0 || x.h.every(y => !y.played));

    const notes = [];
    let nodes = 0;
    const budget = opts.nodeBudget || 2500000;
    const LOCAL_CAP = 6000;

    // Renk çatışması maliyeti: aynı rengi isteyen iki oyuncu. Hafif=1, güçlü=4, mutlak=60.
    // Maliyet sözlüksel: her tercihi karşılanmayan çift 100 (C10), güçlü tercih de kaçıyorsa +1 (C11), mutlak çatışma +10000.
    function conflictCost(a, b) {
      if (a.ci.pref && b.ci.pref && a.ci.pref === b.ci.pref) {
        const m = Math.min(a.ci.strength, b.ci.strength);
        return m === 0 ? 100 : m === 1 ? 101 : 10101;
      }
      return 0;
    }
    // Atama problemi (Macar algoritması): satırlar (S1 kalanı) sütunlara (S2 boşları) en düşük maliyetle; uyumsuz = engel.
    const BIG = 1e7;
    const pcMemo = new Map();
    function pairCost(a, b, absMode) {
      const k = (absMode + 1) * 1e9 + a.no * 1e4 + b.no;
      let v = pcMemo.get(k);
      if (v === undefined) { v = compat(a, b, absMode) ? conflictCost(a, b) : BIG; pcMemo.set(k, v); }
      return v;
    }
    // C: satır x sütun maliyet matrisi (önceden hesaplanmış); ri/ci: kullanılacak satır/sütun indisleri. En düşük toplam atama maliyeti.
    function assignMat(C, ri, ci) {
      const n = ri.length, m = ci.length;
      if (n === 0) return 0;
      if (n > m) return Infinity;
      const u = new Float64Array(n + 1), v = new Float64Array(m + 1), pm = new Int32Array(m + 1), way = new Int32Array(m + 1);
      const minv = new Float64Array(m + 1), usedc = new Uint8Array(m + 1);
      for (let i = 1; i <= n; i++) {
        pm[0] = i; let j0 = 0;
        minv.fill(Infinity); usedc.fill(0);
        do {
          usedc[j0] = 1; const i0 = pm[j0]; let delta = Infinity, j1 = 0;
          const row = C[ri[i0 - 1]];
          for (let j = 1; j <= m; j++) if (!usedc[j]) {
            const cur = row[ci[j - 1]] - u[i0] - v[j];
            if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
            if (minv[j] < delta) { delta = minv[j]; j1 = j; }
          }
          for (let j = 0; j <= m; j++) { if (usedc[j]) { u[pm[j]] += delta; v[j] -= delta; } else minv[j] -= delta; }
          j0 = j1;
        } while (pm[j0] !== 0);
        do { const j1 = way[j0]; pm[j0] = pm[j1]; j0 = j1; } while (j0);
      }
      let tot = 0;
      for (let j = 1; j <= m; j++) if (pm[j]) tot += C[ri[pm[j] - 1]][ci[j - 1]];
      return tot >= BIG ? Infinity : tot;
    }
    // absMode: 0 = mutlak renk çatışması yasak (son turda üst puanlılar hariç); -1 = hiçbir renk kısıtı yok (son çare)
    function compat(a, b, absMode) {
      if (a.opps.has(b.p.id)) return false;
      if (a.ci.pref && b.ci.pref && a.ci.pref === b.ci.pref && a.ci.strength === 2 && b.ci.strength === 2) {
        if (absMode <= -1) return true;
        if (lastRound && topscorer(a) && topscorer(b)) return true;
        return false;
      }
      return true;
    }


    // ---- Yedek çözücü: Edmonds blossom ile tam eşleşme (sözlük sırası aramanın yetmediği büyük gruplar için)
    function matchingFallback(R, absMode) {
      const n = R.length;
      const adj = Array.from({ length: n }, () => []);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j && compat(R[i], R[j], absMode)) adj[i].push(j);
      // renk çatışması az olan komşular önce
      for (let i = 0; i < n; i++) adj[i].sort((a, b) => conflictCost(R[i], R[a]) - conflictCost(R[i], R[b]) || Math.abs(a - i - n / 2) - Math.abs(b - i - n / 2));
      const match = new Array(n).fill(-1), p = new Array(n), base = new Array(n), used = new Array(n), blossom = new Array(n);
      let q = [];
      function lca(a, b) {
        const u = new Array(n).fill(false);
        for (;;) { a = base[a]; u[a] = true; if (match[a] === -1) break; a = p[match[a]]; }
        for (;;) { b = base[b]; if (u[b]) return b; b = p[match[b]]; }
      }
      function markPath(v, b, children) {
        while (base[v] !== b) {
          blossom[base[v]] = blossom[base[match[v]]] = true;
          p[v] = children; children = match[v]; v = p[match[v]];
        }
      }
      function findPath(root) {
        used.fill(false); p.fill(-1);
        for (let i = 0; i < n; i++) base[i] = i;
        used[root] = true; q = [root];
        for (let qh = 0; qh < q.length; qh++) {
          const v = q[qh];
          for (const to of adj[v]) {
            if (base[v] === base[to] || match[v] === to) continue;
            if (to === root || (match[to] !== -1 && p[match[to]] !== -1)) {
              const cb = lca(v, to);
              blossom.fill(false);
              markPath(v, cb, to); markPath(to, cb, v);
              for (let i = 0; i < n; i++) if (blossom[base[i]]) {
                base[i] = cb;
                if (!used[i]) { used[i] = true; q.push(i); }
              }
            } else if (p[to] === -1) {
              p[to] = v;
              if (match[to] === -1) return to;
              used[match[to]] = true; q.push(match[to]);
            }
          }
        }
        return -1;
      }
      // açgözlü başlangıç
      for (let i = 0; i < n; i++) if (match[i] === -1) for (const j of adj[i]) if (match[j] === -1) { match[i] = j; match[j] = i; break; }
      for (let i = 0; i < n; i++) {
        if (match[i] === -1) {
          let v = findPath(i);
          while (v !== -1) { const pv = p[v], ppv = match[pv]; match[v] = pv; match[pv] = v; v = ppv; }
        }
      }
      if (match.some(x => x === -1)) return null;
      const pairs = [], seen = new Array(n).fill(false);
      let cost = 0;
      for (let i = 0; i < n; i++) if (!seen[i]) { seen[i] = seen[match[i]] = true; pairs.push([R[i], R[match[i]]]); cost += conflictCost(R[i], R[match[i]]); }
      return { pairs, cost };
    }

    // ------- Kombinasyon üretici
    function* combos(arr, k, from) {
      from = from || 0;
      if (k === 0) { yield []; return; }
      for (let i = from; i <= arr.length - k; i++) {
        for (const rest of combos(arr, k - 1, i + 1)) yield [arr[i], ...rest];
      }
    }

    // Verilen R (2p oyuncu, sıralı) ve mdp sayısı için eşlendirmeleri sırayla üret: {pairs, cost}
    function* genPairings(R, m, absMode, maxCost, lim) {
      const cap = { n: 0, lim: lim || LOCAL_CAP };
      const p = R.length / 2;
      if (p === 0) { yield { pairs: [], cost: 0 }; return; }
      let produced = false;
      if (m > 0 && m < p) {
        const S1 = R.slice(0, m), rest = R.slice(m);
        for (const x of pairS1S2(S1, rest, absMode, maxCost, cap, (usedIdxSet, c0) => {
          const remain = rest.filter((_, i) => !usedIdxSet.has(i));
          return genHomog(remain, absMode, maxCost - c0, cap);
        })) { produced = true; yield x; }
      } else {
        for (const x of genHomog(R, absMode, maxCost, cap)) { produced = true; yield x; }
      }
      if (!produced && cap.n > cap.lim && maxCost >= 100000) {
        const fb = matchingFallback(R, absMode);
        if (fb) yield fb;
      }
    }
    function* genHomog(R, absMode, maxCost, cap) {
      const p = R.length / 2;
      if (p === 0) { yield { pairs: [], cost: 0 }; return; }
      const S1 = R.slice(0, p), S2 = R.slice(p);
      yield* pairS1S2(S1, S2, absMode, maxCost, cap, null);
      for (let k = 1; k <= Math.min(2, p); k++) {
        if (cap.n > cap.lim) return;
        const cand = [];
        for (const c1 of combos(S1.map((_, i) => i), k)) {
          for (const c2 of combos(S2.map((_, i) => i), k)) {
            const diff = c2.reduce((s, i) => s + i + p, 0) - c1.reduce((s, i) => s + i, 0);
            cand.push({ c1, c2, diff });
          }
          if (cand.length > 4000) break;
        }
        cand.sort((x, y) => x.diff - y.diff);
        for (const { c1, c2 } of cand.slice(0, 250)) {
          if (cap.n > cap.lim) return;
          const n1 = S1.filter((_, i) => !c1.includes(i)).concat(c2.map(i => S2[i]));
          const n2 = c1.map(i => S1[i]).concat(S2.filter((_, i) => !c2.includes(i)));
          n1.sort((a, b) => R.indexOf(a) - R.indexOf(b));
          n2.sort((a, b) => R.indexOf(a) - R.indexOf(b));
          yield* pairS1S2(n1, n2, absMode, maxCost, cap, null);
        }
      }
    }
    // S1[i] ile S2 elemanlarını sırasıyla (transpozisyon, sözlük sırası) eşle; toplam maliyet <= maxCost
    function* pairS1S2(S1, S2, absMode, maxCost, cap, tail) {
      const used = new Array(S2.length).fill(false);
      const cur = [];
      // maliyet matrisi bir kez hesaplanır
      const C = S1.map(a => S2.map(b => pairCost(a, b, absMode)));
      const allCols = S2.map((_, k) => k);
      function lowerBound(i) {
        // ucuz sınır: kalan her satır için kullanılmamış sütunlardaki en küçük maliyetlerin toplamı
        let sum = 0;
        for (let r = i; r < S1.length; r++) {
          let mn = Infinity; const row = C[r];
          for (let k = 0; k < S2.length; k++) if (!used[k] && row[k] < mn) mn = row[k];
          if (mn >= BIG) return Infinity;
          sum += mn;
        }
        return sum;
      }
      function* rec(i, cost) {
        if (++nodes > budget || ++cap.n > cap.lim) return;
        if (i < S1.length && maxCost < 100000) {
          const cb = lowerBound(i);
          if (cost + cb > maxCost) return;
          // kesin (Macar) sınır: küçük/orta bracket'ta kökte ve her 3 derinlikte; büyükte yalnız kökte ve S1 <= 24 ise
          const hung = S1.length <= 14 ? (i === 0 || i % 3 === 0) : false;
          if (hung) {
            const free = allCols.filter(k => !used[k]);
            const ri = []; for (let r = i; r < S1.length; r++) ri.push(r);
            if (cost + assignMat(C, ri, free) > maxCost) return;
          }
        }
        if (i === S1.length) {
          if (tail) {
            const usedSet = new Set(); used.forEach((u, k) => { if (u) usedSet.add(k); });
            for (const t of tail(usedSet, cost)) yield { pairs: cur.concat(t.pairs), cost: cost + t.cost };
          } else yield { pairs: cur.slice(), cost };
          return;
        }
        for (let j = 0; j < S2.length; j++) {
          if (used[j]) continue;
          if (C[i][j] >= BIG) continue;
          const c = cost + C[i][j];
          if (c > maxCost) continue;
          used[j] = true; cur.push([S1[i], S2[j]]);
          yield* rec(i + 1, c);
          cur.pop(); used[j] = false;
          if (nodes > budget || cap.n > cap.lim) return;
        }
      }
      yield* rec(0, 0);
    }

    // ------- Puan gruplarına ayır
    const groups = [];
    for (const x of list) {
      const g = groups[groups.length - 1];
      if (g && g.score === x.score) g.items.push(x); else groups.push({ score: x.score, items: [x] });
    }

    // aşağı kayan oyuncu seçimi sırası: alttaki sakinler önce; son turda float etmiş olanlar sona
    function floatOrder(L, mdpSet) {
      const idx = L.map((x, i) => i);
      return idx.sort((i, j) => {
        const a = L[i], b = L[j];
        const am = mdpSet.has(a) ? 1 : 0, bm = mdpSet.has(b) ? 1 : 0;
        if (am !== bm) return am - bm;                 // önce sakinleri tercih et (MDP ikinci kez kayarsa sona)
        return j - i;                                   // alttakiler önce
      });
    }

    const COST_STEPS = [0, 1, 2, 4, 8, 16, 32, 100000];
    let subCache = new Map();
    function solveRest(gi, F, absMode) {
      // alt gruplar yalnızca aşağı kayanlara (F) bağlıdır -> önbellek
      const key = gi + '|' + F.map(x => x.p.id).join(',');
      if (subCache.has(key)) return subCache.get(key);
      const it = solveGroups(gi, F, absMode);
      const r = it.next();
      const val = r.done ? null : r.value;
      if (!(nodes > budget)) subCache.set(key, val);
      return val;
    }
    function* solveGroups(gi, floaters, absMode) {
      if (gi >= groups.length) {
        if (floaters.length === 0) yield { pairs: [], bye: null };
        else if (floaters.length === 1 && !floaters[0].gotUnplayedPoint) yield { pairs: [], bye: floaters[0] };
        return;
      }
      const grp = groups[gi];
      const mdpSet = new Set(floaters);
      const L = floaters.concat(grp.items);
      const n = L.length;
      const isLast = gi === groups.length - 1;
      const maxP = Math.floor(n / 2);
      for (let p = maxP; p >= 0; p--) {
        const k = n - 2 * p;                     // aşağı kayacak sayısı
        if (isLast && k > 1) break;
        const order = floatOrder(L, mdpSet);
        const cands = [];
        for (const pick of combos(order, k)) {
          if (cands.length >= 400) break;
          if (isLast && k === 1 && L[pick[0]].gotUnplayedPoint) continue;
          cands.push(pick);
        }
        // 1) tamamlanabilir adayları bul (renk maliyetinden bağımsız), en fazla 8 aday
        const feas = [];
        for (const pick of cands) {
          if (feas.length >= 8) break;
          const pickSet = new Set(pick);
          const F = pick.map(i => L[i]).sort((a, b) => b.score - a.score || a.no - b.no);
          const R = L.filter((_, i) => !pickSet.has(i));
          const m = R.filter(x => mdpSet.has(x)).length;
          let any = null;
          for (const pr of genPairings(R, m, absMode, 100000, LOCAL_CAP)) { any = pr; break; }
          if (nodes > budget) return;
          if (!any) continue;
          const sub = solveRest(gi + 1, F, absMode);
          if (nodes > budget) return;
          if (!sub) continue;
          feas.push({ F, R, m, any, sub });
        }
        if (!feas.length) continue;
        // 2) Her aday için en düşük renk maliyetini bul (C10-C11), adaylar arasında: maliyet, sonra float geçmişi cezası (C12,C14), sonra sıra
        const ranked = [];
        // Küçük bracket'ta (<=20 oyuncu) en düşük renk maliyeti tam hesaplanır: bit-maske DP, MDP-MDP çifti yasak (MDP'ler yerleşiklerle eşlenir)
        const forbidMdp = (R, m) => m > 0 && m < R.length / 2;
        function exactMin(R, m) {
          const n = R.length; if (n > 20 || n % 2) return null;
          const W = R.map(x => R.map(y => ((forbidMdp(R, m) && mdpSet.has(x) && mdpSet.has(y)) ? BIG : pairCost(x, y, absMode))));
          const memo = new Map();
          const full = (1 << n) - 1;
          function f(mask) {
            if (mask === 0) return 0;
            let v = memo.get(mask); if (v !== undefined) return v;
            let i = 0; while (!((mask >> i) & 1)) i++;
            let best = Infinity; const rest = mask & ~(1 << i);
            for (let j = i + 1; j < n; j++) if ((rest >> j) & 1) {
              const w = W[i][j]; if (w >= BIG) continue;
              const r = f(rest & ~(1 << j)); if (w + r < best) best = w + r;
            }
            memo.set(mask, best); return best;
          }
          const t = f(full);
          return t === Infinity ? Infinity : t;
        }
        // Büyük homojen bracket (>20): S1xS2 atama probleminin (Macar) en düşük renk maliyeti
        function bigMin(R, m) {
          const n2 = R.length; if (n2 <= 20 || n2 % 2 || m > 0) return null;
          const h = n2 / 2; const C = [];
          for (let i = 0; i < h; i++) { const row = []; for (let j = 0; j < h; j++) row.push(pairCost(R[i], R[h + j], absMode)); C.push(row); }
          const idx = R.slice(0, h).map((_, i) => i);
          const t = assignMat(C, idx, idx);
          return (t === Infinity || t >= BIG) ? null : t;
        }
        const targets = feas.map(c => { const e = exactMin(c.R, c.m); return e !== null ? e : bigMin(c.R, c.m); });
        let bestCost = Infinity;
        targets.forEach(t => { if (t !== null && t < bestCost) bestCost = t; });
        feas.forEach((c, idx) => {
          if (c.R.length > 20 && idx >= 2) return;               // büyük bracket'ta yalnız ilk 2 aday (hız)
          const t = targets[idx];
          if (t !== null && t > bestCost && !(isLast && k === 1)) return;   // daha pahalı aday elenir (son grupta bye sahibi renkten önce gelir)
          const tryCost = (maxCost, lim) => { for (const pr of genPairings(c.R, c.m, absMode, maxCost, lim || 1500)) return pr; return null; };
          let best = null;
          if (t !== null && t < BIG) {
            best = tryCost(t, 6000);                              // o maliyetteki sözlük sırasındaki ilk eşlendirme
            if (best && c.m > 0) { // C13/C15: MDP ile eşleşen yerleşik, önceki turda da yukarı float yaptıysa ceza; sözlük sırasındaki ilk 60 çözüm arasından en az cezalı
              const upOf = (pairs) => { let u = 0; pairs.forEach(([x, y]) => { let r = null; if (mdpSet.has(x) && !mdpSet.has(y)) r = y; else if (mdpSet.has(y) && !mdpSet.has(x)) r = x; if (r) { const q = r.floatSeq, k = q.length; u += (k >= 1 && q[k - 1] === 'U' ? 10 : 0) + (k >= 2 && q[k - 2] === 'U' ? 1 : 0); } }); return u; };
              let bu = upOf(best.pairs), cnt = 0;
              if (bu > 0) for (const pr of genPairings(c.R, c.m, absMode, t, 6000)) { if (++cnt > 3000) break; const u = upOf(pr.pairs); if (u < bu) { bu = u; best = pr; if (u === 0) break; } }
            }
            if (!best) { // aday ailesinde yok: ikili arama (üstten sınırlı)
              let hi = c.any.cost, lo = t; best = c.any;
              while (lo < hi && nodes <= budget) { const mid = Math.floor((lo + hi) / 2); const pr = tryCost(mid, 800); if (pr) { best = pr; hi = pr.cost; } else lo = mid + 1; }
            }
          } else {
            // büyük bracket: sınırlı ikili arama
            let hi = c.any.cost, lo = 0; best = c.any;
            for (let it = 0; it < 4 && lo < hi && nodes <= budget; it++) { const mid = Math.floor((lo + hi) / 2); const pr = tryCost(mid, 500); if (pr) { best = pr; hi = pr.cost; } else lo = mid + 1; }
            if (hi < c.any.cost) { const pr = tryCost(hi, 500); if (pr) best = pr; }
          }
          // Eşleşme dizisi: sıradaki her oyuncu için (daha üstteki) eşinin sırası; FIDE transpozisyon sırasında küçük dizi öndedir
          const pos = new Map(L.map((x, i) => [x, i]));
          const part = new Map();
          best.pairs.forEach(([x, y]) => { const i = pos.get(x), j = pos.get(y); part.set(Math.min(i, j), Math.max(i, j)); });
          const seq = [...part.keys()].sort((a2, b2) => a2 - b2).map(k => part.get(k));
          // S1xS1 (değişim dalı) çiftleri: saf S1/S2 transpozisyonu her zaman önce gelir
          let ex = 0;
          { const mdpPaired = new Set();
            best.pairs.forEach(([x, y]) => { if (mdpSet.has(x) && !mdpSet.has(y)) mdpPaired.add(y); else if (mdpSet.has(y) && !mdpSet.has(x)) mdpPaired.add(x); });
            const lres = L.filter(x => !mdpSet.has(x) && !mdpPaired.has(x));
            const rp = best.pairs.filter(([x, y]) => !mdpSet.has(x) && !mdpSet.has(y) && !mdpPaired.has(x) && !mdpPaired.has(y));
            const s1 = new Set(lres.slice(0, rp.length));
            // saf transpozisyon: her yerleşik çift bir S1 + bir S2 oyuncusu, aşağı kayan S1'den olmaz
            rp.forEach(([x, y]) => { if (s1.has(x) === s1.has(y)) ex = 1; });
            c.F.forEach(f => { if (s1.has(f)) ex = 1; }); }
          let upen = 0;
          best.pairs.forEach(([x, y]) => { let r = null; if (mdpSet.has(x) && !mdpSet.has(y)) r = y; else if (mdpSet.has(y) && !mdpSet.has(x)) r = x; if (r) { const q = r.floatSeq, k = q.length; upen += (k >= 1 && q[k - 1] === 'U' ? 10 : 0) + (k >= 2 && q[k - 2] === 'U' ? 1 : 0); } });
          const mseq = []; { const pos2 = new Map(L.map((x, i) => [x, i]));
            best.pairs.forEach(([x, y]) => { const mx = mdpSet.has(x), my = mdpSet.has(y); if (mx && !my) mseq.push([pos2.get(x), pos2.get(y)]); else if (my && !mx) mseq.push([pos2.get(y), pos2.get(x)]); });
            mseq.sort((p, q) => p[0] - q[0]); }
          ranked.push({ c, mseq: mseq.map(p => p[1]), idx, cost: best.cost, pen: floatPenalty(c.F), upen, pr: best, seq, ex, fp: c.F.map(x => L.indexOf(x)).sort((a2, b2) => b2 - a2) });
        });
        if (nodes > budget) return;
        if (ranked.length) {
          const cmpFp = (a, b) => { for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return b[i] - a[i]; return 0; };
          const cmpSeq = (a, b) => { const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] - b[i]; return a.length - b.length; };
          const byeK = (x, y) => (isLast && k === 1) ? (x.c.F[0].score - y.c.F[0].score) : 0;
          const psdK = (x, y) => { const a = x.c.F.map(z => z.score).sort((p, q) => q - p), b = y.c.F.map(z => z.score).sort((p, q) => q - p); for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
          ranked.sort((x, y) => byeK(x, y) || psdK(x, y) || x.cost - y.cost || x.pen - y.pen || x.upen - y.upen || (x.mseq.length === y.mseq.length && x.mseq.length === mdpSet.size ? cmpSeq(x.mseq, y.mseq) : 0) || x.ex - y.ex || cmpSeq(x.seq, y.seq) || x.idx - y.idx);
          const w = ranked[0];
          yield { pairs: w.pr.pairs.concat(w.c.sub.pairs), bye: w.c.sub.bye };
          return;
        }
        yield { pairs: feas[0].any.pairs.concat(feas[0].sub.pairs), bye: feas[0].sub.bye };
        return;
      }
    }

    let sol = null, usedLevel = null;
    for (const absMode of [0, -1]) {
      nodes = 0; subCache = new Map();
      const it = solveGroups(0, [], absMode);
      const r = it.next();
      if (!r.done) { sol = r.value; usedLevel = absMode; break; }
    }
    if (!sol) throw new Error('Eşlendirme bulunamadı (kısıtlar çok sıkı). Oyuncu durumlarını kontrol edin.');
    if (usedLevel < 0) notes.push('DİKKAT: Mutlak renk kuralı ihlal edilmeden eşlendirme bulunamadı; elle kontrol edin.');

    // ------- Renk dağıtımı + masa sıralaması
    const initW = opts.initialWhite !== false;
    const out = [];
    sol.pairs.forEach(([a, b]) => {
      let hi = (a.score !== b.score ? a.score > b.score : a.no < b.no) ? a : b, lo = hi === a ? b : a;       // hi: sıralamada üstteki (önce puan, sonra küçük no)
      let w, bl;
      if (firstRound) {
        // pair index'e göre değil, S1'in sırasına göre: üstteki oyuncunun sırası tek ise ilk renk
        const idxHi = list.indexOf(hi);
        const hiWhite = (idxHi % 2 === 0) ? initW : !initW;
        w = hiWhite ? hi : lo; bl = hiWhite ? lo : hi;
      } else {
        const col = assignColors(hi, lo, initW);
        w = col.w; bl = col.b;
      }
      out.push({ w: w.p.id, b: bl.p.id, _hi: hi, _lo: lo });
    });
    // masa sırası: üstteki oyuncunun puanı, toplam puan, üstteki oyuncunun no'su
    out.sort((x, y) => {
      const xs = Math.max(x._hi.score, x._lo.score), ys = Math.max(y._hi.score, y._lo.score);
      return ys - xs || (y._hi.score + y._lo.score) - (x._hi.score + x._lo.score) || Math.min(x._hi.no, x._lo.no) - Math.min(y._hi.no, y._lo.no);
    });
    const pairs = out.map((o, i) => ({ board: i + 1, w: o.w, b: o.b, result: null }));
    return { pairs, bye: sol.bye ? sol.bye.p.id : null, notes, relaxedLevel: usedLevel };
  }

  /** İki oyuncunun rengini belirler (FIDE Dutch E.1–E.5). a: sıralamada üstte. */
  function assignColors(a, b, initW) {
    const pa = a.ci, pb = b.ci;
    const give = (wa) => (wa ? { w: a, b: b } : { w: b, b: a });
    if (pa.pref && pb.pref && pa.pref !== pb.pref) return give(pa.pref === 'W');
    if (pa.pref && !pb.pref) return give(pa.pref === 'W');
    if (pb.pref && !pa.pref) return give(pb.pref !== 'W');
    if (!pa.pref && !pb.pref) {
      const aOdd = a.no % 2 === 1;                   // TPN tek ise ilk renk
      return give(aOdd ? initW : !initW);
    }
    // aynı rengi istiyorlar
    if (pa.strength !== pb.strength) {
      return pa.strength > pb.strength ? give(pa.pref === 'W') : give(pb.pref !== 'W');
    }
    // E.3: son farklı renk oynadıkları turu bul ve değiştir
    const ha = a.h.filter(x => x.played), hb = b.h.filter(x => x.played);
    let i = ha.length - 1, j = hb.length - 1;
    while (i >= 0 && j >= 0) {
      if (ha[i].color !== hb[j].color) return give(opposite(ha[i].color) === 'W');
      i--; j--;
    }
    // E.4: üstteki oyuncunun tercihi
    return give(pa.pref === 'W');
  }

  /* ------------------------------------------------------------------ *
   *  BERGER (döner) SİSTEM
   * ------------------------------------------------------------------ */
  /**
   * n sporcu (kura numaraları 1..n) için tüm turların eşlendirmesi.
   * Tek sayıda sporcuda n+1 'dummy' eklenir; dummy ile eşleşen tur atlar (bye).
   * dönüş: [ [ {w:no,b:no} | {bye:no} ... ] , ... ]  (çift devrede ikinci devre renkler ters)
   */
  function bergerTable(n, doubleRound) {
    const N = n % 2 === 0 ? n : n + 1;
    const m = N - 1;
    const rounds = [];
    for (let k = 0; k < m; k++) {
      let c = ((k + 2 - 1) % m) + 1;           // 1..m
      // sabit oyuncu f: 2f ≡ c (mod m)
      let f = null;
      for (let x = 1; x <= m; x++) if ((2 * x - c) % m === 0) { f = x; break; }
      const pairs = [];
      // 1. masa: N ile f ; tek tur (k çift) N siyah, çift tur N beyaz
      pairs.push(k % 2 === 0 ? { w: f, b: N } : { w: N, b: f });
      for (let j = 1; j <= (N / 2) - 1; j++) {
        const lo = ((f - j - 1) % m + m) % m + 1;
        const hi = ((f + j - 1) % m + m) % m + 1;
        pairs.push({ w: hi, b: lo });
      }
      rounds.push(pairs);
    }
    let all = rounds;
    if (doubleRound) {
      all = rounds.concat(rounds.map(r => r.map(p => ({ w: p.b, b: p.w }))));
    }
    // dummy -> bye
    return all.map(r => r.map(p => {
      if (p.w === N && N !== n) return { bye: p.b };
      if (p.b === N && N !== n) return { bye: p.w };
      return p;
    }));
  }

  /* ------------------------------------------------------------------ *
   *  PUAN TABLOSU VE EŞİTLİK BOZMA
   * ------------------------------------------------------------------ */
  const TB_DEFS = {
    direct:   { name: 'Eş puan grubundaki sporcuların sonuçları [11]', short: 'DK' },
    directfide: { name: 'Doğrudan karşılaşma (DE) – tüm eş puanlılar birbiriyle oynamışsa [81]', short: 'DE' },
    wins:     { name: 'Galibiyet Sayısı (WIN – hükmen galibiyet ve puanlı bye dahil) [68]', short: 'Gal' },
    won:      { name: 'Galibiyet Sayısı (WON – hükmen kazançlar dahil)', short: 'Gal+' },
    aob:      { name: 'Rakiplerin Buchholz Ortalaması (AOB) [77]', short: 'AOB' },
    buch:     { name: 'Buchholz (kesmesiz, sanal rakipli)', short: 'Bh' },
    buchc1:   { name: 'Buchholz Alttan -1 – en kötü 1 sonuç hariç [84] (0,0,1)', short: 'Bh-1' },
    buchc2:   { name: 'Buchholz Alttan -2', short: 'Bh-2' },
    buchmed:  { name: 'Buchholz Medyan -1 (en düşük ve en yüksek hariç)', short: 'BhM-1' },
    buchmed2: { name: 'Buchholz Medyan -2', short: 'BhM-2' },
    bb:       { name: 'Buchholz’un Buchholzu', short: 'BB' },
    sb:       { name: 'Sonneborn-Berger (kesmesiz, sanal rakipli) [85]', short: 'SB' },
    prog:     { name: 'Kademeli Puan Toplamı (Progressive)', short: 'Kad' },
    koya:     { name: 'Koya (%50+ rakiplerden alınan puan)', short: 'Koya' },
    avgr:     { name: 'Rakiplerin Rating Ortalaması', short: 'ARO' },
    avgrc1:   { name: 'Azaltarak Rating Ortalaması (en düşük rakip hariç)', short: 'ARO-1' },
    blackwin: { name: 'Siyahla Kazanılan Oyun Sayısı', short: 'SyhG' },
  };

  /**
   * Sıralama hesapla.
   * opts: { upto, totalRounds, order:[anahtarlar], isBerger }
   * dönüş: satırlar (sıralı): { p, rank, pts, tb:{...}, hist }
   */
  function computeStandings(state, opts) {
    const upto = opts.upto != null ? opts.upto : state.rounds.length;
    const N = upto;                                // ara sıralamada N = oynanan tur sayısı
    const hist = buildHistory(state, upto);
    const byId = new Map(state.players.map(p => [p.id, p]));

    const pts = new Map(), adj = new Map();
    for (const p of state.players) {
      const h = hist.get(p.id);
      pts.set(p.id, totalPoints(h));
      // ayarlanmış puan: oynanmayan her tur ½
      adj.set(p.id, h.reduce((s, x) => s + (x.played || x.kind === 'game' ? x.pts : 0.5), 0));
    }
    // Swiss-Manager (Swiss, 28 sporcu / 6 tur, hükmen + bye + çekilen içeren gerçek turnuva ile birebir doğrulandı):
    //  - rakibin puanı = gerçek puanı + eşlenmediği (kaydı olmayan) her tur için ½  (hükmenle kaybedilen oyun sonucuyla sayılır)
    //  - oynanmamış oyunda (hükmen galibiyet / puanlı bye) değer oyuncunun kendi puanıdır; puansız oynanmamış oyunda 0 (Bh, Bh-1, SB için)
    const isBerg = !!(opts.isBerger || state.system === 'berger');
    // Oynanmamış oyunların Buchholz/SB hesabı: 'sm' (varsayılan, Swiss-Manager ile doğrulandı) | 'fide' (FIDE sanal rakip formülü, sunudaki örnek)
    const fide = !isBerg && ((opts.unplayed || (state.settings && state.settings.tbUnplayed)) === 'fide');
    function virtualOpp(h, idx) {
      let sp = 0; for (let i = 0; i < idx; i++) sp += h[i].pts;
      return sp + (1 - h[idx].pts) + 0.5 * (N - h[idx].r);
    }
    const unpaired = new Map();
    for (const p of state.players) {
      const jr = p.joinRound || 1;
      unpaired.set(p.id, hist.get(p.id).filter(x => x.kind === 'none' && x.r >= jr).length);
    }
    const oppPts = (id) => (fide ? adj.get(id) : isBerg ? pts.get(id) : pts.get(id) + 0.5 * (unpaired.get(id) || 0));
    // oyuncu için rakip puan dizisi (her tur) ve sonuç dizisi
    const oppVals = new Map();
    for (const p of state.players) {
      const h = hist.get(p.id);
      oppVals.set(p.id, h.map((x, i) => {
        const own = pts.get(p.id);
        const v = x.played ? oppPts(x.opp) : (fide ? virtualOpp(h, i) : isBerg ? own : (x.pts > 0 ? own : 0));
        return { v, res: x.pts, played: x.played, opp: x.opp, r: x.r, kind: x.kind };
      }));
    }

    const sumv = (a) => a.reduce((s, x) => s + x, 0);
    const asc = (a) => a.slice().sort((x, y) => x - y);
    const buchVals = new Map();
    for (const p of state.players) buchVals.set(p.id, oppVals.get(p.id).map(o => o.v));

    const TB = new Map();
    for (const p of state.players) {
      const h = hist.get(p.id), ov = oppVals.get(p.id);
      const vals = buchVals.get(p.id), sorted = asc(vals);
      const buch = sumv(vals);
      const t = {};
      t.buch = buch;
      t.buchOwn = oppVals.get(p.id).reduce((s2, o) => s2 + (o.played ? o.v : pts.get(p.id)), 0);
      t.buchc1 = sorted.length > 1 ? sumv(sorted.slice(1)) : 0;
      t.buchc2 = sorted.length > 2 ? sumv(sorted.slice(2)) : 0;
      t.buchmed = sorted.length > 2 ? sumv(sorted.slice(1, -1)) : 0;
      t.buchmed2 = sorted.length > 4 ? sumv(sorted.slice(2, -2)) : 0;
      t.sb = ov.reduce((s, o) => s + o.res * o.v, 0);
      let cum = 0, prog = 0;
      h.forEach(x => { cum += x.pts; prog += cum; });
      t.prog = prog;
      t.wins = h.filter(x => (x.kind === 'game' || x.kind === 'fwin' || x.kind === 'bye') && x.pts === 1).length;   // Swiss-Manager: hükmen galibiyet de sayılır (17_G, 13_G final listeleri)
      t.won = h.filter(x => (x.kind === 'game' || x.kind === 'fwin') && x.pts === 1).length;
      t.blackwin = h.filter(x => x.kind === 'game' && x.color === 'B' && x.pts === 1).length;
      // Koya: %50 ve üzeri alan rakiplerden alınan puanlar
      const half = (Math.max(...[...state.players.map(q => hist.get(q.id).length), 1])) / 2;
      t.koya = h.reduce((s, x) => {
        if (!x.played || x.opp == null) return s;
        return s + ((pts.get(x.opp) >= half) ? x.pts : 0);
      }, 0);
      // rating ortalamaları
      const rts = h.filter(x => x.played).map(x => startRating(byId.get(x.opp)));
      t.avgr = rts.length ? sumv(rts) / rts.length : 0;
      const rs = asc(rts);
      t.avgrc1 = rs.length > 1 ? sumv(rs.slice(1)) / (rs.length - 1) : t.avgr;
      TB.set(p.id, t);
    }
    // Buchholz'un Buchholzu: oynanmış rakiplerin Buchholz değerlerinin toplamı
    for (const p of state.players) {
      const h = hist.get(p.id);
      const pl = h.filter(x => x.played);
      TB.get(p.id).bb = pl.reduce((s, x) => s + TB.get(x.opp).buch, 0);
      // AOB (Swiss-Manager): rakiplerin tam Buchholz'unun ortalaması; bu Buchholz'da oynanmamış her oyun = oyuncunun kendi puanı
      TB.get(p.id).aob = pl.length ? pl.reduce((s, x) => s + (isBerg || fide ? TB.get(x.opp).buch : TB.get(x.opp).buchOwn), 0) / pl.length : 0;
    }

    // doğrudan karşılaşma (grup içi)
    function directEncounter(group, strict) {
      const ids = new Set(group.map(g => g.p.id));
      const res = new Map(group.map(g => [g.p.id, 0]));
      const met = new Map(group.map(g => [g.p.id, new Set()]));
      for (const g of group) {
        for (const x of hist.get(g.p.id)) {
          if (x.played && ids.has(x.opp)) { res.set(g.p.id, res.get(g.p.id) + x.pts); met.get(g.p.id).add(x.opp); }
        }
      }
      // tüm eş puanlılar birbiriyle oynamış olmalı
      if (strict) for (const g of group) if (met.get(g.p.id).size !== group.length - 1) return null;
      return res;
    }

    const order = opts.order || [];
    const rows = state.players.map(p => ({ p, pts: pts.get(p.id), tb: TB.get(p.id), hist: hist.get(p.id), adj: adj.get(p.id) }));
    rows.sort((a, b) => b.pts - a.pts || a.p.no - b.p.no);

    function rankGroup(group, ci) {
      if (group.length <= 1) return group;
      if (ci >= order.length) return group.slice().sort((a, b) => a.p.no - b.p.no); // son çare: başlangıç no
      const key = order[ci];
      let vals;
      if (key === 'direct' || key === 'directfide') {
        const d = directEncounter(group, key === 'directfide');
        if (!d) return rankGroup(group, ci + 1);      // uygulanamaz -> sonraki ölçüt
        vals = group.map(g => d.get(g.p.id));
      } else vals = group.map(g => g.tb[key]);
      const parts = new Map();
      group.forEach((g, i) => {
        const k = Math.round(vals[i] * 1e6) / 1e6;
        if (!parts.has(k)) parts.set(k, []);
        parts.get(k).push(g);
      });
      const keys = [...parts.keys()].sort((x, y) => y - x);
      if (keys.length === 1) return rankGroup(group, ci + 1);
      const out = [];
      for (const k of keys) {
        const sub = parts.get(k);
        sub.forEach(s => { s._decidedBy = s._decidedBy || key; });
        out.push(...rankGroup(sub, ci + 1));
      }
      return out;
    }
    const final = [];
    let i = 0;
    while (i < rows.length) {
      let j = i;
      while (j < rows.length && rows[j].pts === rows[i].pts) j++;
      final.push(...rankGroup(rows.slice(i, j), 0));
      i = j;
    }
    final.forEach((r, k) => { r.rank = k + 1; });
    // Swiss-Manager "Res." sütunu: aynı puandaki sporcuların tümü birbiriyle oynamışsa aralarındaki sonuç puanı, aksi halde 0
    for (let a = 0; a < final.length;) {
      let b = a; while (b < final.length && final[b].pts === final[a].pts) b++;
      const grp = final.slice(a, b), d = grp.length > 1 ? directEncounter(grp, true) : null;
      grp.forEach(g => { g.res = d ? d.get(g.p.id) : 0; });
      a = b;
    }
    // Tüm eşitlik bozma ölçütleri de eşitse (Swiss-Manager gibi) ortak sıra: r.tied = true, sıra bir öncekiyle aynı
    const numKeys = (opts.order || []).filter(k => k !== 'direct' && k !== 'directfide');
    for (let k = 1; k < final.length; k++) {
      const a = final[k - 1], b = final[k];
      if (a.pts !== b.pts || !numKeys.every(key => (a.tb && a.tb[key]) === (b.tb && b.tb[key]))) continue;
      const hh = (x, y) => (hist.get(x.p.id) || []).filter(e => e.played && e.opp === y.p.id).reduce((t, e) => t + e.pts, 0);
      if (hh(a, b) !== hh(b, a)) continue;
      b.rank = a.rank; b.tied = true;
    }
    return final;
  }

  /** Varsayılan eşitlik bozma sıraları (TSF "Eşitlik bozma yöntemleri" belgesindeki öneriye göre). */
  const DEFAULT_TB = {
    swiss:  ['directfide', 'buchc1', 'sb', 'aob', 'wins'], // Swiss-Manager: [11] yalnız tüm eş puanlılar birbiriyle oynamışsa uygulanır (DE) [81] [84] [85] [77] [68]
    berger: ['directfide', 'sb', 'wins'],   // SM: DE [81] → SB [85] → WIN [68]
  };

  const API = {
    sortStartingList, startRating, buildHistory, colorInfo, pairSwiss, assignColors,
    bergerTable, computeStandings, resultPoints, TB_DEFS, DEFAULT_TB, totalPoints, isForfeit,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Engine = API;
})(typeof window !== 'undefined' ? window : globalThis);
