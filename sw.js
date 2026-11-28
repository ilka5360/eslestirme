const V = 'eslestirme-v66';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'engine.js', 'js/rules.js', 'js/model.js', 'js/template.js', 'js/importer.js', 'js/yonerge.js', 'vendor/pdf.min.js', 'vendor/pdf.worker.min.js', 'js/ratingmatch.js', 'js/xlsxout.js', 'js/cards.js', 'js/store.js', 'js/ui.js', 'js/native.js', 'js/theme.js', 'js/tview.js', 'js/tools.js', 'logo-tsf.jpg', 'logo-bakanlik.png',
  'vendor/xlsx.min.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => {
  // tek bir dosya eksik olsa bile kurulum bozulmasın (addAll yerine tek tek)
  e.waitUntil(caches.open(V).then(c => Promise.allSettled(FILES.map(f => c.add(new Request(f, { cache: 'reload' })).catch(err => { console.warn('SW önbellek atlandı:', f, err && err.message); throw err; })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;           // dış ağ isteği yok
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => {
    if (res && res.ok) { const cp = res.clone(); caches.open(V).then(c => c.put(e.request, cp)); }
    return res;
  }).catch(() => (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
