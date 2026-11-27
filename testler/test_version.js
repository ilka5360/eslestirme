// sw.js önbellek sürümü ile app.js'deki A.VERSION.no aynı olmalı (ikisi birlikte artırılır)
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const a = +/eslestirme-v(\d+)/.exec(sw)[1], b = +/VERSION = \{ no: (\d+)/.exec(app)[1];
assert.equal(a, b, 'sw.js (v' + a + ') ile app.js VERSION (' + b + ') uyuşmuyor');
const vj = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8'));
assert.equal(vj.no, a, 'version.json (' + vj.no + ') sürümle uyuşmuyor');
console.log('test_version: sürüm v' + a + ' tutarlı');
