#!/usr/bin/env bash
set -e

# 사용법:
#   ./build-netlify.sh          → 정식 통합 빌드 (netlify.zip)
#   ./build-netlify.sh demo     → 체험판 빌드 (netlify-demo.zip)

ROOT="$(cd "$(dirname "$0")" && pwd)"
STATIC_TOML="$ROOT/netlify-static.toml"
FN_SRC="$ROOT/netlify/functions"
TARGET="${1:-prod}"

prepare_netlify_bundle() {
  local demo="$1"
  if [ ! -f "$STATIC_TOML" ]; then
    echo "ERROR: netlify-static.toml 없음"
    exit 1
  fi
  cp "$STATIC_TOML" dist/public/netlify.toml
  rm -rf dist/public/netlify/functions
  if [ -d "$FN_SRC" ]; then
    mkdir -p dist/public/netlify
    cp -R "$FN_SRC" dist/public/netlify/functions
    node "$ROOT/scripts/bundle-netlify-functions.mjs" dist/public/netlify/functions
    echo "Netlify Functions 복사/번들 완료"
  fi

  if [ "$demo" = "1" ]; then
    python3 "$ROOT/scripts/patch-demo-manifest.py" dist/public/manifest.json
    rm -f dist/public/license-generator.html
    rm -f dist/public/store-admin.html
    cp client/public/icon-demo.png dist/public/icon-demo.png 2>/dev/null || true
    echo "IVANSAUNA_DEMO_SITE" > dist/public/demo-build.txt
    echo "데모 빌드: PWA 설치 비활성, license-generator.html/store-admin.html 제외"
  fi
}

verify_zip() {
  local zip="$1"
  local mode="$2"
  python3 "$ROOT/scripts/verify-netlify-zip.py" "$zip"
  python3 "$ROOT/scripts/verify-demo-flag.py" "$zip" "$mode"
}

build_one() {
  local mode="$1"
  local zip_name demo=0

  if [ "$mode" = "demo" ]; then
    demo=1
    zip_name="netlify-demo.zip"
  else
    zip_name="netlify.zip"
  fi

  echo ""
  echo "======================================"
  echo "  통합 빌드 ($( [ "$demo" = "1" ] && echo DEMO || echo PROD ))"
  echo "======================================"

  if [ "$demo" = "1" ]; then
    export VITE_DEMO_BUILD=true
  else
    unset VITE_DEMO_BUILD || true
  fi

  rm -rf dist/public
  npx vite build
  cp client/public/sw.js dist/public/sw.js

  prepare_netlify_bundle "$demo"

  rm -f "$zip_name"
  python3 "$ROOT/scripts/pack-netlify-zip.py" dist/public "$zip_name"
  verify_zip "$zip_name" "$( [ "$demo" = "1" ] && echo demo || echo prod )"
  echo "$zip_name 생성 완료"
}

if [ "$TARGET" = "demo" ]; then
  build_one demo
else
  build_one prod
fi

echo ""
echo "빌드 완료"
echo "정식 빌드는 모든 매장이 같은 사이트를 씁니다 — 매장 구분은 라이선스 키 활성화 시 서버가 내려주는 프로필로 결정됩니다."
echo "새 매장 등록: /store-admin.html (관리자 키 필요, STORE_ADMIN_KEY 환경변수를 Netlify 사이트에 설정해두세요)."
