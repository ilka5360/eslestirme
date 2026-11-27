/* Kurallar: tur sayısı önerisi, sistem önerisi, yaş kategorisi eşiği. Saf fonksiyonlar (UMD). */
(function (root) {
  'use strict';
  /** Berger tur sayısı: n çift ise n-1, tek ise n; çift devrede x2. */
  function bergerRounds(n, dbl) { const b = n % 2 === 0 ? n - 1 : n; return dbl ? b * 2 : b; }

  /** Kural tablosu (ekranda da gösterilir). Berger en çok 8 sporcu. */
  const RULE_TABLE = [
    { from: 3, to: 4, system: 'berger', rounds: 6, label: 'Berger – çift devre (çift tur)' },
    { from: 5, to: 6, system: 'berger', rounds: 5, label: 'Berger – tek devre' },
    { from: 7, to: 8, system: 'berger', rounds: 7, label: 'Berger – tek devre' },
    { from: 9, to: 32, system: 'swiss', rounds: 5, label: 'İsviçre' },
    { from: 33, to: 64, system: 'swiss', rounds: 6, label: 'İsviçre' },
    { from: 65, to: 128, system: 'swiss', rounds: 7, label: 'İsviçre' },
  ];
  const BERGER_MAX = 8;
  /** 3-4 sporcuda çift devre otomatik (dbl: null/undefined = otomatik; true/false = hakem seçimi). */
  const autoDouble = (n) => n >= 3 && n <= 4;
  /** Sporcu sayısına göre sistem ve tur önerisi.
   *  3-4: Berger çift devre 6 tur | 5-6: Berger 5 | 7-8: Berger 7 | 9-32: İsviçre 5 | 33-64: 6 | 65-128: 7 | >=129: öneri yok */
  function suggestRounds(n, dbl) {
    n = n | 0;
    if (n < 3) return { system: null, rounds: null, note: 'En az 3 sporcu gerekir.' };
    if (n <= BERGER_MAX) { const d = dbl == null ? autoDouble(n) : !!dbl; return { system: 'berger', rounds: bergerRounds(n, d), note: n <= 4 ? '3-4 sporcu: çift devre Berger (6 tur).' : n <= 6 ? '5-6 sporcu: tek devre Berger (5 tur).' : '7-8 sporcu: tek devre Berger (7 tur).' }; }
    if (n <= 32) return { system: 'swiss', rounds: 5, note: '9-32 sporcu: 5 tur önerilir.' };
    if (n <= 64) return { system: 'swiss', rounds: 6, note: '33-64 sporcu: 6 tur önerilir.' };
    if (n <= 128) return { system: 'swiss', rounds: 7, note: '65-128 sporcu: 7 tur önerilir.' };
    return { system: 'swiss', rounds: null, log2: Math.ceil(Math.log2(n)), note: '129 ve üzeri sporcuda öneri yoktur; tur sayısını hakem girer (bilgi: ceil(log2 ' + n + ') = ' + Math.ceil(Math.log2(n)) + ').' };
  }
  /** "N yaş ve altı": yaş = refYear - doğumYılı <= N  <=>  doğumYılı >= refYear - N */
  const ageMinBirthYear = (refYear, max) => refYear - max;
  const inAgeGroup = (birthYear, refYear, max) => !!birthYear && birthYear >= refYear - max;

  const API = { suggestRounds, bergerRounds, RULE_TABLE, BERGER_MAX, autoDouble, ageMinBirthYear, inAgeGroup };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.Rules = API;
})(typeof window !== 'undefined' ? window : globalThis);
