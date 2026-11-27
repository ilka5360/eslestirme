#!/usr/bin/env bash
# Eşle Android APK derlemesi (GitHub Actions'ta çalışır). Web uygulaması telefona gömülür; internet gerekmez.
set -euo pipefail
cd "$(dirname "$0")"; ROOT="$(cd .. && pwd)"
rm -rf www out android node_modules; mkdir -p www out
for f in index.html style.css app.js engine.js manifest.webmanifest sw.js icon.svg icon-192.png icon-512.png logo-tsf.jpg logo-bakanlik.png; do cp "$ROOT/$f" www/; done
cp -r "$ROOT/js" "$ROOT/vendor" www/
npm install --no-audit --no-fund
npx cap add android
VN="$(grep -o 'no: [0-9]*' "$ROOT/app.js" | head -1 | grep -o '[0-9]*')"
VC="${RUN_NUMBER:-1}"
sed -i "s/versionCode 1/versionCode ${VC}/; s/versionName \"1.0\"/versionName \"v${VN}\"/" android/app/build.gradle
cp -r res/* android/app/src/main/res/
mkdir -p "$HOME/.android"; cp debug.keystore "$HOME/.android/debug.keystore"   # sabit imza: yeni sürüm eskisinin üzerine kurulur
npx cap sync android
( cd android && chmod +x gradlew && ./gradlew assembleDebug --no-daemon --console=plain )
cp android/app/build/outputs/apk/debug/app-debug.apk out/Esle.apk
ls -la out
