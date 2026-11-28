const { assert, t, done } = require('./_h');
const Y = require('../js/yonerge.js');
console.log('T-YONERGE-MART: 2 Mart Rize\'nin Kurtuluşu yönergesi (paragraf biçimi; kategori sağ sütunda, program sol sütunda)');
const r = Y.parse(require('./fix_mart_items.json'));
t('turnuva bilgileri', () => { assert.equal(r.info.name, "2 Mart Rize'nin Kurtuluşu Satranç Turnuvası"); assert.equal(r.info.date, '2026-02-28'); assert.equal(r.info.dateEnd, '2026-03-01'); assert.equal(r.info.tempo, '35+30'); assert.equal(r.info.place, 'Rize Gençlik Merkezi Satranç Salonu'); assert.equal(r.info.director, 'Ersoy Ustaoğlu'); assert.equal(r.info.email, 'rize@tsf.org.tr'); });
t('sistem, tur sayısı, son başvuru, kontenjan', () => { assert.equal(r.system, 'swiss'); assert.equal(r.rounds, 6); assert.equal(r.extra.deadline, '2026-02-27 21:00'); assert.equal(r.extra.quota, 110); assert.equal(r.extra.forfeitMin, 15); });
t('2 kategori ve referans yılı 2026', () => { assert.deepEqual(r.cats.map(c => [c.name, c.ageMax, c.minYear, c.maxYear]), [['8 YAŞ VE ALTI', 8, 2018, 2019], ['10 YAŞ VE ALTI', 10, 2016, 2017]]); assert.equal(r.refYear, 2026); assert.ok(r.refOK); });
t('tur programı: 6 tur, kayıt, teknik toplantı', () => { assert.deepEqual(r.schedule.rounds.map(x => x.d + ' ' + x.t), ['2026-02-28 09:30', '2026-02-28 12:00', '2026-02-28 14:30', '2026-03-01 09:30', '2026-03-01 12:00', '2026-03-01 14:30']); assert.deepEqual(r.schedule.kayit, { d: '2026-02-28', t: '08:30', t2: '09:00' }); assert.deepEqual(r.schedule.teknik, { d: '2026-02-28', t: '09:00' }); assert.equal(r.schedule.odul.d, '2026-03-01'); assert.deepEqual(r.warnings, []); });
done('test_yonerge_mart');
