/* Kategori bağlamında çalışan ekranlar: Ayar, Sporcular, Turlar, Sıralama, Çapraz Tablo, Kurallar. */
(function () {
  'use strict';
  const A = window.App, { $, $$, esc, ACT, fmt } = A;
  const M = window.Model, E = window.Engine, R = window.Rules, I = window.Importer;
  const CT = () => A.ctx();
  const CAT = () => A.ctx().cat;
  const TN = () => A.ctx().tn;
  const nm = (p) => (p ? `${p.ad} ${p.soyad}`.trim() : '—');
  const nmw = (p) => nm(p) + (p.status === 'withdrawn' ? ' (çekildi' + (p.wdFrom ? ', ' + p.wdFrom + '. turdan' : '') + ')' : '');
  const pById = (c, id) => c.players.find(p => p.id === id);
  const sysName = (s) => (s === 'swiss' ? 'İsviçre Sistemi' : 'Berger (Döner) Sistem');
  const tbOrder = (c) => (M.sysOf(c) === 'swiss' ? c.settings.tbSwiss : c.settings.tbBerger);
  const rtg = (p) => E.startRating(p) || '';
  const rv = {}, sr = {};           // kategori başına: görüntülenen tur, sıralama turu
  const guard = A.mut;

  A.views.kurallar = () => vHelp();
  A.views.cat = (tab, tn, c) => ({ ayar: vAyar, spor: vSpor, rounds: vRounds, stand: vStand, cross: vCross, help: vHelp }[tab] || vSpor)(tn, c);
  const onlyDone = () => { const { tn } = CT(); return tn; };
  ACT.goR = (el) => { rv[CAT().id] = +el.dataset.a; A.render(); };
  ACT.goStand = () => { const { tn, cat } = CT(); A.go(A.tnPath(tn, cat.id, 'stand')); };
  ACT.print = () => window.print();

  /* ============================================================= AYAR */
  function sched(c) { if (!c.schedule) c.schedule = { rounds: [], kayit: { d: '', t: '', t2: '' }, teknik: { d: '', t: '' }, odul: { d: '', t: '' } }; return c.schedule; }
  function fmtDT(d, tm) {
    if (!d && !tm) return '';
    let s = '';
    if (d) { const dt = new Date(d + 'T12:00:00'); s = isNaN(dt) ? d : dt.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + dt.toLocaleDateString('tr-TR', { weekday: 'long' }); }
    return (s + (tm ? ' ' + tm : '')).trim();
  }
  const roundWhen = (c, r) => { const x = (c.schedule && c.schedule.rounds[r - 1]) || {}; return fmtDT(x.d, x.t); };

  function vAyar(tn, c) {
    const s = c.settings, n = c.players.length, sug = M.suggest(c), sys = M.sysOf(c), started = c.started;
    const tr = M.totalRounds(c);
    const label = s.roundsManual ? '<span class="pill warn" title="Hakem tarafından elle değiştirildi">Elle</span>' : (sug.rounds != null ? `<span class="pill" title="${esc(sug.note)}">Öneri (${n} sporcu)</span>` : '<span class="pill err">Öneri yok</span>');
    let h = `<h2>${esc(c.name)} – sistem ve ayarlar</h2><div class="card">
      <div class="kv"><div><small>Sporcu sayısı</small><b>${n}</b></div><div><small>Sistem</small><b style="font-size:16px">${n >= 3 ? sysName(sys) : '—'}</b></div>
      <div><small>Tur sayısı</small><b>${tr || '—'}</b></div><div><small>Durum</small><b style="font-size:16px">${started ? 'Başladı' : 'Kayıt / hazırlık'}</b></div></div>
      <div class="note info">Prosedür md.17(4): Sistem ve tur sayısı <b>teknik toplantıda</b> duyurulur, “Kategoriyi başlat” ile kilitlenir. ${esc(sug.note)}</div>`;
    if (n >= 129 && !s.roundsManual && !started) h += `<div class="note err">${n} sporcu için otomatik öneri yoktur (kuralda 128’e kadar tanımlı). Tur sayısını hakem olarak siz girin (bilgi: ceil(log₂ ${n}) = ${sug.log2}).</div>`;
    h += '<div class="row">';
    h += `<div><label>Eşlendirme sistemi</label><select data-act="setSys" ${started || n < 3 ? 'disabled' : ''}><option value="swiss" ${sys === 'swiss' ? 'selected' : ''}>İsviçre</option><option value="berger" ${sys === 'berger' ? 'selected' : ''}>Berger (döner)</option></select>
      <small class="muted">${c.sysPref ? 'Elle seçildi' : 'Öneri: ' + (n >= 10 ? 'İsviçre (10+)' : 'Berger (9 ve altı)')}</small></div>`;
    if (sys === 'swiss') h += `<div><label>İsviçre tur sayısı ${label}</label><input type="number" min="1" max="30" data-act="setRounds" value="${s.rounds == null ? '' : s.rounds}" placeholder="girin" ${started ? 'disabled' : ''}>
      ${s.roundsManual && !started ? '<button class="b sm sec" data-act="resetRounds" style="margin-top:4px">Öneriye dön</button>' : ''}</div>`;
    else h += `<div><label>Berger devre sayısı</label><select data-act="setDouble" ${started ? 'disabled' : ''}><option value="0" ${!s.double ? 'selected' : ''}>Tek devre (${R.bergerRounds(n, false)} tur)</option><option value="1" ${s.double ? 'selected' : ''}>Çift devre (${R.bergerRounds(n, true)} tur)</option></select></div>`;
    h += `<div><label>1. tur renk kurası (1 nolu sporcu)</label><select data-act="setInitW" ${c.rounds.length && sys === 'swiss' ? 'disabled' : ''}><option value="1" ${s.initialWhite ? 'selected' : ''}>Beyaz ile başlar</option><option value="0" ${!s.initialWhite ? 'selected' : ''}>Siyah ile başlar</option></select></div>
      <div><label>Bye (tur atlama) puanı</label><select data-act="setBye"><option value="1" ${s.byePoints == 1 ? 'selected' : ''}>1 puan (galibiyet)</option><option value="0.5" ${s.byePoints == 0.5 ? 'selected' : ''}>½ puan</option><option value="0" ${s.byePoints == 0 ? 'selected' : ''}>0 puan</option></select></div></div>`;
    if (sys === 'swiss' && s.rounds > n - 1 && n > 1) h += `<div class="note">Tur sayısı (${s.rounds}) sporcu sayısından (${n}) fazla görünüyor; eşlendirme yapılamayabilir.</div>`;
    if (sys === 'swiss' && n >= 3 && n < 10 && !started) h += `<div class="note">${n} sporcu için Berger önerilir; İsviçre seçtiniz.</div>`;
    if (sys === 'berger' && n > 9 && !started) h += `<div class="note">${n} sporcu için İsviçre önerilir; Berger seçtiniz (${R.bergerRounds(n, s.double)} tur).</div>`;
    h += `<div class="row tight" style="margin-top:12px">${!started ? `<button class="b" data-act="start" ${n < 3 || (sys === 'swiss' && !(tr >= 1)) ? 'disabled title="Önce tur sayısını girin"' : ''}>Kategoriyi başlat</button>` : `<button class="b sec" data-act="unstart" ${c.rounds.some(r => r.pairings.some(p => p.result)) ? 'disabled' : ''}>Başlatmayı geri al</button>`}</div></div>`;
    return h + schedCard(c) + tbSettings(c);
  }
  ACT.setSys = guard((el) => { try { M.setSystem(CAT(), el.value); A.save(); } catch (e) { A.toast(e.message); } A.render(); });
  ACT.setRounds = guard((el) => { try { M.setRounds(CAT(), el.value); A.save(); } catch (e) { A.toast(e.message); } A.render(); });
  ACT.resetRounds = guard(() => { M.resetRounds(CAT()); A.save(); A.render(); });
  ACT.setDouble = guard((el) => { const c = CAT(); c.settings.double = el.value === '1'; M.recalcRounds(c); A.save(); A.render(); });
  ACT.setInitW = guard((el) => { CAT().settings.initialWhite = el.value === '1'; A.save(); A.render(); });
  ACT.setBye = guard((el) => { CAT().settings.byePoints = +el.value; A.save(); A.render(); });
  ACT.start = guard(() => {
    const c = CAT(), { tn } = CT();
    try { M.startCategory(c); } catch (e) { return A.toast(e.message, 5000); }
    A.save(); A.snap('baslat'); A.toast(c.system === 'swiss' ? 'Kategori başladı – 1. turu eşleştirebilirsiniz' : 'Berger tablosu oluşturuldu'); rv[c.id] = 1; A.go(A.tnPath(tn, c.id, 'rounds'));
  });
  ACT.unstart = guard(async () => { const c = CAT(); if (!(await A.ask('Başlatma geri alınsın mı? (Berger tablosu / eşlendirmeler silinir)', { ok: 'Geri al', danger: true }))) return; try { M.unstartCategory(c); } catch (e) { return A.toast(e.message); } A.save(); A.render(); });

  function schedCard(c) {
    const Rn = M.totalRounds(c) || 6, S = sched(c);
    const perDay = {}; for (let i = 0; i < Rn; i++) { const d = (S.rounds[i] || {}).d; if (d) perDay[d] = (perDay[d] || 0) + 1; }
    const over = Object.entries(perDay).filter(([d, k]) => k > 4);
    const inp = (k, type, v) => `<input type="${type}" data-act="sch" data-a="${k}" value="${esc(v || '')}" style="padding:6px">`;
    return `<h2>Tur programı</h2><div class="card"><div class="row tight noprint"><button class="b sec" data-act="autoSch">Otomatik doldur</button></div>
      <div class="tblw" style="margin-top:8px"><table><tr><th>Etkinlik</th><th>Gün</th><th>Saat</th><th>Bitiş saati</th></tr>
      <tr><td>Kayıt kontrol</td><td>${inp('kayit|d', 'date', S.kayit.d)}</td><td>${inp('kayit|t', 'time', S.kayit.t)}</td><td>${inp('kayit|t2', 'time', S.kayit.t2)}</td></tr>
      <tr><td>Teknik toplantı</td><td>${inp('teknik|d', 'date', S.teknik.d)}</td><td>${inp('teknik|t', 'time', S.teknik.t)}</td><td></td></tr>
      ${Array.from({ length: Rn }, (_, i) => { const x = S.rounds[i] || {}; return `<tr><td><b>${i + 1}. Tur</b></td><td>${inp('r|' + i + '|d', 'date', x.d)}</td><td>${inp('r|' + i + '|t', 'time', x.t)}</td><td></td></tr>`; }).join('')}
      <tr><td>Ödül töreni</td><td>${inp('odul|d', 'date', S.odul.d)}</td><td>${inp('odul|t', 'time', S.odul.t)}</td><td class="muted">son turdan sonra</td></tr></table></div>
      ${over.length ? `<div class="note">Prosedür md.15/6: UKD hesaplamalarına dâhil etkinliklerde bir günde dörtten fazla tur oynatılamaz (${over.map(([d, k]) => fmtDT(d) + ': ' + k + ' tur').join('; ')}).</div>` : ''}
      <div class="note info">Kayıt kontrol süresi 30–60 dakika olmalıdır (md.15/4); bir günlük program 12 saati aşamaz.</div></div>`;
  }
  ACT.sch = guard((el) => {
    const S = sched(CAT()), p = el.dataset.a.split('|');
    if (p[0] === 'r') { const i = +p[1]; S.rounds[i] = S.rounds[i] || {}; S.rounds[i][p[2]] = el.value; } else S[p[0]][p[1]] = el.value;
    A.save(); A.render();
  });
  ACT.autoSch = guard(() => {
    const c = CAT(), Rn = M.totalRounds(c) || 6;
    A.dialog(`<h3>Tur programını otomatik doldur</h3><div class="row"><div><label>1. gün</label><input type="date" id="as_d"></div><div><label>1. tur saati</label><input type="time" id="as_t" value="09:30"></div></div>
      <div class="row" style="margin-top:8px"><div><label>Günde en çok tur</label><input type="number" id="as_n" value="3" min="1" max="4"></div><div><label>Tur başlangıçları arası (dk)</label><input type="number" id="as_i" value="150" min="30"></div><div><label>2. gün ve sonrası ilk tur saati</label><input type="time" id="as_t2" value="09:00"></div></div>
      <p class="muted">Örnek: 3 tur/gün, 150 dk → 09:30, 12:00, 14:30; ertesi gün 09:00. ${Rn} tur doldurulacak.</p>
      <div class="row tight"><button class="b" id="ok">Doldur</button><button class="b sec" data-close>Vazgeç</button></div>`, d => {
      $('#ok', d).onclick = () => {
        const d0 = $('#as_d', d).value; if (!d0) return A.toast('1. günü seçin');
        const per = +$('#as_n', d).value || 3, iv = +$('#as_i', d).value || 150; const S = sched(c); S.rounds = [];
        const toMin = (s) => { const [h, m] = s.split(':'); return +h * 60 + +m; }, hm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
        for (let i = 0; i < Rn; i++) {
          const day = Math.floor(i / per), k = i % per; const dt = new Date(d0 + 'T12:00:00'); dt.setDate(dt.getDate() + day);
          S.rounds.push({ d: dt.toISOString().slice(0, 10), t: hm(toMin(day === 0 ? $('#as_t', d).value : $('#as_t2', d).value) + k * iv) });
        }
        d.close(); A.save(); A.render();
      };
    });
  });
  function tbSettings(c) {
    const sys = M.sysOf(c), key = sys === 'swiss' ? 'tbSwiss' : 'tbBerger', order = c.settings[key];
    const rest = Object.keys(E.TB_DEFS).filter(k => !order.includes(k));
    const li = (k, i, on) => `<li class="${on ? '' : 'off'}"><input type="checkbox" style="width:auto" data-act="tbOn" data-a="${k}" ${on ? 'checked' : ''} aria-label="${esc(E.TB_DEFS[k].name)}"><span><b>${on ? (i + 1) + '. ' : ''}</b>${esc(E.TB_DEFS[k].name)}</span>
      ${on ? `<button class="b sm sec" data-act="tbUp" data-a="${k}">↑</button><button class="b sm sec" data-act="tbDn" data-a="${k}">↓</button>` : ''}</li>`;
    return `<h2>Eşitlik bozma sırası <small class="muted">(${sys === 'swiss' ? 'İsviçre' : 'Berger'})</small></h2><div class="card">
      <div class="note info">Prosedür md.19: Eş puanlı sporcular, Teknik Kurulca ilan edilen yöntemler ve sıra esas alınarak sıralanır. Sıra “Eşitlik bozma yöntemleri” belgesindeki önerilere göre hazırlanmıştır — <b>yönergenizde farklı bir sıra varsa buradan değiştirin.</b></div>
      <ul class="tbl-order">${order.map((k, i) => li(k, i, true)).join('')}${rest.map(k => li(k, 0, false)).join('')}</ul><button class="b sec sm" data-act="tbReset">Varsayılana dön</button></div>`;
  }
  const tbKey = (c) => (M.sysOf(c) === 'swiss' ? 'tbSwiss' : 'tbBerger');
  ACT.tbOn = guard((el) => { const c = CAT(), a = c.settings[tbKey(c)], k = el.dataset.a; if (el.checked) { if (!a.includes(k)) a.push(k); } else { const i = a.indexOf(k); if (i >= 0) a.splice(i, 1); } A.save(); A.render(); });
  ACT.tbUp = guard((el) => { const c = CAT(), a = c.settings[tbKey(c)], i = a.indexOf(el.dataset.a); if (i > 0) { [a[i - 1], a[i]] = [a[i], a[i - 1]]; A.save(); A.render(); } });
  ACT.tbDn = guard((el) => { const c = CAT(), a = c.settings[tbKey(c)], i = a.indexOf(el.dataset.a); if (i >= 0 && i < a.length - 1) { [a[i + 1], a[i]] = [a[i], a[i + 1]]; A.save(); A.render(); } });
  ACT.tbReset = guard(() => { const c = CAT(); c.settings[tbKey(c)] = E.DEFAULT_TB[M.sysOf(c)].slice(); A.save(); A.render(); });

  /* ============================================================= SPORCULAR */
  function vSpor(tn, c) {
    const n = c.players.length, locked = c.started && c.system === 'berger', canAdd = M.canAddPlayer(c);
    const can = M.canDelete(c);
    const others = tn.cats.filter(x => x !== c && !x.rounds.length);
    const players = c.players.slice().sort((a, b) => (a.no || 9999) - (b.no || 9999) || E.startRating(b) - E.startRating(a));
    const other = {}; tn.cats.forEach(x => { if (x !== c) x.players.forEach(p => { (other[p.kisiId] = other[p.kisiId] || []).push(x.name); }); });
    return `<h2>Sporcular <span class="pill">${n}</span></h2>
    <div class="card noprint"><div class="row tight">
      <button class="b" data-act="addP" ${canAdd ? '' : 'disabled'}>+ Sporcu ekle</button>
      <button class="b sec" data-act="fromT" ${canAdd ? '' : 'disabled'}>Başka kategoriden aktar</button>
      <button class="b sec" data-act="print">Yazdır</button></div>
      <div class="note ${can ? 'info' : ''}">${can ? 'Eşleştirme yapılmadığı için sporcular <b>silinebilir</b>. İlk eşleştirmeden sonra silme kapanır; sporcu “turnuvadan çekilir” (listede kalır, kalan turlarda eşleşmez).' : 'Eşleştirme yapıldı: sporcu silinemez. Ayrılan sporcu için <b>“Çek”</b> kullanın (turnuvadan silinmez, kalan turlarda eşleşmez, ödül almaz).'}</div>
      ${!c.started ? `<div class="note info">Başlangıç sıralaması: <b>kuvvet puanı</b> (UKD/ELO’nun yükseği) → <b>unvan</b> → <b>alfabetik</b>. ${n >= 10 ? '' : 'Berger sisteminde numaralar <b>kura ile</b> verilir (başlatılırken). '}${n && n < 10 ? '<button class="b sm sec" data-act="drawB">Kura çek</button>' : ''}</div>` : ''}
      ${c.started && c.system === 'swiss' && !canAdd ? '<div class="note">Prosedür md.17(3): 2. tur eşlendirmesi duyurulduktan sonra yeni sporcu alınmaz.</div>' : ''}
      ${locked ? '<div class="note">Berger turnuvası başladı; sporcu listesi kilitli (çekilme yapılabilir).</div>' : ''}</div>
    <div class="card"><div class="tblw fit"><table><tr><th class="n">No</th><th>Ad Soyad</th><th>Kulüp</th><th>Fed</th><th class="n">Doğum</th><th class="n">UKD</th><th class="n">ELO</th><th>FIDE No</th><th>Unvan</th><th>Durum</th><th class="noprint"></th></tr>
    ${players.map(p => { const wd = p.status === 'withdrawn'; return `<tr class="${wd ? 'out' : ''}"><td class="n">${p.no || ''}</td><td><b>${esc(p.ad)} ${esc(p.soyad)}</b>${p.female ? ' <span class="pill gray">K</span>' : ''}${other[p.kisiId] ? ` <span class="pill gray" title="${esc(other[p.kisiId].join(', '))}">+${other[p.kisiId].length} kategori</span>` : ''}</td>
      <td title="${esc(p.club)}">${esc(String(p.club || '').length > 25 ? String(p.club).slice(0, 25) + '…' : p.club)}</td><td>${esc(p.fed)}</td><td class="n">${esc(p.birthYear || '')}</td><td class="n">${p.rating || ''}</td><td class="n">${p.elo || ''}</td><td>${esc(p.fideNo)}</td><td>${esc(p.title || '')}</td>
      <td>${wd ? `<span class="pill err">çekildi${p.wdFrom ? ' (' + p.wdFrom + '. turdan)' : ''}</span>` : (p.joinRound > 1 ? '<span class="pill warn">' + p.joinRound + '. turdan</span>' : '<span class="pill">aktif</span>')}</td>
      <td class="noprint act-cell"><button class="b sm sec" data-act="editP" data-a="${p.id}" ${locked ? 'disabled' : ''}>Düzenle</button>
        ${others.length && can ? `<button class="b sm sec" data-act="moveP" data-a="${p.id}">Kategori</button>` : ''}
        ${wd ? `<button class="b sm sec" data-act="reactP" data-a="${p.id}">Geri al</button>` : (c.started && !can ? `<button class="b sm red" data-act="wdP" data-a="${p.id}">Çek</button>` : '')}
        ${can ? `<button class="b sm red" data-act="delP" data-a="${p.id}">Sil</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="11" class="muted">Henüz sporcu eklenmedi. Excel/CSV içe aktarın, tablodan yapıştırın veya tek tek ekleyin.</td></tr>'}
    </table></div></div>`;
  }
  /* Şablonun TÜM bilgi alanları tek formda (Sporcu ekle/düzenle + sihirbaz elle ekleme). x: id öneki. */
  const TITLES = ['GM', 'IM', 'WGM', 'FM', 'WIM', 'CM', 'WFM', 'WCM'];
  const pForm = (p, x) => { x = x || 'f_'; return `<div class="row"><div><label>Ad</label><input id="${x}ad" value="${esc(p.ad || '')}" maxlength="60"></div><div><label>Soyad</label><input id="${x}soyad" value="${esc(p.soyad || '')}" maxlength="60"></div></div>
    <div class="row" style="margin-top:8px"><div><label>Unvan</label><select id="${x}title"><option value=""></option>${TITLES.map(t => `<option ${p.title === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div><label>Cinsiyet</label><select id="${x}f"><option value="">Belirtilmedi</option><option value="0" ${p.female === false ? 'selected' : ''}>Erkek</option><option value="1" ${p.female ? 'selected' : ''}>Kız / Kadın</option></select></div>
    <div><label>Doğum tarihi</label><input id="${x}bd" type="date" value="${esc(p.birthDate || '')}"></div></div>
    <div class="row" style="margin-top:8px"><div><label>UKD (ulusal puan)</label><input id="${x}rating" type="number" min="0" max="4000" value="${p.rating || ''}"></div><div><label>ELO</label><input id="${x}elo" type="number" min="0" max="4000" value="${p.elo || ''}"></div>
    <div><label>FIDE No</label><input id="${x}fide" value="${esc(p.fideNo || '')}" maxlength="12" inputmode="numeric"></div><div><label>Federasyon</label><input id="${x}fed" value="${esc(p.fed || '')}" maxlength="4"></div></div>
    <div class="row" style="margin-top:8px"><div><label>Kulüp</label><input id="${x}club" value="${esc(p.club || '')}" maxlength="80"></div><div><label>Kulüp No</label><input id="${x}kno" value="${esc(p.kulupNo || '')}" maxlength="12"></div></div>
    <details style="margin-top:8px"><summary>Diğer şablon alanları (Tip, Kaynak, atitle)</summary><div class="row" style="margin-top:8px"><div><label>Tip</label><input id="${x}tip" value="${esc(p.tip || '')}" maxlength="20"></div><div><label>Kaynak</label><input id="${x}kay" value="${esc(p.kaynak || '')}" maxlength="40"></div><div><label>atitle</label><input id="${x}at" value="${esc(p.atitle || '')}" maxlength="12"></div></div></details>
    <div class="row" style="margin-top:8px">${A.piiInput(x + 'tc', p.tc, 'ID no (TC kimlik)')}${A.piiInput(x + 'tel', p.tel, 'Telefon')}</div>`; };
  function readForm(d, p, x) {
    x = x || 'f_';
    const v = (id) => $('#' + x + id, d).value.trim();
    const rt = (n) => { n = Math.round(+n || 0); return n >= 100 && n <= 4000 ? n : 0; };
    p.ad = I.up(v('ad')); p.soyad = I.up(v('soyad')); p.rating = rt(v('rating')); p.elo = rt(v('elo')); p.title = v('title');
    p.club = v('club').slice(0, 80); p.kulupNo = v('kno').slice(0, 12); p.tip = v('tip').slice(0, 20); p.kaynak = v('kay').slice(0, 40); p.atitle = I.up(v('at')).slice(0, 12);
    const dt = I.parseDate(v('bd')); p.birthDate = dt.birthDate; p.birthYear = dt.birthYear || (p.birthYear && !v('bd') ? p.birthYear : '');
    if (!v('bd') && !dt.birthYear) { p.birthDate = ''; p.birthYear = ''; }
    p.female = v('f') === '' ? null : v('f') === '1'; p.fideNo = I.digits(v('fide')).slice(0, 12); p.fed = v('fed').toUpperCase().slice(0, 4);
    p.tc = I.digits(v('tc')).slice(0, 11); p.tel = I.normTel(v('tel')).slice(0, 12);
    return p;
  }
  A.pForm = pForm; A.readForm = readForm;
  ACT.addP = guard(() => A.dialog(`<h3>Sporcu ekle</h3>${pForm({})}<div class="row tight" style="margin-top:14px"><button class="b" id="ok">Ekle</button><button class="b sec" data-close>Vazgeç</button></div>`,
    d => { A.bindPII(d); $('#ok', d).onclick = () => { const p = readForm(d, M.newPlayer({})); if (!p.soyad && !p.ad) return A.toast('Ad soyad girin'); d.close(); const l = M.addPlayers(CAT(), [p]); A.save(); A.render(); if (l) A.toast('2. turdan itibaren turnuvaya alındı'); }; }));
  ACT.editP = guard((el) => { const c = CAT(), p = pById(c, el.dataset.a); A.dialog(`<h3>Sporcuyu düzenle</h3>${pForm(p)}${c.started && c.rounds.length > 3 ? '<div class="note">4. turdan sonra başlangıç numarası değiştirilemez; puan değişikliği yalnızca görüntüyü etkiler.</div>' : ''}<div class="row tight" style="margin-top:14px"><button class="b" id="ok">Kaydet</button><button class="b sec" data-close>Vazgeç</button></div>`,
    d => { A.bindPII(d); $('#ok', d).onclick = () => { readForm(d, p); if (!p.ad && !p.soyad) return A.toast('Ad soyad boş olamaz'); refreshNumbers(c); A.save(); d.close(); A.render(); }; }); });
  function refreshNumbers(c) { if (c.started) { if (c.system === 'swiss' && c.rounds.length <= 3) M.renumber(c); } else if (!(c.bergerDrawn && c.players.length < 10)) M.renumber(c); }
  ACT.delP = guard(async (el) => {
    const c = CAT(), p = pById(c, el.dataset.a);
    if (!(await A.ask(`${nm(p)} silinsin mi? (Eşleştirme yapılmadığı için silinebilir; geri alınamaz.)`, { ok: 'Sil', danger: true }))) return;
    try { await A.snap('sporcu-silme'); M.deletePlayer(c, p.id); } catch (e) { return A.toast(e.message); } A.save(); A.render(); A.toast('Sporcu silindi');
  });
  function wdDialog(c, p, o) {
    o = o || {};
    const berger = c.system === 'berger', last = c.rounds[c.rounds.length - 1];
    const cr = M.completedRounds(c);
    const pr = berger ? (c.rounds[cr] && c.rounds[cr].pairings.find(x => (x.w === p.id || x.b === p.id) && !x.result)) : (last && last.pairings.find(x => (x.w === p.id || x.b === p.id) && !x.result));
    const canNow = !!pr, rn = berger ? cr + 1 : c.rounds.length;
    const onceTxt = `Sadece bu tur (${rn}. tur): bu turdaki eşleşme sporcu aleyhine hükmen sayılır; sonraki turlarda oynamaya devam eder`;
    const nowTxt = `Bu tur ve sonraki turlar (${rn}. turdan itibaren): bu turdaki eşleşme hükmen, sonraki turlarda eşleşmez (turnuvadan çekilir)`;
    const tn = TN(); const elsewhere = tn.cats.filter(x => x !== c && x.started && x.players.some(q => q.kisiId === p.kisiId && q.status === 'active'));
    A.dialog(`<h3>${esc(nm(p))} – turnuvadan çek</h3>
      <label class="chk ${canNow ? '' : 'dis'}"><input type="radio" name="wd" value="once" ${canNow ? 'checked' : 'disabled'}> ${esc(onceTxt)}</label>
      <label class="chk ${canNow ? '' : 'dis'}"><input type="radio" name="wd" value="now" ${canNow ? '' : 'disabled'}> ${esc(nowTxt)}</label>
      ${canNow ? '' : '<div class="note">Bu turda sonuçsuz eşleşme yok; çekilme için sonuç girilmemiş bir eşleşme gerekir.</div>'}
      <label style="margin-top:8px">Neden (isteğe bağlı)</label><input id="wd_note" maxlength="150" placeholder="Örn. hastalık, ayrıldı">
      ${elsewhere.length ? `<label class="chk" style="margin-top:8px"><input type="checkbox" id="wd_other"> Başka kategorilerden de çek (${esc(elsewhere.map(x => x.name).join(', '))})</label>` : ''}
      <div class="note info" style="margin-top:8px">“Bu tur ve sonraki turlar”da sporcu listede ve sıralamada kalır, kalan turlarda eşleşmez, ödül sırası almaz (md.19/3). “Geri al” ile yeniden alınabilir.</div>
      <div class="row tight"><button class="b red" id="ok">Çek</button><button class="b sec" data-close>Vazgeç</button></div>`, d => {
      $('#ok', d).onclick = async () => {
        const mode = $('input[name=wd]:checked', d).value, note = $('#wd_note', d).value;
        try {
          await A.snap('çekilme'); const r = M.withdrawPlayer(c, p.id, { mode, note });
          if ($('#wd_other', d) && $('#wd_other', d).checked) elsewhere.forEach(x => { const q = x.players.find(z => z.kisiId === p.kisiId); try { M.withdrawPlayer(x, q.id, { mode, note }); } catch (e) { /* o kategoride çekilemiyorsa atla */ } });
          A.save(); d.close(); A.toast(r.once ? `Yalnız ${r.wdFrom}. tur için hükmen işlendi` : `Çekildi (${r.wdFrom}. turdan itibaren${r.forfeited ? ', ' + r.forfeited + ' oyun hükmen' : ''})`); A.render();
        } catch (e) { A.toast(e.message, 5000); }
      };
    });
  }
  ACT.wdP = guard((el) => { const c = CAT(); wdDialog(c, pById(c, el.dataset.a)); });
  ACT.wdP2 = guard((el) => { const c = CAT(); wdDialog(c, pById(c, el.dataset.a)); });
  ACT.reactP = guard(async (el) => {
    const c = CAT(), p = pById(c, el.dataset.a);
    if (!(await A.ask(`${nm(p)} yeniden turnuvaya alınsın mı?${c.system === 'berger' ? ' (Otomatik hükmen sonuçlar silinir; elle girilenler korunur.)' : ' (Sonraki eşleştirmede tekrar yer alır; kaçırdığı turlar 0 puan kalır.)'}`, { ok: 'Geri al' }))) return;
    await A.snap('çekilme-geri-al'); M.reactivatePlayer(c, p.id); A.save(); A.render();
  });
  ACT.moveP = guard((el) => {
    const { tn, cat } = CT(), p = pById(cat, el.dataset.a), others = tn.cats.filter(x => x !== cat && !x.rounds.length);
    A.dialog(`<h3>${esc(nm(p))} – kategoriyi değiştir</h3><label>Hedef kategori</label><select id="mv_to">${others.map(x => `<option value="${x.id}">${esc(x.name)} (${x.players.length})</option>`).join('')}</select>
      <div class="note info">Yalnız iki kategoride de eşleştirme yapılmamışsa taşınabilir.</div><div class="row tight"><button class="b" id="ok">Taşı</button><button class="b sec" data-close>Vazgeç</button></div>`, d => {
      $('#ok', d).onclick = () => { try { M.movePlayer(tn, cat.id, p.id, $('#mv_to', d).value); A.save(); d.close(); A.render(); A.toast('Sporcu taşındı'); } catch (e) { A.toast(e.message); } };
    });
  });
  ACT.drawB = guard(() => { const c = CAT(); M.drawBerger(c); A.save(); A.render(); A.toast('Kura çekildi'); });
  ACT.demoP = guard(() => {
    A.dialog(`<h3>Deneme verisi</h3><label>Kaç deneme sporcusu eklensin?</label><input type="number" id="dn" value="24" min="1" max="300"><div class="row tight" style="margin-top:10px"><button class="b" id="ok">Ekle</button><button class="b sec" data-close>Vazgeç</button></div>`, d => {
      $('#ok', d).onclick = () => {
        const n = Math.max(1, Math.min(300, +$('#dn', d).value || 0)); const clubs = ['RİZE', 'TRABZON', 'ARTVİN', 'ORDU', 'GİRESUN'], list = [];
        for (let i = 1; i <= n; i++) list.push({ ad: 'SPORCU' + i, soyad: 'DENEME' + String.fromCharCode(65 + (i * 7) % 26), rating: Math.random() < 0.2 ? 0 : 1000 + Math.floor(Math.random() * 700), club: clubs[i % 5], birthYear: 2008 + (i % 8), female: i % 4 === 0 });
        M.addPlayers(CAT(), list); A.save(); d.close(); A.render();
      };
    });
  });
  /* ---- içe aktarma (aynı importer; tüm satırlar bu kategoriye girer) */
  function importDialog(res, name) {
    const parsed = res.players;
    if (!parsed.length) return A.toast(res.errors[0] || 'Sporcu satırı bulunamadı. Başlıkları kontrol edin (isim, UKD, Kulüp, DogTar).', 6000);
    parsed.forEach(p => { p.id = M.uid(); p.kisiId = p.id; });
    const years = parsed.map(p => p.birthYear).filter(Boolean);
    const lo = years.length ? Math.min(...years) : '', hi = years.length ? Math.max(...years) : '';
    A.dialog(`<h3>İçe aktar: ${parsed.length} sporcu bulundu</h3><p class="muted">${esc(name || '')} · eşleme: <b>${res.info.mode === 'sablon' ? 'şablon biçimi' : 'tahmini'}</b> · ${res.errors.length} hata, ${res.warnings.length} uyarı. Tüm satırlar <b>${esc(CAT().name)}</b> kategorisine eklenir.</p>
      ${res.errors.length ? `<details class="iss err"><summary>${res.errors.length} hata (bu satırlar alınmadı)</summary><ul>${res.errors.slice(0, 30).map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}
      <p class="muted">İsterseniz doğum yılı aralığı verin (boş bırakırsanız hepsi alınır).</p>
      <div class="row"><div><label>Doğum yılı (en erken)</label><input id="y1" type="number" placeholder="${lo}"></div><div><label>Doğum yılı (en geç)</label><input id="y2" type="number" placeholder="${hi}"></div></div>
      <div id="cnt" class="note ok" style="margin-top:10px">${parsed.length} sporcu eklenecek</div>
      <div class="row tight"><button class="b" id="ok">İçe aktar</button><button class="b sec" data-close>Vazgeç</button></div>`, d => {
      const sel = () => { const a = +$('#y1', d).value || 0, b = +$('#y2', d).value || 9999; return parsed.filter(p => (!a && b === 9999) ? true : (p.birthYear && p.birthYear >= a && p.birthYear <= b)); };
      const upd = () => { $('#cnt', d).textContent = sel().length + ' sporcu eklenecek'; };
      $('#y1', d).oninput = upd; $('#y2', d).oninput = upd;
      $('#ok', d).onclick = async () => { const l = sel(); d.close(); await A.snap('içe-aktarma'); const late = M.addPlayers(CAT(), l); A.save(); A.render(); A.toast(l.length + ' sporcu eklendi' + (late ? ' (' + late + ' sporcu 2. turdan itibaren)' : '')); };
    });
  }
  /** Önce şablon başlıkları; uyuşmazsa net uyarı + yalnız onayla tahmini eşleme. */
  async function parseAsk(rows) {
    let res = I.parseRegistration(rows, { maxYear: new Date().getFullYear() });
    if (res.notTemplate) {
      if (!(await A.ask(res.warnings[0] + '.\n\nBu dosya şablon biçiminde değil. Sütunları adlarına göre tahmin ederek yüklemek ister misiniz? (Önizlemeyi kontrol edin; şablonu “Şablonu indir” ile alabilirsiniz.)', { title: 'Şablon biçimi bulunamadı', ok: 'Tahmini eşleme ile yükle' }))) return null;
      res = I.parseRegistration(rows, { maxYear: new Date().getFullYear(), loose: true });
    }
    return res;
  }
  ACT.impP = guard(() => A.pickFile('.xlsx,.xls,.csv,.txt', async (f) => {
    try { const wb = I.readWorkbook(XLSX, await f.arrayBuffer(), f.size); const res = await parseAsk(I.sheetRows(XLSX, wb.Sheets[wb.SheetNames[0]])); if (res) importDialog(res, f.name); } catch (e) { A.toast(e.message, 6000); }
  }));
  ACT.pasteP = guard(() => A.dialog(`<h3>Tablodan yapıştır</h3><p class="muted">Excel’den başlık satırıyla birlikte kopyalayıp yapıştırın. Başlıklar standart şablondaki gibi olmalıdır (<code>isim, Unvan, ID no, ulusal rating, ulsulararasi rating, DogTar, Fed, Cinsiyet, Gr, Kulüp, FIDE-No</code>); “Şablonu indir” ile alabilirsiniz.</p><textarea id="pt" maxlength="500000"></textarea><div class="row tight" style="margin-top:10px"><button class="b" id="ok">Devam</button><button class="b sec" data-close>Vazgeç</button></div>`,
    d => { $('#ok', d).onclick = () => { const t = $('#pt', d).value.trim(); if (!t) return; try { const wb = XLSX.read(t, { type: 'string', cellDates: false }); d.close(); parseAsk(I.sheetRows(XLSX, wb.Sheets[wb.SheetNames[0]])).then(res => { if (res) importDialog(res, 'yapıştırılan tablo'); }); } catch (e) { A.toast('Tablo okunamadı'); } }; }));
  ACT.fromT = guard(() => {
    const { tn, cat } = CT(); const src = [];
    Object.values(A.db().tournaments).forEach(t => t.cats.forEach(c => { if (c !== cat && c.players.length) src.push({ t, c }); }));
    if (!src.length) return A.toast('Aktarılacak başka kategori yok');
    A.dialog(`<h3>Başka kategoriden / turnuvadan sporcu aktar</h3><label>Kaynak</label><select id="ft">${src.map(x => `<option value="${x.t.id}|${x.c.id}">${esc(x.t.info.name)} › ${esc(x.c.name)} (${x.c.players.length})</option>`).join('')}</select>
      <div class="row" style="margin-top:8px"><div><label>Doğum yılı en erken</label><input type="number" id="fy1"></div><div><label>en geç</label><input type="number" id="fy2"></div></div>
      <label class="chk" style="margin-top:8px"><input type="checkbox" id="fnew" checked> Zaten listede olanları (ad+soyad aynı) atla</label>
      <div class="tblw" style="max-height:300px;margin-top:8px"><table id="ftl"></table></div>
      <div class="row tight" style="margin-top:10px"><button class="b" id="ok">Seçilenleri aktar</button><button class="b sec" id="all">Tümünü seç / kaldır</button><button class="b sec" data-close>Vazgeç</button></div>`, d => {
      const have = new Set(cat.players.map(p => I.fold(p.ad + p.soyad)));
      const get = () => { const [t, c] = $('#ft', d).value.split('|'); return A.db().tournaments[t].cats.find(x => x.id === c); };
      const rows = () => { const a1 = +$('#fy1', d).value || 0, a2 = +$('#fy2', d).value || 9999; return get().players.filter(p => (!a1 && a2 === 9999) || (p.birthYear && p.birthYear >= a1 && p.birthYear <= a2)).filter(p => !($('#fnew', d).checked && have.has(I.fold(p.ad + p.soyad)))); };
      const draw = () => { $('#ftl', d).innerHTML = '<tr><th></th><th>Ad Soyad</th><th>Kulüp</th><th>Doğum</th><th>UKD</th></tr>' + rows().map(p => `<tr><td><input type="checkbox" class="fc" data-id="${esc(p.id)}" checked style="width:auto"></td><td>${esc(nm(p))}</td><td>${esc(p.club)}</td><td>${esc(p.birthYear || '')}</td><td>${p.rating || ''}</td></tr>`).join(''); };
      ['ft', 'fy1', 'fy2', 'fnew'].forEach(i => { $('#' + i, d).onchange = draw; }); draw();
      $('#all', d).onclick = () => { const cs = $$('.fc', d); const on = cs.some(c => !c.checked); cs.forEach(c => { c.checked = on; }); };
      $('#ok', d).onclick = () => {
        const ids = new Set($$('.fc', d).filter(c => c.checked).map(c => c.dataset.id));
        const list = get().players.filter(p => ids.has(p.id)).map(p => { const q = M.newPlayer(Object.assign({}, p, { id: undefined })); q.kisiId = p.kisiId; return q; });
        d.close(); const late = M.addPlayers(cat, list); A.save(); A.render(); A.toast(list.length + ' sporcu aktarıldı' + (late ? ' (2. turdan itibaren)' : ''));
      };
    });
  });
  ACT.tplBlank = () => { XLSX.writeFile(window.Template.buildBlank(XLSX), 'sporcu-kayit-sablonu.xlsx'); A.toast('Boş şablon indirildi (2 örnek satır içerir, silebilirsiniz).'); };
  ACT.expP = async () => {
    const { tn } = CT(); const list = window.Template.entriesOf(tn);
    if (!list.length) return A.toast('Listede sporcu yok.');
    if (!(await A.ask('İndirilen dosya sporcuların ID no (TC kimlik) bilgisini içerir. Güvenli bir yerde saklayın, başkalarıyla paylaşmayın.', { title: 'Sporcu listesi (şablon biçimi)', ok: 'İndir' }))) return;
    XLSX.writeFile(window.Template.buildList(XLSX, list), A.safeName(tn.info.name) + '-sporcu-listesi.xlsx');
  };

  /* ============================================================= TURLAR */
  const completed = (c) => M.completedRounds(c);
  function vRounds(tn, c) {
    if (!c.started) return `<h2>Turlar</h2><div class="card"><div class="note">Bu kategori henüz başlatılmadı. “Ayar” sekmesinde sistemi ve tur sayısını kontrol edip <b>Kategoriyi başlat</b>’a basın.</div><a class="b" href="#/t/${tn.id}/${c.id}/ayar">Ayar sekmesine git</a></div>`;
    const sys = c.system, Rn = M.totalRounds(c), cr = completed(c);
    let view = rv[c.id] || 1;
    let h = `<h2>${sysName(sys)} <small class="muted">• ${Rn} tur • ${esc(c.name)}</small></h2>`;
    const lastPaired = c.rounds.length;
    const maxShow = sys === 'berger' ? Rn : Math.min(Rn, lastPaired + (lastPaired < Rn && cr === lastPaired ? 1 : 0));
    view = Math.min(view, Math.max(1, maxShow)); rv[c.id] = view;
    const tabs = [];
    for (let r = 1; r <= Math.max(1, maxShow); r++) {
      const rd = c.rounds[r - 1]; const done = rd && rd.pairings.length && rd.pairings.every(p => p.result);
      tabs.push(`<button class="b sm ${r === view ? '' : 'sec'}" data-act="goR" data-a="${r}">${r}. Tur ${done ? '✓' : rd ? '' : '•'}</button>`);
    }
    h += `<div class="card noprint"><div class="row tight" style="gap:6px">${tabs.join('')}</div></div>`;
    const rd = c.rounds[view - 1];
    return h + (!rd ? pairPanel(tn, c, view) : roundPanel(tn, c, rd, view));
  }
  function warnings(c, round) {
    const out = []; const hist = E.buildHistory(M.stateOf(c), round - 1);
    for (const p of c.players) {
      if (p.status === 'withdrawn') continue;
      const h = hist.get(p.id) || [], mine = h.slice((p.joinRound || 1) - 1);
      const lastLoss = mine.length && (mine[mine.length - 1].kind === 'floss');
      const missed = mine.filter(x => x.kind === 'floss' || x.kind === 'none').length;
      if (lastLoss) out.push({ p, why: 'Son turda hükmen yenik (gelmedi?)' }); else if (missed >= 2) out.push({ p, why: missed + ' turda oynamadı' });
    }
    return out;
  }
  function pairPanel(tn, c, round) {
    if (c.system === 'berger') return '<div class="card">Bu tur Berger tablosunda mevcut değil.</div>';
    const prev = c.rounds[round - 2];
    if (round > 1 && !(prev && prev.pairings.every(p => p.result))) return `<div class="card"><div class="note">${round - 1}. turun tüm sonuçları girilmeden ${round}. tur eşlendirilemez.</div></div>`;
    const Rn = M.totalRounds(c);
    if (round > Rn) return '<div class="card">Tüm turlar tamamlandı.</div>';
    const act = c.players.filter(p => p.status !== 'withdrawn' && (p.joinRound || 1) <= round);
    const warn = round > 1 ? warnings(c, round) : [];
    const hist = E.buildHistory(M.stateOf(c), round - 1);
    const rows = act.map(p => { const h = hist.get(p.id) || [], ci = E.colorInfo(h); return { p, pts: E.totalPoints(h), ci, h }; }).sort((a, b) => b.pts - a.pts || a.p.no - b.p.no);
    const skipN = c.skipNext || {};
    let h = `<div class="card noprint"><h3>${round}. tur eşlendirmesi ${roundWhen(c, round) ? `<span class="pill">🕘 ${esc(roundWhen(c, round))}</span>` : ''}</h3>`;
    if (round === 1) h += `<div class="note info">1. tur: sporcular ortadan ikiye bölünür (S1/S2), çapraz eşlenir. Renk kurası: <b>1 nolu sporcu ${c.settings.initialWhite ? 'beyaz' : 'siyah'}</b> ile başlar (Ayar sekmesinden değiştirilebilir). Tek sayıda sporcu varsa en alttaki sporcu tur atlar.</div>`;
    if (warn.length) h += `<div class="note">Prosedür md.17(5): mazeretsiz bir tura veya nedeni ne olursa olsun iki tura katılmayan sporcu eşlendirmeden çıkarılır.<br>${warn.map(w => `<b>${esc(nm(w.p))}</b> – ${esc(w.why)} <button class="b sm red" data-act="wdP2" data-a="${w.p.id}">Çek</button>`).join('<br>')}</div>`;
    h += `<div class="note info">Bu tur oynamayacağı önceden bildirilen sporcuları işaretleyin (eşlendirmeye alınmaz; puan: <b>0</b>, yarım bye seçilirse ½).</div>
      <div class="tblw"><table><tr><th class="n">Sıra</th><th class="n">No</th><th>Sporcu</th><th class="n">Puan</th><th>Renkler</th><th class="n">Rf</th><th>Tercih</th><th>Bu tur</th></tr>
      ${rows.map((r, i) => `<tr><td class="n">${i + 1}</td><td class="n">${r.p.no}</td><td>${esc(nm(r.p))}</td><td class="n">${fmt(r.pts)}</td>
        <td>${r.h.map(x => x.played ? (x.color === 'W' ? 'b' : 's') : (x.kind === 'bye' ? 'B' : x.kind === 'fwin' ? '+' : x.kind === 'floss' ? '-' : '·')).join(' ') || '–'}</td>
        <td class="n">${r.ci.seq.length ? (r.ci.cd > 0 ? '+' : '') + r.ci.cd : ''}</td><td>${r.ci.pref ? (r.ci.pref === 'W' ? 'Beyaz' : 'Siyah') + (r.ci.strength === 2 ? ' (mutlak)' : r.ci.strength === 1 ? ' (güçlü)' : '') : ''}</td>
        <td><select data-act="skipN" data-a="${r.p.id}" style="width:auto;padding:4px"><option value="">oynar</option><option value="zero" ${skipN[r.p.id] === 'zero' ? 'selected' : ''}>oynamaz (0)</option><option value="half" ${skipN[r.p.id] === 'half' ? 'selected' : ''}>oynamaz (½)</option></select></td></tr>`).join('')}</table></div>
      <p class="muted" style="margin:8px 0">Renkler: b = beyaz, s = siyah, B = bye, + / - = hükmen. Rf = renk farkı (beyaz − siyah).</p>
      <button class="b big" data-act="pair" data-a="${round}">${round}. turu eşleştir</button></div>`;
    return h;
  }
  ACT.skipN = guard((el) => { const c = CAT(); c.skipNext = c.skipNext || {}; if (el.value) c.skipNext[el.dataset.a] = el.value; else delete c.skipNext[el.dataset.a]; A.save(); });
  ACT.pair = guard((el) => {
    const c = CAT(), round = +el.dataset.a;
    el.disabled = true; el.textContent = 'Eşleştiriliyor…';
    setTimeout(() => {
      try { const res = M.pairRound(c, round); rv[c.id] = round; A.save(); A.snap('eşleştirme-' + c.name + '-' + round); A.render(); A.toast(round + '. tur eşleştirildi' + (res.notes.length ? ' – uyarı var' : '')); }
      catch (e) { A.save(); A.render(); A.toast('Eşleştirme yapılamadı: ' + e.message, 7000); }
    }, 30);
  });
  function roundPanel(tn, c, rd, round) {
    const hist = E.buildHistory(M.stateOf(c), round - 1);
    const pts = (p) => E.totalPoints(hist.get(p.id) || []);
    const done = rd.pairings.every(p => p.result), cnt = rd.pairings.filter(p => p.result).length, Rn = M.totalRounds(c);
    let h = `<div class="card"><div class="row tight noprint" style="margin-bottom:8px"><span class="pill ${done ? '' : 'warn'}">${cnt}/${rd.pairings.length} sonuç girildi</span>
      <button class="b sm sec" data-act="print">Eşlendirme / sonuç yazdır</button>
      ${c.system === 'swiss' && !rd.pairings.some(p => p.result) && round === c.rounds.length ? `<button class="b sm red" data-act="delRound" data-a="${round}">Bu turu sil / yeniden eşleştir</button>` : ''}
      ${c.system === 'swiss' && done && round === c.rounds.length && round < Rn ? `<button class="b sm" data-act="goR" data-a="${round + 1}">${round + 1}. tur eşlendirmesine geç →</button>` : ''}
      ${done && round === Rn ? '<button class="b sm" data-act="goStand">Sonuçlar →</button>' : ''}</div>
      <div class="printonly"><b>${esc(tn.info.name)} – ${esc(c.name)}</b> – ${round}. Tur Eşlendirmesi ${esc(roundWhen(c, round) || A.fmtDate(tn.info.date))}</div>
      ${roundWhen(c, round) ? `<div class="pill noprint" style="margin-bottom:8px">🕘 ${esc(roundWhen(c, round))}</div>` : ''}`;
    (rd.notes || []).forEach(n => { h += `<div class="note">${esc(n)}</div>`; });
    h += `<div class="bd hd" style="font-size:12px;color:var(--mut);border-bottom:2px solid var(--line)"><div class="bn">Masa</div><div>Beyaz</div><div style="text-align:center">Sonuç</div><div>Siyah</div><div class="noprint">Sonuç gir</div></div>`;
    rd.pairings.forEach((pr, i) => {
      const w = pById(c, pr.w), b = pById(c, pr.b);
      const bt = (val, label, cls) => `<button class="rb ${cls || ''} ${pr.result === val ? 'on' : ''}" data-act="res" data-a="${round}|${i}|${val}" aria-pressed="${pr.result === val}">${label}</button>`;
      const shown = { '1-0': '1 - 0', '1/2': '½ - ½', '0-1': '0 - 1', '+-': '+ / -', '-+': '- / +', '--': '- / -' }[pr.result] || '–';
      h += `<div class="bd"><div class="bn">${pr.board}</div>
        <div class="nm nw"><b><span class="wchip"></span>${esc(nm(w))}</b><small>${w.no} • ${fmt(pts(w))} p ${rtg(w) ? '• ' + rtg(w) : ''}${w.status === 'withdrawn' ? ' • çekildi' : ''}</small></div>
        <div class="rc ${pr.result ? '' : 'rcnone'}" aria-label="Sonuç">${shown}</div>
        <div class="nm nk"><b><span class="bchip"></span>${esc(nm(b))}</b><small>${b.no} • ${fmt(pts(b))} p ${rtg(b) ? '• ' + rtg(b) : ''}${b.status === 'withdrawn' ? ' • çekildi' : ''}</small></div>
        <div class="rs noprint">${bt('1-0', '1-0')}${bt('1/2', '½-½')}${bt('0-1', '0-1')}${bt('+-', '+/-', 'f')}${bt('-+', '-/+', 'f')}${bt('--', '-/-', 'f')}
          <button class="rb f noprint" title="Renkleri değiştir" data-act="swapC" data-a="${round}|${i}" aria-label="Renkleri değiştir">⇄</button></div></div>`;
    });
    rd.byes.forEach(by => { const p = pById(c, by.p); if (!p) return;       const shown = { '1-0': '1 - 0', '1/2': '½ - ½', '0-1': '0 - 1', '+-': '+ / -', '-+': '- / +', '--': '- / -' }[pr.result] || '–';
      h += `<div class="bd"><div class="bn">${pr.board}</div>
        <div class="nm nw"><b><span class="wchip"></span>${esc(nm(w))}</b><small>${w.no} • ${fmt(pts(w))} p ${rtg(w) ? '• ' + rtg(w) : ''}${w.status === 'withdrawn' ? ' • çekildi' : ''}</small></div>
        <div class="rc ${pr.result ? '' : 'rcnone'}" aria-label="Sonuç">${shown}</div>
        <div class="nm nk"><b><span class="bchip"></span>${esc(nm(b))}</b><small>${b.no} • ${fmt(pts(b))} p ${rtg(b) ? '• ' + rtg(b) : ''}${b.status === 'withdrawn' ? ' • çekildi' : ''}</small></div>
        <div class="rs noprint">${bt('1-0', '1-0')}${bt('1/2', '½-½')}${bt('0-1', '0-1')}${bt('+-', '+/-', 'f')}${bt('-+', '-/+', 'f')}${bt('--', '-/-', 'f')}
          <button class="rb f noprint" title="Renkleri değiştir" data-act="swapC" data-a="${round}|${i}" aria-label="Renkleri değiştir">⇄</button></div></div>`;
    });

    return h + `<p class="muted noprint" style="margin-top:10px">Hükmen: <b>+/-</b> beyaz, <b>-/+</b> siyah kazanır; <b>-/-</b> iki oyuncu da gelmedi (0-0). ⇄ ile renkler elle değiştirilebilir (sonuç girilmemişken).</p></div>`;
  }
  ACT.res = guard((el) => { const [r, i, val] = el.dataset.a.split('|'); M.setResult(CAT(), +r, +i, val); A.save(); A.render(); });
  ACT.swapC = guard((el) => { const [r, i] = el.dataset.a.split('|'); const pr = CAT().rounds[r - 1].pairings[+i]; if (pr.result) return A.toast('Önce sonucu silin'); [pr.w, pr.b] = [pr.b, pr.w]; A.save(); A.render(); });
  ACT.delRound = guard(async (el) => {
    const c = CAT(); if (!(await A.ask('Bu turun eşlendirmesi silinsin mi?', { ok: 'Sil', danger: true }))) return;
    const r = +el.dataset.a, rd = c.rounds[r - 1];
    (rd.skip || []).forEach(id => { c.skipNext = c.skipNext || {}; const by = rd.byes.find(b => b.p === id); c.skipNext[id] = by && by.type === 'half' ? 'half' : 'zero'; });
    c.rounds.splice(r - 1, 1); A.save(); A.render();
  });

  /* ============================================================= SIRALAMA */
  const standings = (c, upto) => E.computeStandings(M.stateOf(c), { upto, order: tbOrder(c) });
  function vStand(tn, c) {
    const cr = completed(c);
    if (!c.started || !cr) return '<h2>Sıralama</h2><div class="card"><div class="note">Henüz tamamlanmış tur yok. Bir turun tüm sonuçları girilince sıralama burada görünür.</div></div>';
    const upto = Math.min(sr[c.id] || cr, cr), rows = standings(c, upto), order = tbOrder(c), cols = order.filter(k => k !== 'direct' && k !== 'directfide');
    let prize = 0;
    const sel = Array.from({ length: cr }, (_, i) => `<option value="${i + 1}" ${upto === i + 1 ? 'selected' : ''}>${i + 1}. tur sonrası</option>`).join('');
    const final = upto === M.totalRounds(c);
    return `<h2>Sıralama ${final ? '<span class="pill">Final</span>' : ''} <small class="muted">${esc(c.name)}</small></h2>
    <div class="card noprint"><div class="row tight"><select data-act="standR" style="width:auto">${sel}</select><button class="b sec" data-act="expStand">Excel’e aktar</button><button class="b sec" data-act="print">Yazdır</button></div></div>
    <div class="card"><div class="printonly"><b>${esc(tn.info.name)} – ${esc(c.name)}</b> – ${upto}. Tur Sonrası Sıralama ${esc(A.fmtDate(tn.info.date))} ${esc(tn.info.place)}</div>
    <div class="tblw"><table><tr><th class="n">Sıra</th><th class="n">No</th><th>Ad Soyad</th><th>Kulüp</th><th class="n">UKD/ELO</th><th class="n">Puan</th>${cols.map(k => `<th class="n" title="${esc(E.TB_DEFS[k].name)}">${E.TB_DEFS[k].short}</th>`).join('')}<th class="n" title="Çekilen sporcuya ödül verilmez">Ödül</th></tr>
    ${rows.map(r => { const wd = r.p.status === 'withdrawn'; const pz = wd ? '' : ++prize; return `<tr class="${wd ? 'out' : ''}"><td class="n"><b>${r.rank}</b></td><td class="n">${r.p.no}</td><td><b>${esc(nm(r.p))}</b>${r.p.female ? ' <span class="pill gray">K</span>' : ''}${wd ? ` <span class="pill err">çekildi${r.p.wdFrom ? ' (' + r.p.wdFrom + '. turdan)' : ''}</span>` : ''}</td><td>${esc(r.p.club)}</td><td class="n">${rtg(r.p)}</td><td class="n"><b>${fmt(r.pts)}</b></td>
      ${cols.map(k => `<td class="n">${k === 'avgr' || k === 'avgrc1' ? fmt(r.tb[k], 1) : fmt(r.tb[k])}</td>`).join('')}<td class="n">${pz}</td></tr>`; }).join('')}</table></div>
    <p class="muted" style="margin-top:8px">Eşitlik bozma sırası: ${order.map((k, i) => `${i + 1}) ${E.TB_DEFS[k].name}`).join(' → ')}. Oynanmayan turlar için sanal rakip uygulaması kullanılır; ayarlanmış puanda oynanmayan her tur ½ sayılır.</p></div>`;
  }
  ACT.standR = (el) => { sr[CAT().id] = +el.value; A.render(); };
  ACT.expStand = () => {
    const { tn, cat: c } = CT(), cr = completed(c), upto = Math.min(sr[c.id] || cr, cr);
    const RS = { '1-0': '1-0', '0-1': '0-1', '1/2': '½-½', '+-': '+/-', '-+': '-/+', '--': '-/-' };
    const pairings = []; c.rounds.forEach((rd, i) => rd.pairings.forEach(p => pairings.push([i + 1, p.board, nm(pById(c, p.w)), p.result ? RS[p.result] : '', nm(pById(c, p.b))])));
    const wb = window.XlsxOut.buildResults(XLSX, { rows: standings(c, upto), order: tbOrder(c), defs: E.TB_DEFS, nm, cross: crossData(c, upto), pairings });
    XLSX.writeFile(wb, A.safeName(tn.info.name + ' ' + c.name) + '-sonuclar.xlsx');
  };

  /* ============================================================= ÇAPRAZ TABLO */
  function cellTxt(x, byId) {
    const op = x.opp != null ? byId.get(x.opp) : null; const r = (v) => (v === 1 ? '1' : v === 0.5 ? '½' : '0');
    if (x.kind === 'game') return `${op.no}${x.color === 'W' ? 'b' : 's'}${r(x.pts)}`;
    if (x.kind === 'fwin') return `${op.no}${x.forfeitColor === 'W' ? 'b' : 's'}+`;
    if (x.kind === 'floss') return `${op.no}${x.forfeitColor === 'W' ? 'b' : 's'}-`;
    if (x.kind === 'bye') return 'bye'; if (x.kind === 'half') return '½*'; return '–';
  }
  function crossData(c, upto) {
    const rows = standings(c, upto), byId = new Map(c.players.map(p => [p.id, p])), order = tbOrder(c).filter(k => k !== 'direct' && k !== 'directfide');
    if (c.system === 'berger') {
      const byNo = rows.slice().sort((a, b) => a.p.no - b.p.no);
      const out = [['Sıra', 'No', 'Ad Soyad', ...byNo.map(r => r.p.no), 'Puan', ...order.map(k => E.TB_DEFS[k].short)]];
      rows.forEach(r => { const line = [r.rank, r.p.no, nmw(r.p)]; byNo.forEach(cc => { if (cc.p.id === r.p.id) { line.push('■'); return; } line.push(r.hist.filter(x => x.opp === cc.p.id && x.kind !== 'none').map(x => (x.pending ? '' : fmt(x.pts) || '0')).join(' ')); }); line.push(r.pts, ...order.map(k => Math.round(r.tb[k] * 100) / 100)); out.push(line); });
      return out;
    }
    const out = [['Sıra', 'No', 'Ad Soyad', 'Rtg', ...Array.from({ length: upto }, (_, i) => (i + 1) + '. Tur'), 'Puan', ...order.map(k => E.TB_DEFS[k].short)]];
    rows.forEach(r => out.push([r.rank, r.p.no, nmw(r.p), rtg(r.p), ...r.hist.slice(0, upto).map(x => cellTxt(x, byId)), r.pts, ...order.map(k => Math.round(r.tb[k] * 100) / 100)]));
    return out;
  }
  function vCross(tn, c) {
    const cr = completed(c);
    if (!c.started || !cr) return '<h2>Çapraz Tablo</h2><div class="card"><div class="note">Henüz tamamlanmış tur yok.</div></div>';
    const data = crossData(c, cr);
    return `<h2>Çapraz Tablo <small class="muted">${cr}. tur sonrası • ${esc(c.name)}</small></h2><div class="card"><div class="noprint row tight" style="margin-bottom:8px"><button class="b sec" data-act="print">Yazdır</button></div>
      <div class="printonly"><b>${esc(tn.info.name)} – ${esc(c.name)}</b> – Çapraz tablo ${esc(A.fmtDate(tn.info.date))}</div>
      <div class="tblw"><table><tr>${data[0].map((x, i) => `<th class="${i > 2 ? 'c' : ''}">${esc(x)}</th>`).join('')}</tr>
      ${data.slice(1).map(r => `<tr>${r.map((x, i) => `<td class="${i > 2 ? 'c' : ''}">${i > 2 && typeof x === 'number' && i >= r.length - (tbOrder(c).length + 1) ? fmt(x) : esc(x)}</td>`).join('')}</tr>`).join('')}</table></div>
      <p class="muted" style="margin-top:8px">${c.system === 'swiss' ? 'Hücre: rakip numarası + renk (b = beyaz, s = siyah) + sonuç. + / - hükmen, bye = tur atlama.' : 'Satırdaki sporcunun sütundaki sporcuya karşı aldığı puan.'}</p></div>`;
  }

  /* ============================================================= KURALLAR */
  function vHelp() {
    return `<div class="card help"><h2>Uygulanan kurallar</h2>
    <h3>Sistem ve tur sayısı</h3><p>Her kategori kendi sistemi ve tur sayısıyla oynanır. <b>3-9 sporcu: Berger</b> (n-1 tur, tek sayıda n tur; çift devre ×2). <b>10-32 sporcu: İsviçre 5 tur</b>, <b>33-64: 6 tur</b>, <b>65-128: 7 tur</b>. 129 ve üzeri için öneri yoktur, tur sayısını hakem girer. Öneriyi hakem değiştirebilir (etiket “Elle”); “Öneriye dön” ile geri alınır. Sistem ve tur sayısı teknik toplantıda belirlenir ve kategori başlatıldıktan sonra değişmez (Prosedür md.17/4). Kayıt kontrolünden sonra 3’ten az sporcusu olan kategori oluşmamış sayılır (md.13/7).</p>
    <h3>Silme ve çekilme</h3><p>Eşleştirme yapılmadan sporcu <b>silinebilir</b>. İlk eşleştirmeden sonra silinemez; ayrılan sporcu <b>çekilir</b>: listede ve sıralamada kalır, kalan turlarda eşleşmez, ödül sırası almaz (md.19/3). Çekilirken iki seçenek vardır: <b>“Sadece bu tur”</b> (bu turdaki eşleşme hükmen sayılır, sporcu sonraki turlarda oynar) ve <b>“Bu tur ve sonraki turlar”</b> (bu turdaki eşleşme hükmen sayılır, sporcu çekilir). Berger’de kalan tüm sonuçsuz oyunlar hükmen yenik olur (FIDE’nin %50 kuralı uygulanmaz; hakem kararıdır).</p>
    <h3>Başlangıç sıralaması</h3><p>Kuvvet puanı (UKD ve ELO’dan yüksek olan) → unvan (GM, IM, WGM, FM, WIM, CM, WFM, WCM) → alfabetik (soyad). Berger’de numaralar kura ile verilir.</p>
    <h3>İsviçre eşlendirmesi (FIDE Dutch ilkeleri)</h3><ul>
    <li>Aynı iki sporcu birden fazla kez eşlenmez.</li><li>Oynamadan puan alan (bye, hükmen kazanç, yarım bye) sporcu tur atlayamaz.</li>
    <li>Renk farkı ±2’yi geçemez; aynı renk üst üste 3 kez verilmez (mutlak tercih). Aynı mutlak tercihe sahip iki sporcu eşlenmez (son turda üst puan grubu istisnası).</li>
    <li>Eşlendirme en üst puan grubundan başlar; gruplar ortadan bölünür (S1/S2). Eşleşme olmazsa önce S2’de yer değiştirme, sonra S1–S2 değiş-tokuşu denenir; olmazsa en alttaki sporcu bir alt gruba kayar.</li>
    <li>Tek sayıda sporcuda en düşük puan grubunun en alttaki uygun sporcusu tur atlar (bye).</li>
    <li>Masalar: üstteki sporcunun puanı → çiftin toplam puanı → üstteki sporcunun başlangıç numarası.</li>
    <li>Mazeretsiz 1 tura veya nedeni ne olursa olsun 2 tura katılmayan sporcu eşlendirmeden çıkarılır (md.17/5) – program uyarır, kararı hakem verir.</li>
    <li>Geç gelenler: 1. tur başlamadan listeye girer; 1. tur başladıktan sonra gelenler 2. turdan itibaren alınır (md.17/2-3).</li></ul>
    <h3>Berger</h3><p>Dokümandaki Berger tablolarıyla birebir uyumludur (3–10 sporcu kontrol edildi). Tek sayıda sporcuda “dinlenen” tur 0 puandır. İsterseniz çift devre seçilir (2. devrede renkler ters).</p>
    <h3>Eşitlik bozma</h3><p>Sıra “Ayar” sekmesinden kategori başına ayarlanır. Varsayılan sıralar “Eşitlik bozma yöntemleri” belgesindeki öneriye göredir: <b>Berger:</b> Doğrudan karşılaşma → Sonneborn-Berger → Galibiyet sayısı → Koya. <b>İsviçre (Swiss-Manager varsayılanı):</b> Eş puan grubundaki sonuçlar → Buchholz alttan −1 → Sonneborn-Berger → Rakiplerin Buchholz ortalaması → Galibiyet sayısı.</p>
    <p><b>Ayarlanmış puan:</b> oynanmayan her tur ½ sayılır. <b>Sanal rakip:</b> kendi oynamadığı turlarda rakip puanı yerine <code>Ov = Sp + (1 − Sr) + ½·(N − R)</code> kullanılır. Hepsi eşitse başlangıç numarası küçük olan önde gösterilir (kura/hakem kararı gerekir).</p>
    <h3>Yaş kategorileri</h3><p>“N yaş ve altı” = turnuva yılı − doğum yılı ≤ N. Varsayılan olarak sporcu bir kategoride yer alır (en küçük yaş kategorisine taşınır); sihirbazda “birden çok kategoride oynayabilsin” seçilirse kopyalanır.</p>
    <h3>Not</h3><p>Bu program Swiss-Manager’ın yerine geçmek üzere FIDE Dutch ilkeleriyle yazılmıştır; küçük masa farkları olabilir. Resmî UKD/ELO bildirimi için sonuçları Excel’e aktarıp kullanabilirsiniz.</p></div>`;
  }
})();
