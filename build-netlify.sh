#!/usr/bin/env bash
set -e

# ─── zip 배포용 netlify.toml (빌드 명령 없음 - 이미 빌드된 파일을 배포) ───
NETLIFY_TOML_COMMON='
# SPA 라우팅 - license-generator.html은 정적 파일로 서빙
[[redirects]]
  from = "/license-generator.html"
  to = "/license-generator.html"
  status = 200

# SPA 라우팅 - 모든 경로를 index.html로
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

# HTML - 캐시 없음 (항상 최신 버전)
[[headers]]
  for = "/"
  [headers.values]
    Cache-Control = "public, max-age=0, must-revalidate"

[[headers]]
  for = "/*.html"
  [headers.values]
    Cache-Control = "public, max-age=0, must-revalidate"

# Service Worker - 캐시 방지 (업데이트 감지)
[[headers]]
  for = "/sw.js"
  [headers.values]
    Cache-Control = "public, max-age=0, must-revalidate"

[[headers]]
  for = "/workbox-*.js"
  [headers.values]
    Cache-Control = "public, max-age=0, must-revalidate"

# Web App Manifest - 올바른 MIME 타입
[[headers]]
  for = "/manifest.json"
  [headers.values]
    Content-Type = "application/manifest+json"

[[headers]]
  for = "/manifest.webmanifest"
  [headers.values]
    Content-Type = "application/manifest+json"

# SQLite WASM - 장기 캐시
[[headers]]
  for = "/*.wasm"
  [headers.values]
    Content-Type = "application/wasm"
    Cache-Control = "public, max-age=31536000, immutable"

# 정적 에셋 - 파일명 해시로 캐시 버스팅
[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

# 폰트 - 장기 캐시
[[headers]]
  for = "/*.woff2"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
'

echo ""
echo "======================================"
echo "  V1 에쿠스 빌드 시작"
echo "======================================"
VITE_SKIN=v1 \
VITE_APP_NAME="LOCKER MANAGER" \
VITE_APP_SHORT_NAME="LOCKER" \
VITE_APP_DESCRIPTION="라이선스 키를 입력하여 시스템을 활성화하세요." \
VITE_LICENSE_STORAGE_KEY="rest_hotel_license" \
npx vite build

echo "$NETLIFY_TOML_COMMON" > dist/public/netlify.toml

echo ""
echo "--- V1 아이콘 확인 ---"
md5sum dist/public/favicon.png dist/public/icon-192.png dist/public/icon-512.png dist/public/icon-1024.png
echo "--- V1 예상값 ---"
md5sum client/skins/v1/favicon.png

echo ""
echo "--- V1 zip 생성 ---"
rm -f netlify-v1.zip
cd dist/public && zip -r ../../netlify-v1.zip . -x "*.DS_Store" && cd ../..
echo "netlify-v1.zip 생성 완료: $(du -sh netlify-v1.zip | cut -f1)"

echo ""
echo "======================================"
echo "  V2 히즈 빌드 시작"
echo "======================================"
VITE_SKIN=v2 \
VITE_APP_NAME="He's 입실관리매니저" \
VITE_APP_SHORT_NAME="He's" \
VITE_APP_DESCRIPTION="라이선스 키를 입력하여 시스템을 활성화하세요." \
VITE_LICENSE_STORAGE_KEY="rest_hotel_license_v2" \
npx vite build

echo "$NETLIFY_TOML_COMMON" > dist/public/netlify.toml

echo ""
echo "--- V2 아이콘 확인 ---"
md5sum dist/public/favicon.png dist/public/icon-192.png dist/public/icon-512.png dist/public/icon-1024.png
echo "--- V2 예상값 ---"
md5sum client/skins/v2/favicon.png

echo ""
echo "--- V2 zip 생성 ---"
rm -f netlify-v2.zip
cd dist/public && zip -r ../../netlify-v2.zip . -x "*.DS_Store" && cd ../..
echo "netlify-v2.zip 생성 완료: $(du -sh netlify-v2.zip | cut -f1)"

echo ""
echo "======================================"
echo "  빌드 완료"
echo "======================================"
echo "netlify-v1.zip: $(du -sh netlify-v1.zip | cut -f1) (V1 에쿠스, EQUS- 라이선스)"
echo "netlify-v2.zip: $(du -sh netlify-v2.zip | cut -f1) (V2 히즈, HIZZ- 라이선스)"
echo ""
echo "netlify.toml 내 빌드 명령 여부 확인:"
echo "V1:" && (unzip -p netlify-v1.zip netlify.toml | grep -i "command" || echo "  command 없음 - 정상")
echo "V2:" && (unzip -p netlify-v2.zip netlify.toml | grep -i "command" || echo "  command 없음 - 정상")
