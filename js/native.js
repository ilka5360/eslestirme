/* Android (Capacitor) sarmalayıcısında çalışırken: dosya indirme ve yazdırma yerine paylaşma sayfası kullanılır.
   Tarayıcıda / iPhone'da hiçbir şey yapmaz. */
(function (root) {
  'use strict';
  const A = root.App, C = root.Capacitor;
  A.native = !!(C && C.isNativePlatform && C.isNativePlatform());
  if (!A.native) return;
  const P = C.Plugins || {};
  const b64 = (blob) => new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1]); fr.onerror = () => no(fr.error); fr.readAsDataURL(blob); });
  A.shareBlob = async (blob, name) => {
    if (!P.Filesystem || !P.Share) throw new Error('Dosya paylaşma eklentisi yok.');
    const safe = String(name || 'dosya').replace(/[^\w.\-çğıöşüÇĞİÖŞÜ ]/g, '_');
    const w = await P.Filesystem.writeFile({ path: safe, data: await b64(blob), directory: 'CACHE' });
    await P.Share.share({ title: safe, dialogTitle: safe, url: w.uri });
  };
  const fail = (e) => { if (e && /cancel|dismiss/i.test(String(e.message || e))) return; A.toast('Dosya paylaşılamadı: ' + ((e && e.message) || e), 5000); };
  A.download = (blob, name) => { A.shareBlob(blob, name).catch(fail); };
  if (root.XLSX && root.XLSX.writeFile) {
    root.XLSX.writeFile = (wb, name) => {
      const ext = /\.xls$/i.test(name) ? 'xls' : 'xlsx';
      const out = root.XLSX.write(wb, { bookType: ext, type: 'array' });
      A.download(new Blob([out], { type: ext === 'xls' ? 'application/vnd.ms-excel' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name);
    };
  }
})(window);
