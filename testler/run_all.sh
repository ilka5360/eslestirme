#!/bin/sh
# Tüm node testlerini çalıştırır. Kullanım: sh testler/run_all.sh  (app/ klasöründen veya herhangi bir yerden)
cd "$(dirname "$0")/.." || exit 1
fail=0
if [ -f ../engine.sha256 ]; then sha256sum -c ../engine.sha256 >/dev/null 2>&1 && echo "engine.js sha256: OK (değişmemiş)" || { echo "engine.js sha256: DEĞİŞMİŞ!"; fail=1; }; fi
for f in testler/test_engine.js testler/test_berger.js testler/test_tb.js testler/test_fide_example.js testler/test_rules.js testler/test_yonerge.js testler/test_sm_unplayed.js testler/test_import.js testler/test_template.js testler/test_model.js testler/test_tools.js testler/test_swissmanager_a.js; do
  printf '%s ... ' "$f"
  if node "$f" > /tmp/_test_out.txt 2>&1; then echo "GEÇTİ"; else echo "KALDI"; tail -15 /tmp/_test_out.txt; fail=1; fi
done
[ $fail -eq 0 ] && echo "TÜM TESTLER GEÇTİ" || { echo "BAŞARISIZ TEST VAR"; exit 1; }
