/* Araç sayfaları: Kayıt Kontrol, Yaka & Masa Kartları, UKD/ELO. */
(function () {
  'use strict';
  const A = window.App, { $, $$, esc, ACT, fmtDate } = A;
  const M = window.Model, S = window.Store, I = window.Importer, RM = window.RatingMatch, XO = window.XlsxOut, C = window.Cards;
  const guard = A.mut;
  const collator = new Intl.Collator('tr');
  const nm = (p) => `${p.ad} ${p.soyad}`.trim();
  A.tools = {};

  /* ---------- yazdırma kökü: yalnızca #printRoot basılır */
  A.clearPrint = () => { document.body.classList.remove('printing'); const r = $('#printRoot'); r.textContent = ''; };
  A.setPrint = (node) => { const r = $('#printRoot'); r.textContent = ''; r.appendChild(node); document.body.classList.add('printing'); };
  window.addEventListener('afterprint', () => A.clearPrint());

  function toolHead(ctx, title, sub) {
    const db = A.db(), list = Object.values(db.tournaments).sort((a, b) => (b.info.date || '').localeCompare(a.info.date || '') || b.created - a.created);
    const name = A.route().name;
    let h = `<h2>${title}</h2>`;
    if (!list.length) return h + '<div class="empty board"><div><h3>Önce bir turnuva oluşturun</h3><a class="b big" href="#/yeni">Yeni turnuva</a></div></div>';
    h += `<div class="card noprint"><div class="row" style="align-items:flex-end"><div style="flex:2 1 260px"><label>Turnuva</label><select data-act="goTool" aria-label="Turnuva seç">${ctx.tn ? '' : '<option value="">— seçin —</option>'}${list.map(t => `<option value="${t.id}" ${ctx.tn && t.id === ctx.tn.id ? 'selected' : ''}>${esc(t.info.name)} (${esc(fmtDate(t.info.date))})</option>`).join('')}</select></div>
      ${ctx.tn ? `<div style="flex:0 0 auto"><a class="b sec" href="#/t/${ctx.tn.id}">← Turnuvaya dön</a></div>` : ''}</div>${sub || ''}</div>`;
    return ctx.tn ? h : h + '<div class="note">Bir turnuva seçin.</div>';
  }
  ACT.goTool = (el) => { if (el.value) A.go(A.route().name + '/' + el.value); };
  const ready = (ctx, title, sub) => { const h = toolHead(ctx, title, sub); return ctx.tn ? { h } : { stop: h }; };

  /* ============================================================= KAYIT KONTROL */
  const kkS = {};
  const kst = (tn) => (kkS[tn.id] = kkS[tn.id] || { cats: null, header: true, blank: 0, phone: true, withdrawn: false, phones: null });
  A.views.kayit = (ctx) => {
    const r = ready(ctx, 'Kayıt Kontrol'); if (r.stop) return r.stop;
    const { tn } = ctx, st = kst(tn), sel = st.cats || new Set(tn.cats.map(c => c.id));
    const chosen = tn.cats.filter(c => sel.has(c.id));
    const withTel = tn.cats.reduce((s, c) => s + c.players.filter(p => p.tel).length, 0), total = M.countPlayers(tn);
    let h = r.h + `<div class="card noprint"><h3>Kategoriler</h3><div class="chips">${tn.cats.map(c => `<label class="chk chip2"><input type="checkbox" data-act="kkCat" data-a="${c.id}" ${sel.has(c.id) ? 'checked' : ''}> ${esc(c.name)} <span class="muted">${c.players.length}</span></label>`).join('') || '<span class="muted">Kategori yok</span>'}</div>
      <h3 style="margin-top:14px">Seçenekler</h3><div class="row">
      <label class="chk"><input type="checkbox" data-act="kkOpt" data-a="header" ${st.header ? 'checked' : ''}> Başlık satırı ekle (No, Ad, Soyad, İl, Telefon, İmza)</label>
      <label class="chk"><input type="checkbox" data-act="kkOpt" data-a="withdrawn" ${st.withdrawn ? 'checked' : ''}> Çekilenleri de ekle</label>
      <div style="flex:0 1 160px"><label>Sonuna boş satır</label><input type="number" min="0" max="50" value="${st.blank}" data-act="kkBlank"></div></div>
      <div class="row tight" style="margin-top:12px"><button class="b big" data-act="kkXlsx" ${chosen.length ? '' : 'disabled'}>⬇ Excel indir (.xlsx)</button><button class="b sec big" data-act="kkPrint" ${chosen.length ? '' : 'disabled'}>🖨 Yazdır / PDF</button></div>
      <p class="muted" style="margin:8px 0 0">Her kategori ayrı sayfa (sayfa adı = kategori). Sporcular Ad’a göre alfabetik sıralanır. İl sütunu en çok 25 karakterdir.</p></div>`;
    return h;
  };
  const kkClub = (c) => String(c || '').slice(0, 25);   // İl/kulüp sütunu en çok 25 karakter
  const kkPlayers = (c, st) => c.players.filter(p => st.withdrawn || p.status !== 'withdrawn').slice().sort((a, b) => collator.compare(a.ad, b.ad) || collator.compare(a.soyad, b.soyad));
  const telFmt = (t) => (t && t.length === 10 ? `(${t.slice(0, 3)}) ${t.slice(3, 6)}-${t.slice(6)}` : t || '');
  ACT.kkCat = (el) => { const { tn } = A.ctx(), st = kst(tn); const s = st.cats || new Set(tn.cats.map(c => c.id)); if (el.checked) s.add(el.dataset.a); else s.delete(el.dataset.a); st.cats = s; A.render(); };
  ACT.kkOpt = (el) => { kst(A.ctx().tn)[el.dataset.a] = el.checked; A.render(); };
  ACT.kkBlank = (el) => { kst(A.ctx().tn).blank = Math.max(0, Math.min(50, Math.round(+el.value || 0))); A.render(); };
  const kkChosen = () => { const { tn } = A.ctx(), st = kst(tn), sel = st.cats || new Set(tn.cats.map(c => c.id)); return { tn, st, cats: tn.cats.filter(c => sel.has(c.id)) }; };
  ACT.kkXlsx = () => {
    const { tn, st, cats } = kkChosen();
    const wb = XO.buildKayitKontrol(XLSX, cats, { header: st.header, blank: st.blank, phone: st.phone, withdrawn: st.withdrawn });
    XLSX.writeFile(wb, A.safeName(tn.info.name) + '-kayit-kontrol.xlsx'); A.toast('Excel hazırlandı');
  };
  ACT.kkPrint = () => {
    const { tn, st, cats } = kkChosen(); const root = document.createElement('div'); root.className = 'kkprint';
    cats.forEach(c => {
      const sec = document.createElement('section'); sec.className = 'kkpage';
      const h1 = document.createElement('h1'); h1.textContent = XO.kkTitle(c.name); sec.appendChild(h1);
      const sub = document.createElement('div'); sub.className = 'kksub'; sub.textContent = tn.info.name + (tn.info.date ? ' · ' + fmtDate(tn.info.date) : ''); sec.appendChild(sub);
      const tb = document.createElement('table'); const hd = tb.createTHead().insertRow();
      ['No', 'Ad', 'Soyad', 'İl', 'Telefon', 'İmza / Not'].forEach(x => { const th = document.createElement('th'); th.textContent = x; hd.appendChild(th); });
      const body = tb.createTBody(); const ps = kkPlayers(c, st);
      for (let i = 0; i < ps.length + st.blank; i++) { const p = ps[i], r = body.insertRow(); [i + 1, p ? p.ad : '', p ? p.soyad : '', p ? kkClub(p.club) : '', p && st.phone ? telFmt(p.tel) : '', ''].forEach(x => { r.insertCell().textContent = x; }); }
      sec.appendChild(tb); root.appendChild(sec);
    });
    A.setPrint(root); A.doPrint();
  };
  A.tools.prepareKK = () => { ACT.kkPrint = ACT.kkPrint; };
  ACT.kkPhoneFile = guard(async (el) => {
    const f = el.files && el.files[0]; if (!f) return;
    try {
      const { tn } = A.ctx(); const wb = I.readWorkbook(XLSX, await f.arrayBuffer(), f.size), list = I.parsePhoneSheets(XLSX, wb);
      const m = I.matchPhones(tn.cats, list), withTel = list.filter(e => e.tel).length;
      A.dialog(`<h3>Telefon eşleme sonucu</h3><div class="note ${m.hits.length ? 'ok' : 'err'}"><b>${m.hits.length}</b> sporcu eşleşti · <b>${m.missing.length}</b> sporcu bulunamadı · dosyada ${withTel} telefonlu satır</div>
        ${m.missing.length ? `<details><summary>Bulunamayanlar (${m.missing.length})</summary><ul>${m.missing.slice(0, 60).map(x => `<li>${esc(nm(x.p))} <span class="muted">${esc(x.cat)}</span></li>`).join('')}</ul></details>` : ''}
        ${m.unused.length ? `<details><summary>Dosyada olup eşleşmeyenler (${m.unused.length})</summary><ul>${m.unused.slice(0, 60).map(x => `<li>${esc(x.ad)} ${esc(x.soyad)}</li>`).join('')}</ul></details>` : ''}
        <p class="muted">Telefon 10 hane değilse sporcu atlanmaz, olduğu gibi yazılır. Mevcut telefonların üzerine yazılır.</p>
        <div class="row tight"><button class="b" id="ok" ${m.hits.length ? '' : 'disabled'}>Uygula</button><button class="b sec" data-close>Vazgeç</button></div>`, d => {
        $('#ok', d).onclick = () => { m.hits.forEach(h => { h.p.tel = h.tel; tn.cats.forEach(c => c.players.forEach(q => { if (q.kisiId === h.p.kisiId) q.tel = h.tel; })); }); A.save(); d.close(); A.toast(m.hits.length + ' sporcunun telefonu işlendi'); A.render(); };
      });
    } catch (e) { A.toast(e.message, 6000); }
  });

  /* ============================================================= KARTLAR */
  const kcS = {};
  const kc = (tn) => {
    if (!kcS[tn.id]) kcS[tn.id] = { tab: 'yaka', cats: null, ex: new Set(), sort: 'no', withdrawn: false, merge: false, page: 0,
      layout: (tn.card.yaka && tn.card.yaka.layout) || 'center', dx: (tn.card.yaka && +tn.card.yaka.dx) || 0, dy: (tn.card.yaka && +tn.card.yaka.dy) || 0, marks: !!(tn.card.yaka && tn.card.yaka.marks), bg: (tn.card.yaka && +tn.card.yaka.bg) || 25, ty: { yaka: tyOf(tn.card.yaka && (tn.card.yaka.ty || tn.card.yaka)), masa: tyOf(tn.card.masa && tn.card.masa.ty) }, dashZero: !!(tn.card.masa && tn.card.masa.dashZero) };
    return kcS[tn.id];
  };
  const SLOTS_BY = {
    yaka: [['yHeader', 'Yaka başlık görseli', 'Kartın üst alanı · 90×120 mm kart, alan 72×36 mm', '850 × 425 px (2:1, 300 dpi)'], ['footer', 'Yaka alt logo şeridi', 'Kartın alt kısmı · alan 72×17 mm', '850 × 200 px (≈4,2:1, 300 dpi)'], ['cardBg', 'Yaka arka planı', 'İsteğe bağlı filigran (netlik ayarlanabilir); yoksa federasyon logosu filigran olur; yoksa satranç deseni · 90×120 mm', '1063 × 1417 px (3:4, 300 dpi)']],
    masa: [['header', 'Masa başlık görseli', 'Masa kartı ortası · iki logo varsa alan 95×19,5 mm, logo yoksa 139×19,5 mm', '1120 × 230 px (≈5:1, 300 dpi); logosuzsa 1640 × 230 px'], ['logoL', 'Masa sol logo', 'İsteğe bağlı · alan 22×21 mm', '260 × 250 px (300 dpi)'], ['logoR', 'Masa sağ logo (federasyon)', 'İsteğe bağlı · alan 19×21 mm', '225 × 250 px (300 dpi)']]
  };
  /* Yüklenen görsel bu piksele otomatik ayarlanır (300 dpi). cover: kırparak doldurur; diğerleri oranı koruyup sığdırır (şeffaf boşluk). */
  const PX = { yHeader: { w: 850, h: 425 }, footer: { w: 850, h: 200 }, cardBg: { w: 1063, h: 1417, cover: true }, header: { w: 1120, h: 230 }, logoL: { w: 260, h: 250 }, logoR: { w: 225, h: 250 } };
  const SLOTS = [].concat(SLOTS_BY.yaka, SLOTS_BY.masa);
  function cardItems(tn, st) {
    const sel = st.cats || new Set(tn.cats.map(c => c.id));
    const cats = tn.cats.filter(c => sel.has(c.id)); const out = [];
    const srt = (a, b) => (st.sort === 'alfa' ? collator.compare(a.ad, b.ad) || collator.compare(a.soyad, b.soyad) : (a.no || 9999) - (b.no || 9999));
    const items = cats.map(c => ({ c, ps: c.players.filter(p => (st.withdrawn || p.status !== 'withdrawn') && !st.ex.has(p.id)).sort(srt) }));
    if (st.merge) out.push(items.flatMap(x => x.ps.map(p => ({ p, cat: x.c.name }))));
    else items.forEach(x => out.push(x.ps.map(p => ({ p, cat: x.c.name }))));
    return { cats, groups: out.filter(g => g.length), items };
  }
  const pageCount = (groups) => groups.reduce((s, g) => s + C.sheetCount(g.length), 0);
  A.views.kart = (ctx) => {
    const r = ready(ctx, 'Yaka ve Masa Kartları'); if (r.stop) return r.stop;
    const { tn } = ctx, st = kc(tn), { cats, groups, items } = cardItems(tn, st), pages = pageCount(groups);
    if (st.page >= pages) st.page = Math.max(0, pages - 1);
    const sel = st.cats || new Set(tn.cats.map(c => c.id));
    const noClub = st.tab === 'masa' ? 0 : 0;
    let h = r.h + `<div class="subtabs noprint"><button class="${st.tab === 'yaka' ? 'on' : ''}" data-act="kcTab" data-a="yaka">Yaka kartı (90×120 mm, 4/sayfa)</button><button class="${st.tab === 'masa' ? 'on' : ''}" data-act="kcTab" data-a="masa">Masa kartı (A4’te 4 yatay kart)</button></div>
      <div class="card noprint"><h3>${st.tab === 'yaka' ? 'Yaka kartı görselleri' : 'Masa kartı görselleri'}</h3><p class="muted" style="margin-top:0">PNG/JPG/WEBP · en çok 2 MB. Görseller yalnızca bu cihazda saklanır. Yüklenen görsel önerilen piksele otomatik ayarlanır (oran korunur; arka plan görseli kırpılarak doldurulur). Yüklenmeyen alan boş bırakılır.</p>
      <div class="slots">${SLOTS_BY[st.tab].map(([k, l, d, px]) => `<div class="slot"><div class="thumb" data-thumb="${k}">${tn.assets[k] ? '' : '<span class="muted">yok</span>'}</div><div><b>${l}</b><br><small class="muted">${d}</small><br><small><b>Önerilen boyut:</b> ${px}</small><div class="row tight" style="margin-top:6px"><label class="b sm sec" style="cursor:pointer">Yükle<input type="file" data-act="imgUp" data-a="${k}" accept="image/png,image/jpeg,image/webp" hidden></label>${tn.assets[k] ? `<button class="b sm red" data-act="imgDel" data-a="${k}">Kaldır</button>` : ''}</div></div></div>`).join('')}</div></div>
      <div class="card noprint"><h3>Kategori ve sporcular</h3><div class="chips">${tn.cats.map(c => `<label class="chk chip2"><input type="checkbox" data-act="kcCat" data-a="${c.id}" ${sel.has(c.id) ? 'checked' : ''}> ${esc(c.name)} <span class="muted">${c.players.length}</span></label>`).join('')}</div>
      <div class="row" style="margin-top:10px"><div style="flex:0 1 200px"><label>Sıralama</label><select data-act="kcOpt" data-a="sort"><option value="no" ${st.sort === 'no' ? 'selected' : ''}>Başlangıç numarası</option><option value="alfa" ${st.sort === 'alfa' ? 'selected' : ''}>Alfabetik (ad)</option></select></div>
      <label class="chk"><input type="checkbox" data-act="kcOptC" data-a="withdrawn" ${st.withdrawn ? 'checked' : ''}> Çekilenleri de bas</label>
      <label class="chk"><input type="checkbox" data-act="kcOptC" data-a="merge" ${st.merge ? 'checked' : ''}> Kategorileri birleştir (tek sayfa dizisi)</label>
      <label class="chk"><input type="checkbox" data-act="kcOptC" data-a="dashZero" ${st.dashZero ? 'checked' : ''}> Puansızsa “-” yaz (varsayılan: 0)</label></div>
      <div class="row" style="margin-top:8px;align-items:flex-end"><div style="flex:0 1 190px"><label>Yazı tipi</label><select data-act="kcTy" data-a="font">${C.FONTS.map(f => `<option value="${f[0]}" ${st.ty[st.tab].font === f[0] ? 'selected' : ''} style="font-family:${f[2].replace(/"/g, "'")}">${f[1]}</option>`).join('')}</select></div>
        <div style="flex:0 1 130px"><label>Yazı büyüklüğü</label><select data-act="kcTy" data-a="scale">${[70, 80, 90, 100, 110, 120, 130].map(v => `<option value="${v}" ${st.ty[st.tab].scale === v ? 'selected' : ''}>%${v}${v === 100 ? ' (varsayılan)' : ''}</option>`).join('')}</select></div>
        <label class="chk"><input type="checkbox" data-act="kcTyC" data-a="bold" ${st.ty[st.tab].bold ? 'checked' : ''}> <b>Kalın</b></label><label class="chk"><input type="checkbox" data-act="kcTyC" data-a="italic" ${st.ty[st.tab].italic ? 'checked' : ''}> <i>İtalik</i></label></div>
      ${st.tab === 'yaka' ? `<div class="row" style="margin-top:8px"><div style="flex:0 1 200px"><label>Yerleşim</label><select data-act="kcOpt" data-a="layout"><option value="center" ${st.layout === 'center' ? 'selected' : ''}>Sayfada ortalı</option><option value="ornek" ${st.layout === 'ornek' ? 'selected' : ''}>Örnek dosyadaki konum</option></select></div>
        <div style="flex:0 1 130px"><label>Kaydır X (mm)</label><input type="number" step="0.5" min="-20" max="20" value="${st.dx}" data-act="kcOpt" data-a="dx"></div><div style="flex:0 1 130px"><label>Kaydır Y (mm)</label><input type="number" step="0.5" min="-20" max="20" value="${st.dy}" data-act="kcOpt" data-a="dy"></div>
        <div style="flex:1 1 220px"><label>Arka plan netliği: %${st.bg}</label><input type="range" min="5" max="100" step="1" value="${st.bg}" data-act="kcOpt" data-a="bg" aria-label="Arka plan netliği"><small class="muted">%25 varsayılan · %100 tam net (yazılar okunmayabilir)</small></div>
        <label class="chk"><input type="checkbox" data-act="kcOptC" data-a="marks" ${st.marks ? 'checked' : ''}> Kesim işaretleri</label></div>` : ''}
      <div class="row tight" style="margin-top:10px"><button class="b sm sec" data-act="clubPaste">Kulüp adlarını toplu yapıştır</button><button class="b sm sec" data-act="kcAll">Tümünü seç / kaldır</button></div>
      <details style="margin-top:10px"><summary>Sporcu seçimi (${items.reduce((s, x) => s + x.ps.length, 0)} basılacak)</summary>${tn.cats.filter(c => sel.has(c.id)).map(c => `<h4 style="margin:8px 0 4px">${esc(c.name)}</h4><div class="tblw" style="max-height:260px"><table><tr><th></th><th class="n">No</th><th>Ad Soyad</th><th>Kulüp</th></tr>${c.players.map(p => `<tr class="${p.status === 'withdrawn' ? 'out' : ''}"><td><input type="checkbox" data-act="kcPl" data-a="${p.id}" ${st.ex.has(p.id) ? '' : 'checked'} aria-label="Seç"></td><td class="n">${p.no}</td><td>${esc(nm(p))}</td><td>${esc(p.club)}</td></tr>`).join('')}</table></div>`).join('')}</details></div>
      <div class="card"><div class="row tight noprint" style="align-items:center"><b>${pages} sayfa</b><span class="muted">(${groups.map(g => g.length + ' kart → ' + C.sheetCount(g.length)).join(' + ') || '—'})</span>
        <span style="flex:1"></span><button class="b sm sec" data-act="kcPg" data-a="-1" ${st.page <= 0 ? 'disabled' : ''}>◀</button><span>${pages ? st.page + 1 : 0} / ${pages}</span><button class="b sm sec" data-act="kcPg" data-a="1" ${st.page >= pages - 1 ? 'disabled' : ''}>▶</button>
        <button class="b big" data-act="kcPrint" ${pages ? '' : 'disabled'}>🖨 Yazdır / PDF olarak kaydet</button></div>
      <div class="note info noprint" style="margin-top:8px">Yazdırma penceresinde: <b>Kağıt A4</b>, <b>Ölçek %100</b> (sığdır değil), <b>Kenar boşlukları: Yok</b>, <b>Arka plan grafikleri: Açık</b> seçin. ${st.tab === 'masa' ? 'Masa kartlarında UKD/ELO kayıtlı güncel değerdir; yazdırmadan önce UKD/ELO sayfasını kullanmanız önerilir.' : ''}</div>
      <div class="sheetwrap" id="cardPrev"></div></div>`;
    A.after.push(() => { thumbs(tn); drawPreview(tn); });
    return h;
  };
  async function loadImgs(tn) { const o = {}; for (const [k] of SLOTS) if (tn.assets[k]) { try { o[k] = await S.getURL(tn.id, k); } catch (e) { o[k] = null; } } return o; }
  async function thumbs(tn) {
    for (const [k] of SLOTS) { const el = $(`[data-thumb="${k}"]`); if (el && tn.assets[k]) { const u = await S.getURL(tn.id, k); if (u) { const i = document.createElement('img'); i.src = u; i.alt = ''; el.textContent = ''; el.appendChild(i); } } }
  }
  const tyOf = (o) => ({ font: (o && o.font) || 'arial', bold: !(o && o.bold === false), italic: !!(o && o.italic), scale: (o && +o.scale) || 100 });
  const sheetOpts = (st) => { const i = (A.ctx().tn || {}).info || {}, d = [fmtDate(i.date), i.dateEnd && i.dateEnd !== i.date ? fmtDate(i.dateEnd) : ''].filter(Boolean).join(' – '); return { title: i.name || '', dates: d, place: i.place || '', font: st.ty[st.tab].font, bold: st.ty[st.tab].bold, italic: st.ty[st.tab].italic, scale: st.ty[st.tab].scale, bg: st.bg, layout: st.layout, dx: st.dx, dy: st.dy, marks: st.marks, dashZero: st.dashZero }; };
  function buildSheet(st, imgs, chunk) { return st.tab === 'yaka' ? C.yakaSheet(chunk, imgs, sheetOpts(st)) : C.masaSheet(chunk, imgs, sheetOpts(st)); }
  function allChunks(groups) { const l = []; groups.forEach(g => C.paginate(g).forEach(ch => l.push(ch))); return l; }
  async function drawPreview(tn) {
    const host = $('#cardPrev'); if (!host) return;
    const st = kc(tn), { groups } = cardItems(tn, st), chunks = allChunks(groups);
    host.textContent = ''; if (!chunks.length) return;
    const imgs = await loadImgs(tn); if (!$('#cardPrev')) return;
    const sh = buildSheet(st, imgs, chunks[st.page] || chunks[0]);
    const z = Math.min(1, Math.max(0.3, (host.clientWidth || 600) / 794)); host.style.setProperty('--z', z); host.style.height = Math.round(1123 * z) + 'px';
    host.appendChild(sh);
  }
  /** Tüm sayfaları #printRoot'a üretir (20'şerlik partiler halinde). */
  A.tools.prepareCards = async () => {
    const { tn } = A.ctx(), st = kc(tn), { groups } = cardItems(tn, st), chunks = allChunks(groups), imgs = await loadImgs(tn);
    const root = document.createElement('div'); root.className = 'cardprint';
    for (let i = 0; i < chunks.length; i += 20) {
      chunks.slice(i, i + 20).forEach(ch => root.appendChild(buildSheet(st, imgs, ch)));
      await new Promise(r => setTimeout(r, 0));
    }
    A.setPrint(root);
    await Promise.all([...root.querySelectorAll('img')].map(im => (im.decode ? im.decode().catch(() => {}) : Promise.resolve())));
    return chunks.length;
  };
  ACT.kcPrint = async () => { A.toast('Sayfalar hazırlanıyor…', 1500); const n = await A.tools.prepareCards(); if (n) A.doPrint(); };
  const cardsSave = (tn, st) => { tn.card.yaka = { ty: st.ty.yaka, bg: st.bg, layout: st.layout, dx: st.dx, dy: st.dy, marks: st.marks }; tn.card.masa = { dashZero: st.dashZero, ty: st.ty.masa }; A.save({ clean: true }); };
  ACT.kcTab = (el) => { const { tn } = A.ctx(); const st = kc(tn); st.tab = el.dataset.a; st.page = 0; A.render(); };
  ACT.kcCat = (el) => { const { tn } = A.ctx(), st = kc(tn); const s = st.cats || new Set(tn.cats.map(c => c.id)); if (el.checked) s.add(el.dataset.a); else s.delete(el.dataset.a); st.cats = s; st.page = 0; A.render(); };
  ACT.kcOpt = (el) => { const { tn } = A.ctx(), st = kc(tn), k = el.dataset.a; st[k] = k === 'bg' ? Math.max(5, Math.min(100, Math.round(+el.value) || 18)) : (k === 'dx' || k === 'dy') ? Math.max(-20, Math.min(20, +el.value || 0)) : el.value; st.page = 0; cardsSave(tn, st); A.render(); };
  ACT.kcTy = (el) => { const { tn } = A.ctx(), st = kc(tn), k = el.dataset.a; st.ty[st.tab][k] = k === 'scale' ? Math.max(60, Math.min(160, +el.value || 100)) : el.value; cardsSave(tn, st); A.render(); };
  ACT.kcTyC = (el) => { const { tn } = A.ctx(), st = kc(tn); st.ty[st.tab][el.dataset.a] = el.checked; cardsSave(tn, st); A.render(); };
  ACT.kcOptC = (el) => { const { tn } = A.ctx(), st = kc(tn); st[el.dataset.a] = el.checked; st.page = 0; cardsSave(tn, st); A.render(); };
  ACT.kcPl = (el) => { const { tn } = A.ctx(), st = kc(tn); if (el.checked) st.ex.delete(el.dataset.a); else st.ex.add(el.dataset.a); A.render(); };
  ACT.kcAll = () => { const { tn } = A.ctx(), st = kc(tn); const sel = st.cats || new Set(tn.cats.map(c => c.id)); const ids = tn.cats.filter(c => sel.has(c.id)).flatMap(c => c.players.map(p => p.id)); if (ids.some(id => st.ex.has(id))) ids.forEach(id => st.ex.delete(id)); else ids.forEach(id => st.ex.add(id)); A.render(); };
  ACT.kcPg = (el) => { const { tn } = A.ctx(), st = kc(tn); st.page = Math.max(0, st.page + (+el.dataset.a)); A.render(); };
  ACT.imgUp = guard(async (el) => {
    const f = el.files && el.files[0]; if (!f) return; const { tn } = A.ctx();
    try { const b = await S.processImage(f, PX[el.dataset.a]); await S.putImage(tn.id, el.dataset.a, b); tn.assets[el.dataset.a] = true; A.save({ clean: true }); A.toast('Görsel yüklendi'); A.render(); } catch (e) { A.toast(e.message, 6000); }
  });
  ACT.imgDel = guard(async (el) => { const { tn } = A.ctx(); await S.delImage(tn.id, el.dataset.a); delete tn.assets[el.dataset.a]; A.save({ clean: true }); A.render(); });
  ACT.clubPaste = guard(() => {
    const { tn } = A.ctx();
    A.dialog(`<h3>Kulüp adlarını toplu yapıştır</h3><p class="muted">Her satıra <code>Ad Soyad</code> sekme (Tab) veya noktalı virgül <code>;</code> ve <code>Kulüp adı</code> yazın (Excel’den iki sütun kopyalayabilirsiniz). Ad+soyad eşleşenlere kulüp adı yazılır.</p><textarea id="cl" maxlength="200000" placeholder="ENES TANRIVERDİ&#9;DARÜŞŞAFAKA SPOR KULÜBÜ"></textarea><div class="row tight" style="margin-top:10px"><button class="b" id="ok">Uygula</button><button class="b sec" data-close>Vazgeç</button></div>`, d => {
      $('#ok', d).onclick = () => {
        const map = new Map(); $('#cl', d).value.split(/\r?\n/).forEach(l => { const m = l.split(/\t|;/); if (m.length >= 2 && m[0].trim()) map.set(I.fold(m[0]), m.slice(1).join(' ').trim().slice(0, 80)); });
        let n = 0; tn.cats.forEach(c => c.players.forEach(p => { const v = map.get(I.fold(p.ad + ' ' + p.soyad)) || map.get(I.fold(p.ad + p.soyad)); if (v != null) { p.club = v; n++; } }));
        A.save(); d.close(); A.toast(n + ' sporcunun kulübü güncellendi'); A.render();
      };
    });
  });

  /* ============================================================= UKD / ELO */
  const rkS = {};
  const rk = (tn) => (rkS[tn.id] = rkS[tn.id] || { nat: null, rows: [], file: '' });
  const LV = { 'kesin-tc': ['kesin', 'TC'], 'kesin-fide': ['kesin', 'FIDE No'], 'kesin-ad': ['kesin', 'ad+soyad+doğum'], olasi: ['olası', 'ad+soyad+doğum yılı'], zayif: ['zayıf', 'yalnız ad+soyad'], belirsiz: ['belirsiz', 'birden çok aday'], yok: ['bulunamadı', ''] };
  A.views.sorgu = (ctx) => {
    const r = ready(ctx, 'UKD ve ELO'); if (r.stop) return r.stop;
    const { tn } = ctx, st = rk(tn), db = A.db();
    const started = tn.cats.filter(c => c.rounds.length);
    let h = r.h + `<div class="card noprint"><h3>1) TSF ulusal liste Excel’i</h3><p class="muted" style="margin-top:0">TSF’den aldığınız ulusal (UKD) listesini yükleyin; sporcular otomatik eşleştirilir, farkları görüp onaylarsınız. <b>İnternet sorgusu yapılmaz</b>; hiçbir veri dışarı gönderilmez. Kabul edilen sütunlar: ID_No, FirstName, Name, Birthday, Rtg_Nat (ayrıca FIDE-No ve ELO sütunu varsa ELO da güncellenir).</p>
      <label class="drop" data-drop="rkFile"><input type="file" data-act="rkFile" accept=".xlsx,.xls,.csv" hidden><b>Liste Excel’ini buraya bırakın</b><span>veya dokunup seçin</span></label>
      ${started.length ? `<div class="note">Eşleştirmesi yapılmış kategoriler (${esc(started.map(c => c.name).join(', '))}) güncellenmez: turnuva başladıktan sonra UKD değişikliği sırayı etkilemez ve engellenir.</div>` : ''}</div>`;
    const lockedNames = new Set(started.map(c => c.name));
    st.rows.forEach(x => { x.locked = x.cats.every(n => lockedNames.has(n)); if (x.locked) x.apply = false; });
    if (st.nat) {
      const cnt = { kesin: 0, olasi: 0, zayif: 0, belirsiz: 0, yok: 0 }; st.rows.forEach(x => { cnt[x.type.startsWith('kesin') ? 'kesin' : x.type]++; });
      const sel = st.rows.filter(x => x.apply).length, lockedN = st.rows.filter(x => x.locked && x.match && (x.newUkd != null || x.newElo != null)).length, same = st.rows.filter(x => x.match && x.newUkd == null && x.newElo == null).length;
      h += `<div class="card"><h3>2) Eşleme önizlemesi <small class="muted">${esc(st.file)} · ${st.nat.list.length} satır</small></h3>
        <div class="stats"><div><b>${cnt.kesin}</b><small>Kesin</small></div><div><b>${cnt.olasi + cnt.zayif}</b><small>Olası/zayıf</small></div><div><b>${cnt.belirsiz}</b><small>Belirsiz</small></div><div><b>${cnt.yok}</b><small>Bulunamadı</small></div><div><b>${sel}</b><small>Uygulanacak</small></div><div><b>${same}</b><small>Değişmeyen</small></div></div>
        <div class="row tight noprint" style="margin:10px 0"><button class="b sm sec" data-act="rkSure">Kesin olanları seç</button><button class="b sm sec" data-act="rkNone">Seçimi temizle</button><button class="b sm sec" data-act="rkMissX" ${cnt.yok ? '' : 'disabled'}>Bulunamayanları indir (xlsx)</button>
        <label class="chk"><input type="checkbox" id="rk_tc"> TC’si boş sporcuya listedeki TC’yi de kaydet</label></div>
        <div class="tblw"><table class="rk"><tr><th></th><th>Sporcu</th><th>Kategori</th><th>Eşleşme</th><th class="n">UKD</th><th class="n">Fark</th><th class="n">ELO</th></tr>
        ${st.rows.filter(x => x.type !== 'yok').sort((a, b) => (b.apply - a.apply) || (LVR(a.type) - LVR(b.type))).map(x => { const lv = LV[x.type]; const dif = x.newUkd != null ? x.newUkd - x.oldUkd : null; return `<tr class="${x.apply ? '' : 'dim'}"><td><input type="checkbox" data-act="rkSel" data-a="${x.kisiId}" ${x.apply ? 'checked' : ''} ${x.match && !x.locked && (x.newUkd != null || x.newElo != null) ? '' : 'disabled'} aria-label="Uygula"></td>
          <td><b>${esc(nm(x.p))}</b><br><small class="muted">${esc(fmtDate(x.p.birthDate))}</small>${x.locked ? '<br><span class="pill gray">turnuva başladı</span>' : ''}</td><td>${esc(x.cats.join(', '))}</td>
          <td><span class="pill ${lv[0] === 'kesin' ? '' : lv[0] === 'belirsiz' ? 'err' : 'warn'}">${lv[0]}</span><br><small class="muted">${esc(lv[1])}</small>
            ${x.type === 'belirsiz' ? `<select data-act="rkCand" data-a="${x.kisiId}" style="margin-top:4px"><option value="">aday seç…</option>${x.cand.map((e, i) => `<option value="${i}">${esc(e.ad + ' ' + e.soyad)} · ${esc(fmtDate(e.birthDate))} · UKD ${e.ukd}</option>`).join('')}</select>` : ''}</td>
          <td class="n">${x.oldUkd || '–'}${x.newUkd != null ? ' → <b>' + x.newUkd + '</b>' : ''}${x.note ? `<br><small class="muted">${esc(x.note)}</small>` : ''}</td><td class="n ${dif > 0 ? 'up' : dif < 0 ? 'dn' : ''}">${dif == null ? '' : (dif > 0 ? '+' : '') + dif}</td>
          <td class="n">${x.oldElo || '–'}${x.newElo != null ? ' → <b>' + x.newElo + '</b>' : ''}</td></tr>`; }).join('')}</table></div>
        <div class="row tight noprint" style="margin-top:12px"><button class="b big" data-act="rkApply" ${sel ? '' : 'disabled'}>Seçilenleri uygula (${sel})</button></div>${!sel && lockedN ? `<div class="note">${lockedN} sporcunun kategorisinde eşleştirme yapıldığı için güncelleme yapılamaz (turnuva başladıktan sonra UKD değişikliği engellenir).</div>` : ''}</div>`;
    }
    if (tn.lastRatingBatch) h += `<div class="card noprint"><b>Son uygulama</b> <span class="muted">${esc(A.ago(tn.lastRatingAt))}</span> <button class="b sm sec" data-act="rkUndo" style="margin-left:8px">Geri al</button></div>`;
    const P = db.prefs;
    h += `<div class="card"><h3>${st.nat ? '3' : '2'}) Sporcu başına bağlantılar</h3><p class="muted" style="margin-top:0">Bağlantılar yeni sekmede açılır; uygulama hiçbir bilgiyi otomatik göndermez. TSF bağlantısı UKD sorgulama sayfasına gider; FIDE sayfası için sporcunun FIDE No’su gerekir.</p>
      <div class="row noprint"><div><label>FIDE profil adresi şablonu <small class="muted">({fideNo})</small></label><input data-act="prefUrl" data-a="fideUrlTpl" value="${esc(P.fideUrlTpl)}" maxlength="200" placeholder="https://ratings.fide.com/profile/{fideNo}"></div></div>
      <p class="noprint" style="margin:8px 0 0"><a class="b sec sm" target="_blank" rel="noopener noreferrer" href="${TSF_UKD}">TSF UKD sorgulama ↗</a></p>
      <div class="tblw" style="margin-top:8px"><table><tr><th>Sporcu</th><th>Kategori</th><th class="n">UKD</th><th class="n">ELO</th><th>FIDE No</th><th>Bağlantılar</th></tr>${links(tn)}</table></div></div>`;
    return h;
  };
  const LVR = (t) => ({ 'kesin-tc': 0, 'kesin-fide': 0, 'kesin-ad': 0, olasi: 1, zayif: 2, belirsiz: 3 }[t] ?? 4);
  const TSF_UKD = 'https://ukd.tsf.org.tr/ukdsorgulama.php';   // TSF UKD sorgulama sayfası (sabit)
  function links(tn) {
    const P = A.db().prefs, seen = new Set(), out = [];
    tn.cats.forEach(c => c.players.forEach(p => { if (seen.has(p.kisiId)) return; seen.add(p.kisiId);
      const f = RM.linkFrom(P.fideUrlTpl, p), t = TSF_UKD;
      out.push(`<tr><td>${esc(nm(p))}</td><td>${esc(c.name)}</td><td class="n">${p.rating || ''}</td><td class="n">${p.elo || ''}</td><td>${esc(p.fideNo)}</td><td><a class="lk" target="_blank" rel="noopener noreferrer" href="${esc(t)}">TSF ↗</a> ${f ? `<a class="lk" target="_blank" rel="noopener noreferrer" href="${esc(f)}">FIDE ↗</a>` : '<span class="muted">FIDE yok</span>'}</td></tr>`); }));
    return out.join('');
  }
  ACT.prefUrl = (el) => {
    const v = el.value.trim(); if (v && !/^https:\/\//i.test(v)) { A.toast('Adres https:// ile başlamalı.'); return A.render(); }
    A.db().prefs[el.dataset.a] = v; A.save({ clean: true }); A.render();
  };
  ACT.rkFile = guard(async (el) => {
    const f = el.files && el.files[0]; if (!f) return; const { tn } = A.ctx(), st = rk(tn);
    try {
      const wb = I.readWorkbook(XLSX, await f.arrayBuffer(), f.size), nat = RM.readNatList(XLSX, wb);
      if (!nat.list.length) return A.toast(nat.errors[0] || 'Listede sporcu bulunamadı.', 7000);
      st.nat = nat; st.file = f.name; st.rows = RM.matchPlayers(tn.cats, nat); A.render();
    } catch (e) { A.toast(e.message, 6000); }
  });
  ACT.rkSel = (el) => { const x = rk(A.ctx().tn).rows.find(r => r.kisiId === el.dataset.a); if (x) x.apply = el.checked; A.render(); };
  ACT.rkSure = () => { const st = rk(A.ctx().tn); st.rows.forEach(x => { x.apply = !x.locked && x.type.startsWith('kesin') && (x.newUkd != null || x.newElo != null); }); A.render(); };
  ACT.rkNone = () => { rk(A.ctx().tn).rows.forEach(x => { x.apply = false; }); A.render(); };
  ACT.rkCand = (el) => { const st = rk(A.ctx().tn), x = st.rows.find(r => r.kisiId === el.dataset.a); if (x && el.value !== '') { RM.chooseCandidate(x, +el.value, st.nat); x.apply = x.newUkd != null || x.newElo != null; } A.render(); };
  ACT.rkMissX = () => {
    const { tn } = A.ctx(), st = rk(tn); const rows = [['Ad', 'Soyad', 'Kategori', 'Doğum', 'UKD']].concat(st.rows.filter(x => x.type === 'yok').map(x => [x.p.ad, x.p.soyad, x.cats.join(', '), x.p.birthDate, x.p.rating]));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Bulunamadı'); XLSX.writeFile(wb, A.safeName(tn.info.name) + '-ukd-bulunamayanlar.xlsx');
  };
  ACT.rkApply = guard(async () => {
    const { tn } = A.ctx(), st = rk(tn), n = st.rows.filter(x => x.apply).length; if (!n) return;
    if (!(await A.ask(`${n} sporcunun UKD/ELO değeri güncellensin mi? (Yalnız eşleştirmesi başlamamış kategorilerde uygulanır; geri alınabilir.)`, { ok: 'Uygula' }))) return;
    await A.snap('ukd-uygulama');
    const res = RM.applyMatches(tn.cats, st.rows, { saveTC: $('#rk_tc') && $('#rk_tc').checked, src: 'liste:' + st.file.slice(0, 60) });
    if (res.updated) { tn.lastRatingBatch = res.batch; tn.lastRatingAt = Date.now(); }
    A.save(); st.rows = RM.matchPlayers(tn.cats, st.nat);
    A.toast(`${res.updated} kayıt güncellendi` + (res.blocked.length ? `; ${res.blocked.join(', ')} kategorisinde turnuva başladığı için engellendi` : ''), 6000); A.render();
  });
  ACT.rkUndo = guard(async () => {
    const { tn } = A.ctx(); if (!(await A.ask('Son UKD/ELO uygulaması geri alınsın mı?', { ok: 'Geri al' }))) return;
    const n = RM.undoBatch(tn.cats, tn.lastRatingBatch); delete tn.lastRatingBatch; A.save(); const st = rk(tn); if (st.nat) st.rows = RM.matchPlayers(tn.cats, st.nat); A.toast(n + ' kayıt geri alındı'); A.render();
  });
})();
