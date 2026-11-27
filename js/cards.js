/* Yaka ve masa kartı: sayfalama, yazı sığdırma, A4 mm yerleşimi. Saf kısımlar node'da test edilir. */
(function (root) {
  'use strict';
  const FAM = 'Arial, "Liberation Sans", Helvetica, sans-serif';
  const PER = 4;
  const paginate = (arr, per) => { per = per || PER; const o = []; for (let i = 0; i < arr.length; i += per) o.push(arr.slice(i, i + per)); return o; };
  const sheetCount = (n) => Math.ceil(n / PER);
  const PT_MM = 25.4 / 72;

  /** Tarayıcı dışında (test) yaklaşık Arial Bold genişliği, mm. Tarayıcıda canvas ölçümü kullanılır. */
  function estWidthMm(text, pt) {
    let em = 0;
    for (const ch of String(text)) em += ch === ' ' ? 0.28 : /[IİiıjlJ.,:;!|'’]/.test(ch) ? 0.3 : /[MWÖ]/.test(ch) ? 0.95 : /[a-z]/.test(ch) ? 0.6 : 0.74;
    return em * pt * PT_MM;
  }
  /** Sığdırma: maxPt'de genişlik maxMm'yi aşarsa orantılı küçült; minPt altına inemez (o zaman satır kırılır). */
  function fit(text, o, measure) {
    const m = measure || estWidthMm;
    const w = m(text, o.maxPt);
    if (!(w > o.maxMm)) return { pt: o.maxPt, wrap: false };
    const pt = Math.round(o.maxPt * o.maxMm / w * 10) / 10;
    if (pt >= o.minPt) return { pt, wrap: false };
    return { pt: o.minPt, wrap: m(text, o.minPt) > o.maxMm };
  }

  const YAKA = { w: 90, h: 120, maxMm: 76, name: { maxPt: 22, minPt: 12 }, club: { maxPt: 20, minPt: 11 } };
  const MASA = { slotH: 69.8, pitch: 73.4, top: 3.6, cuts: [3.6, 73.4, 77.0, 146.8, 150.4, 220.2, 223.6, 293.6],
    name: { maxPt: 24, minPt: 14, maxMm: 134 }, club: { maxPt: 15, minPt: 9, maxMm: 134 }, cat: { maxPt: 15, minPt: 8, maxMm: 40 } };

  const yakaLines = (p) => ({ l1: ((p.title ? p.title + ' ' : '') + (p.ad || '')).trim(), l2: p.soyad || '', club: p.club || '' });
  function masaData(p, cat, o) {
    o = o || {};
    const rt = (v) => (v > 0 ? String(v) : (o.dashZero ? '-' : '0'));
    return { cat, name: [p.title, p.ad, p.soyad].filter(Boolean).join(' '), club: p.club || '', elo: 'ELO: ' + rt(p.elo), ukd: 'UKD: ' + rt(p.rating) };
  }
  function yakaPos(i, o) {
    o = o || {};
    const ex = o.layout === 'ornek';
    const x0 = ex ? 5 : 10, gx = ex ? 10 : 10, y0 = ex ? 9 : 10, gy = 20;
    return { x: x0 + (i % 2) * (YAKA.w + gx) + (+o.dx || 0), y: y0 + Math.floor(i / 2) * (YAKA.h + gy) + (+o.dy || 0) };
  }

  /* ---------------- DOM (yalnız tarayıcı) ---------------- */
  let _ctx = null;
  function canvasMeasure(text, pt) {
    if (!_ctx) _ctx = document.createElement('canvas').getContext('2d');
    _ctx.font = 'bold ' + (pt * 96 / 72) + 'px ' + FAM;
    return _ctx.measureText(text).width * 25.4 / 96;
  }
  function el(tag, cls, css, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (css) for (const k in css) e.style[k] = css[k];
    if (txt != null) e.textContent = txt;          // veri her zaman textContent ile
    return e;
  }
  const mm = (v) => v + 'mm';
  function box(parent, x, y, w, h, extra) { const b = el('div', 'abs', Object.assign({ left: mm(x), top: mm(y), width: mm(w), height: mm(h) }, extra || {})); parent.appendChild(b); return b; }
  function img(parent, url, x, y, w, h) { if (!url) return null; const b = box(parent, x, y, w, h); const i = document.createElement('img'); i.src = url; i.alt = ''; i.className = 'fillimg'; b.appendChild(i); return b; }
  function textBox(parent, text, x, y, w, h, spec, extra) {
    const f = fit(text, { maxPt: spec.maxPt, minPt: spec.minPt, maxMm: spec.maxMm || w - 2 }, canvasMeasure);
    const b = box(parent, x, y, w, h, Object.assign({ display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontWeight: '700', fontFamily: FAM, fontSize: f.pt + 'pt', lineHeight: '1.05', whiteSpace: f.wrap ? 'normal' : 'nowrap', overflow: 'hidden' }, extra || {}));
    b.textContent = text; return b;
  }
  const PAWN = 'M12 2a3.5 3.5 0 0 0-2 6.4C8.7 9.3 8 10.8 8 12h8c0-1.2-.7-2.7-2-3.6A3.5 3.5 0 0 0 12 2zM7 13l-1 4h12l-1-4H7zM5 18l-1 3h16l-1-3H5z';
  function pawnSvg(parent, x, y, s) {
    const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.style.cssText = `position:absolute;left:${x}mm;top:${y}mm;width:${s}mm;height:${s}mm`;
    const p = document.createElementNS(NS, 'path'); p.setAttribute('d', PAWN); p.setAttribute('fill', '#222'); svg.appendChild(p); parent.appendChild(svg);
  }
  function cutMarks(parent, x, y, w, h) {
    const L = 3, g = 1.2, c = '#777';
    [[x - g - L, y, L, 0], [x, y - g - L, 0, L], [x + w + g, y, L, 0], [x + w, y - g - L, 0, L], [x - g - L, y + h, L, 0], [x, y + h + g, 0, L], [x + w + g, y + h, L, 0], [x + w, y + h + g, 0, L]]
      .forEach(([a, b, lw, lh]) => parent.appendChild(el('div', 'abs', { left: mm(a), top: mm(b), width: lw ? mm(lw) : '0', height: lh ? mm(lh) : '0', borderTop: lw ? '0.2mm solid ' + c : '0', borderLeft: lh ? '0.2mm solid ' + c : '0' })));
  }

  /** items: [{p, cat}] (en çok 4). imgs: {header,footer,logoL,logoR,cardBg} url'leri. */
  function yakaSheet(items, imgs, o) {
    o = o || {};
    const sh = el('div', 'sheet');
    items.forEach((it, i) => {
      const pos = yakaPos(i, o), c = box(sh, pos.x, pos.y, YAKA.w, YAKA.h, { border: '0.2mm solid #999', overflow: 'hidden', background: '#fff' });
      c.classList.add('ykc');
      if (imgs.cardBg) { const b = img(c, imgs.cardBg, 0, 0, YAKA.w, YAKA.h); b.style.opacity = String(Math.max(0.05, Math.min(1, (+o.bg || 18) / 100))); } else c.classList.add('ykbg');
      img(c, imgs.yHeader, 9, 11, 72, 36);
      c.appendChild(el('div', 'abs', { left: mm(14), top: mm(50.5), width: mm(62), height: '0', borderTop: '0.35mm solid #444' }));
      const pw = el('div', 'abs', { left: mm(41.5), top: mm(48), width: mm(7), height: mm(5), background: '#fff' }); c.appendChild(pw); pawnSvg(c, 42, 47.7, 6);
      const L = yakaLines(it.p), W = YAKA.maxMm;
      textBox(c, L.l1, 7, 55, 76, 11, { maxPt: YAKA.name.maxPt, minPt: YAKA.name.minPt, maxMm: W });
      textBox(c, L.l2, 7, 66, 76, 11, { maxPt: YAKA.name.maxPt, minPt: YAKA.name.minPt, maxMm: W });
      if (L.club) textBox(c, L.club, 7, 82, 76, 10, { maxPt: YAKA.club.maxPt, minPt: YAKA.club.minPt, maxMm: W }, { fontWeight: '600' });
      img(c, imgs.footer, 9, 99, 72, 17);
      if (o.marks) cutMarks(sh, pos.x, pos.y, YAKA.w, YAKA.h);
    });
    return sh;
  }
  function masaSheet(items, imgs, o) {
    o = o || {};
    const sh = el('div', 'sheet');
    MASA.cuts.forEach(y => sh.appendChild(el('div', 'abs', { left: '0', top: mm(y), width: mm(210), height: '0', borderTop: '0.2mm solid #888' })));
    items.forEach((it, i) => {
      const top = MASA.top + i * MASA.pitch, d = masaData(it.p, it.cat, o);
      box(sh, 7.2, top + 5.7, 196, 55.6, { border: '0.8mm solid #000', borderRadius: '8mm' });
      const hasL = !!imgs.logoL, hasR = !!imgs.logoR;
      img(sh, imgs.logoL, 13, top + 9, 22, 21);
      const hx = hasL ? 36 : 13, hw = (hasR ? 131 : 152) - hx;
      img(sh, imgs.header, hx, top + 11.5, hw, 19.5);
      img(sh, imgs.logoR, 133, top + 9, 19, 21);
      const rb = (x, y, w, h) => box(sh, x, y, w, h, { border: '0.3mm solid #000', borderRadius: '3mm' });
      rb(155.6, top + 14.3, 44.6, 13.7);
      textBox(sh, d.cat, 156.6, top + 14.3, 42.6, 13.7, MASA.cat);
      rb(13.3, top + 33, 140.7, 26.5);
      const nb = box(sh, 13.3, top + 33, 140.7, 26.5, { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: FAM, fontWeight: '700', textAlign: 'center', overflow: 'hidden' });
      const line = (t, spec) => { const f = fit(t, spec, canvasMeasure); const d2 = el('div', null, { fontSize: f.pt + 'pt', lineHeight: '1.15', whiteSpace: f.wrap ? 'normal' : 'nowrap', maxWidth: mm(spec.maxMm + 2) }, t); nb.appendChild(d2); };
      line(d.name, MASA.name); if (d.club) line(d.club, MASA.club);
      rb(155.6, top + 33, 45, 26.5);
      const rt = box(sh, 159.4, top + 33, 40, 26.5, { display: 'flex', flexDirection: 'column', justifyContent: 'center', fontFamily: FAM, fontWeight: '700', fontSize: '19.5pt', lineHeight: '1.3' });
      rt.appendChild(el('div', null, null, d.elo)); rt.appendChild(el('div', null, null, d.ukd));
    });
    return sh;
  }

  const API = { FAM, PER, paginate, sheetCount, estWidthMm, fit, YAKA, MASA, yakaLines, masaData, yakaPos, yakaSheet, masaSheet, canvasMeasure };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.Cards = API;
})(typeof window !== 'undefined' ? window : globalThis);
