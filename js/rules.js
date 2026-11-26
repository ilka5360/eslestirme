/* Kurallar: tur sayısı önerisi, sistem önerisi, yaş kategorisi eşiği. Saf fonksiyonlar (UMD). */
(function (root) {
  'use strict';
  /** Berger tur sayısı: n çift ise n-1, tek ise n; çift devrede x2. */
  function bergerRounds(n, dbl) { const b = n % 2 === 0 ? n - 1 : n; return dbl ? b * 2 : b; }

  /** Sporcu sayısına göre sistem ve tur önerisi.
   *  3-9: Berger | 10-32: İsviçre 5 | 33-64: 6 | 65-128: 7 | >=129: öneri yok (hakem doldurur) */
  function suggestRounds(n, dbl) {
    n = n | 0;
    if (n < 3) return { system: null, rounds: null, note: 'En az 3 sporcu gerekir.' };
    if (n <= 9) return { system: 'berger', rounds: bergerRounds(n, !!dbl), note: 'Berger (tek/çift devre).' };
    if (n <= 32) return { system: 'swiss', rounds: 5, note: '10-32 sporcu: 5 tur önerilir.' };
    if (n <= 64) return { system: 'swiss', rounds: 6, note: '33-64 sporcu: 6 tur önerilir.' };
    if (n <= 128) return { system: 'swiss', rounds: 7, note: '65-128 sporcu: 7 tur önerilir.' };
    return { system: 'swiss', rounds: null, log2: Math.ceil(Math.log2(n)), note: '129 ve üzeri sporcuda öneri yoktur; tur sayısını hakem girer (bilgi: ceil(log2 ' + n + ') = ' + Math.ceil(Math.log2(n)) + ').' };
  }
  /** "N yaş ve altı": yaş = refYear - doğumYılı <= N  <=>  doğumYılı >= refYear - N */
  const ageMinBirthYear = (refYear, max) => refYear - max;
  const inAgeGroup = (birthYear, refYear, max) => !!birthYear && birthYear >= refYear - max;

  const API = { suggestRounds, bergerRounds, ageMinBirthYear, inAgeGroup };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.Rules = API;
})(typeof window !== 'undefined' ? window : globalThis);
