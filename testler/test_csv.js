/* CSV Türkçe karakter testi: UTF-8 (BOM'lu/BOM'suz) ve Windows-1254 dosyalar doğru okunmalı. Tarayıcıdaki gibi (cptable'sız) XLSX yüklenir. */
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const ctx = { window: {}, console }; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../vendor/xlsx.min.js'), 'utf8') + ';this.XLSX=XLSX;', ctx);
const X = ctx.XLSX, I = require('../js/importer.js');
const csv = 'firstname;surname;Unvan;ID no;ulusal rating;uluslararasi rating;DogTar;Fed;Cinsiyet;Gr;Kulüp;FIDE-No\nÇağrı;ŞAHİN;;;1500;;12.03.2012;TUR;E;A KATEGORİSİ;RİZE ÖĞRENCİ;\nAyşe;GÜNEŞ;;;1400;;01.05.2013;TUR;K;A KATEGORİSİ;ARTVİN;\n';
const m = { 'Ş': 0xDE, 'ş': 0xFE, 'İ': 0xDD, 'ı': 0xFD, 'Ğ': 0xD0, 'ğ': 0xF0, 'Ç': 0xC7, 'ç': 0xE7, 'Ö': 0xD6, 'ö': 0xF6, 'Ü': 0xDC, 'ü': 0xFC };
const cp1254 = Buffer.from([...csv].map(c => m[c] || c.charCodeAt(0)));
const cases = { utf8: Buffer.from(csv), utf8bom: Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(csv)]), cp1254, comma: Buffer.from(csv.replace(/;/g, ',')) };
for (const [n, buf] of Object.entries(cases)) {
  const wb = I.readWorkbook(X, new Uint8Array(buf), buf.length);
  const r = I.parseRegistration(I.sheetRows(X, wb.Sheets[wb.SheetNames[0]]), { maxYear: 2026 });
  assert.strictEqual(r.players.length, 2, n + ': 2 sporcu');
  assert.strictEqual(r.players[0].club, 'RİZE ÖĞRENCİ', n + ': kulüp');
  assert.strictEqual(r.players[0].src.gr, 'A KATEGORİSİ', n + ': kategori');
  assert.ok(/Ç.*RI/.test(r.players[0].firstname + r.players[0].surname) || /ÇAĞRI/.test(r.players[0].firstname + r.players[0].surname), n + ': ad');
  assert.strictEqual(r.players[1].surname + r.players[1].firstname, 'GÜNEŞAYŞE', n + ': ad2');
}
console.log('test_csv OK');
