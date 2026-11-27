/* Ortak arayüz yardımcıları: kaçış (XSS), olay bağlama, bildirim, onay penceresi. Veri ASLA ham innerHTML'e girmez. */
(function (root) {
  'use strict';
  const A = root.App = root.App || {};
  A.$ = (s, r) => (r || document).querySelector(s);
  A.$$ = (s, r) => [...(r || document).querySelectorAll(s)];
  A.esc = (s) => String(s == null ? '' : s).replace(/[&<>"'`]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
  const { $, $$, esc } = A;
  A.ACT = {}; A.views = {};
  A.fmt = (x, dec) => {
    if (x == null || isNaN(x)) return '';
    if (dec) return (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');
    const w = Math.floor(x + 1e-9), f = x - w;
    if (Math.abs(f) < 1e-6) return String(w);
    if (Math.abs(f - 0.5) < 1e-6) return (w ? w : '') + '½';
    return (Math.round(x * 100) / 100).toString().replace('.', ',');
  };
  A.fmtDate = (d) => { if (!d) return ''; const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d); return m ? `${m[3]}.${m[2]}.${m[1]}` : String(d); };
  A.ago = (ms) => { if (!ms) return 'hiç'; const s = (Date.now() - ms) / 1000; if (s < 90) return 'az önce'; if (s < 5400) return Math.round(s / 60) + ' dk önce'; if (s < 129600) return Math.round(s / 3600) + ' saat önce'; return Math.round(s / 86400) + ' gün önce'; };
  A.safeName = (s) => String(s).replace(/[^\p{L}\p{N}\-_ ]/gu, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'turnuva';

  A.toast = (msg, ms) => { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(A.toast.h); A.toast.h = setTimeout(() => t.classList.remove('show'), ms || 3200); };
  A.dialog = (html, onMount) => {
    const d = $('#dlg'); d.innerHTML = html; if (!d.open) d.showModal();
    $$('[data-close]', d).forEach(b => { b.onclick = () => d.close(); });
    if (onMount) onMount(d);
    return d;
  };
  /** Onay penceresi (Promise<boolean>). */
  A.ask = (msg, o) => new Promise(res => {
    o = o || {};
    const d = document.createElement('dialog');           // her onay için ayrı öğe (close olayı karışmasın)
    d.className = 'askdlg';
    d.innerHTML = `<h3>${esc(o.title || 'Onay')}</h3><div class="askmsg">${o.html ? msg : esc(msg).replace(/\n/g, '<br>')}</div>
      <div class="row tight" style="margin-top:14px"><button class="b ${o.danger ? 'red' : ''}" id="ask_ok">${esc(o.ok || 'Tamam')}</button><button class="b sec" id="ask_no">Vazgeç</button></div>`;
    document.body.appendChild(d);
    let fin = false; const done = (v) => { if (fin) return; fin = true; try { d.close(); } catch (e) {} d.remove(); res(v); };
    $('#ask_ok', d).onclick = () => done(true); $('#ask_no', d).onclick = () => done(false);
    d.addEventListener('cancel', (e) => { e.preventDefault(); done(false); });
    d.showModal();
  });
  A.download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800); };
  A.pickFile = (accept, cb) => { const i = $('#fileIn'); i.accept = accept; i.value = ''; i.onchange = () => { if (i.files[0]) cb(i.files[0]); }; i.click(); };

  /** data-act="isim" data-a="arg" olay bağlama. Dosya girdisi: change; sürükle-bırak: data-drop="isim". */
  A.bind = (rootEl) => {
    $$('[data-act]', rootEl).forEach(el => {
      const tag = el.tagName, ty = el.type;
      const ev = tag === 'SELECT' || tag === 'TEXTAREA' || (tag === 'INPUT' && ty !== 'button') ? 'change' : 'click';
      el.addEventListener(ev, (e) => { const f = A.ACT[el.dataset.act]; if (f) { try { const r = f(el, e); if (r && r.catch) r.catch(A.fail); } catch (er) { A.fail(er); } } });
    });
    $$('[data-drop]', rootEl).forEach(el => {
      el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('over'); });
      el.addEventListener('dragleave', () => el.classList.remove('over'));
      el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('over'); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) A.ACT[el.dataset.drop]({ files: [f], dataset: el.dataset }, e); });
    });
  };
  A.mut = (fn) => (el, e) => { if (A.ro && A.ro()) { A.toast('Arşivdeki turnuva salt okunurdur. Önce "Arşivden çıkar" deyin.'); return; } return fn(el, e); };
  A.fail = (e) => { console.error(e); A.toast(e && e.message ? e.message : 'Beklenmeyen hata', 5000); };
  /** TC / telefon gibi hassas alan: parola türünde, "göster" onay kutulu. */
  A.piiInput = (id, val, label) => `<div><label>${esc(label)} <span class="muted">(gizli)</span></label><input id="${id}" type="password" autocomplete="off" value="${esc(val || '')}"><label class="chk" style="margin-top:3px"><input type="checkbox" data-show="${id}"> göster</label></div>`;
  A.bindPII = (d) => $$('[data-show]', d).forEach(c => { c.onchange = () => { $('#' + c.dataset.show, d).type = c.checked ? 'text' : 'password'; }; });
  /* ---- Yazdırma: iPhone ana ekran uygulaması (standalone) window.print() desteklemez → yazdırılabilir HTML dosyası ver ---- */
  const iosStandalone = () => (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) && (navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches));
  A.printFile = async () => {
    try {
      const clone = document.documentElement.cloneNode(true);
      clone.querySelectorAll('script,.noprint,header.top,#banner,dialog,#toast,input[type=file]').forEach(n => n.remove());
      const css = await fetch('style.css').then(r => r.text()).catch(() => '');
      const head = clone.querySelector('head') || clone.insertBefore(document.createElement('head'), clone.firstChild);
      head.querySelectorAll('link[rel=stylesheet],link[rel=manifest]').forEach(n => n.remove());
      const st = document.createElement('style'); st.textContent = css; head.appendChild(st);
      const sc = document.createElement('script'); sc.textContent = "addEventListener('load',function(){setTimeout(function(){window.print()},500)})"; clone.querySelector('body').appendChild(sc);
      const html = '<!DOCTYPE html>\n<html lang="tr">' + clone.innerHTML + '</html>';
      const name = 'yazdir-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.html';
      const file = new File([html], name, { type: 'text/html' });
      if (A.native) { await A.shareBlob(file, name); return; }
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Eşleştirme – yazdır' }); return; }
      const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) { if (e && e.name === 'AbortError') return; A.toast('Dosya hazırlanamadı: ' + (e.message || e), 5000); }
  };
  A.doPrint = () => {
    if (iosStandalone() || A.native) {
      A.dialog(`<h3>Yazdır</h3><p>${A.native ? 'Android uygulamasından doğrudan yazdırma yapılamaz; sayfa bir dosya olarak paylaşılır.' : 'iPhone’da ana ekran uygulaması doğrudan yazdırmayı desteklemez.'}</p>
        <ol style="padding-left:18px;margin:8px 0"><li><b>Yazdırılabilir dosyayı hazırla</b>’ya dokunun.</li><li>Açılan listeden <b>Dosyalara Kaydet</b> seçin (veya AirDrop ile bilgisayara gönderin).</li><li>${A.native ? 'Dosyayı Chrome’da açın (paylaşma listesinden Chrome’u seçin); yazdırma penceresi kendiliğinden açılır.' : 'Dosyayı Safari’de açın; yazdırma penceresi kendiliğinden açılır (Paylaş → Yazdır).'}</li></ol>
        <div class="row tight"><button class="b" id="pf_ok">Yazdırılabilir dosyayı hazırla</button><button class="b sec" data-close>Kapat</button></div>`, d => { $('#pf_ok', d).onclick = () => { A.printFile(); }; });
      return;
    }
    try { window.print(); } catch (e) { A.printFile(); }
  };
})(window);

/* PII 'göster' kutuları (diyalog dışı formlar için de çalışsın) */
document.addEventListener('change', (e) => { const c = e.target; if (c && c.dataset && c.dataset.show) { const i = document.getElementById(c.dataset.show); if (i) i.type = c.checked ? 'text' : 'password'; } });
/* Ortak arayüz yardımcıları: kaçış (XSS), olay bağlama, bildirim, onay penceresi. Veri ASLA ham innerHTML'e girmez. */
(function (root) {
  'use strict';
  const A = root.App = root.App || {};
  A.$ = (s, r) => (r || document).querySelector(s);
  A.$$ = (s, r) => [...(r || document).querySelectorAll(s)];
  A.esc = (s) => String(s == null ? '' : s).replace(/[&<>"'`]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
  const { $, $$, esc } = A;
  A.ACT = {}; A.views = {};
  A.fmt = (x, dec) => {
    if (x == null || isNaN(x)) return '';
    if (dec) return (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');
    const w = Math.floor(x + 1e-9), f = x - w;
    if (Math.abs(f) < 1e-6) return String(w);
    if (Math.abs(f - 0.5) < 1e-6) return (w ? w : '') + '½';
    return (Math.round(x * 100) / 100).toString().replace('.', ',');
  };
  A.fmtDate = (d) => { if (!d) return ''; const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d); return m ? `${m[3]}.${m[2]}.${m[1]}` : String(d); };
  A.ago = (ms) => { if (!ms) return 'hiç'; const s = (Date.now() - ms) / 1000; if (s < 90) return 'az önce'; if (s < 5400) return Math.round(s / 60) + ' dk önce'; if (s < 129600) return Math.round(s / 3600) + ' saat önce'; return Math.round(s / 86400) + ' gün önce'; };
  A.safeName = (s) => String(s).replace(/[^\p{L}\p{N}\-_ ]/gu, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'turnuva';

  A.toast = (msg, ms) => { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(A.toast.h); A.toast.h = setTimeout(() => t.classList.remove('show'), ms || 3200); };
  A.dialog = (html, onMount) => {
    const d = $('#dlg'); d.innerHTML = html; if (!d.open) d.showModal();
    $$('[data-close]', d).forEach(b => { b.onclick = () => d.close(); });
    if (onMount) onMount(d);
    return d;
  };
  /** Onay penceresi (Promise<boolean>). */
  A.ask = (msg, o) => new Promise(res => {
    o = o || {};
    const d = document.createElement('dialog');           // her onay için ayrı öğe (close olayı karışmasın)
    d.className = 'askdlg';
    d.innerHTML = `<h3>${esc(o.title || 'Onay')}</h3><div class="askmsg">${o.html ? msg : esc(msg).replace(/\n/g, '<br>')}</div>
      <div class="row tight" style="margin-top:14px"><button class="b ${o.danger ? 'red' : ''}" id="ask_ok">${esc(o.ok || 'Tamam')}</button><button class="b sec" id="ask_no">Vazgeç</button></div>`;
    document.body.appendChild(d);
    let fin = false; const done = (v) => { if (fin) return; fin = true; try { d.close(); } catch (e) {} d.remove(); res(v); };
    $('#ask_ok', d).onclick = () => done(true); $('#ask_no', d).onclick = () => done(false);
    d.addEventListener('cancel', (e) => { e.preventDefault(); done(false); });
    d.showModal();
  });
  A.download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800); };
  A.pickFile = (accept, cb) => { const i = $('#fileIn'); i.accept = accept; i.value = ''; i.onchange = () => { if (i.files[0]) cb(i.files[0]); }; i.click(); };

  /** data-act="isim" data-a="arg" olay bağlama. Dosya girdisi: change; sürükle-bırak: data-drop="isim". */
  A.bind = (rootEl) => {
    $$('[data-act]', rootEl).forEach(el => {
      const tag = el.tagName, ty = el.type;
      const ev = tag === 'SELECT' || tag === 'TEXTAREA' || (tag === 'INPUT' && ty !== 'button') ? 'change' : 'click';
      el.addEventListener(ev, (e) => { const f = A.ACT[el.dataset.act]; if (f) { try { const r = f(el, e); if (r && r.catch) r.catch(A.fail); } catch (er) { A.fail(er); } } });
    });
    $$('[data-drop]', rootEl).forEach(el => {
      el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('over'); });
      el.addEventListener('dragleave', () => el.classList.remove('over'));
      el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('over'); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) A.ACT[el.dataset.drop]({ files: [f], dataset: el.dataset }, e); });
    });
  };
  A.mut = (fn) => (el, e) => { if (A.ro && A.ro()) { A.toast('Arşivdeki turnuva salt okunurdur. Önce "Arşivden çıkar" deyin.'); return; } return fn(el, e); };
  A.fail = (e) => { console.error(e); A.toast(e && e.message ? e.message : 'Beklenmeyen hata', 5000); };
  /** TC / telefon gibi hassas alan: parola türünde, "göster" onay kutulu. */
  A.piiInput = (id, val, label) => `<div><label>${esc(label)} <span class="muted">(gizli)</span></label><input id="${id}" type="password" autocomplete="off" value="${esc(val || '')}"><label class="chk" style="margin-top:3px"><input type="checkbox" data-show="${id}"> göster</label></div>`;
  A.bindPII = (d) => $$('[data-show]', d).forEach(c => { c.onchange = () => { $('#' + c.dataset.show, d).type = c.checked ? 'text' : 'password'; }; });
})(window);

/* PII 'göster' kutuları (diyalog dışı formlar için de çalışsın) */
document.addEventListener('change', (e) => { const c = e.target; if (c && c.dataset && c.dataset.show) { const i = document.getElementById(c.dataset.show); if (i) i.type = c.checked ? 'text' : 'password'; } });
