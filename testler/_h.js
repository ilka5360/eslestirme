/* Küçük test yardımcısı: assert, t(ad, fn), done(ad) */
const assert = require('assert');
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('  HATA ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
function done(name) { console.log(`${name}: ${pass} geçti, ${fail} hata`); if (fail) process.exit(1); }
const lazy = (f) => { try { return require(f); } catch (e) { return undefined; } };
module.exports = { assert, t, done, R: lazy('../js/rules.js'), M: lazy('../js/model.js') };
