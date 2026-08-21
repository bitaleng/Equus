#!/usr/bin/env bash
set -e

# 사용법:
#   ./build-netlify.sh              → v1+v2+v3 정식
#   ./build-netlify.sh demo         → 통합 체험판 (netlify-demo.zip)

ROOT="$(cd "$(dirname "$0")" && pwd)"
STATIC_TOML="$ROOT/netlify-static.toml"
FN_SRC="$ROOT/netlify/functions"
TARGET="${1:-all}"

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
    cp client/public/icon-demo.png dist/public/icon-demo.png 2>/dev/null || true
    echo "IVANSAUNA_DEMO_SITE" > dist/public/demo-build.txt
    echo "데모 빌드: PWA 설치 비활성"
  fi
}

verify_zip() {
  local zip="$1"
  local mode="$2"
  local skin="$3"
  python3 "$ROOT/scripts/verify-netlify-zip.py" "$zip" "$skin"
  python3 "$ROOT/scripts/verify-demo-flag.py" "$zip" "$mode"
}

build_one() {
  local skin="$1"
  local zip_name license_key demo=0

  if [ "$skin" = "demo" ]; then
    demo=1
    zip_name="netlify-demo.zip"
    license_key="rest_hotel_license_demo"
  elif [ "$skin" = "v1" ]; then
    zip_name="netlify-v1.zip"
    license_key="rest_hotel_license"
  elif [ "$skin" = "v3" ]; then
    zip_name="netlify-v3.zip"
    license_key="rest_hotel_license_v3"
  else
    zip_name="netlify-v2.zip"
    license_key="rest_hotel_license_v2"
  fi

  echo ""
  echo "======================================"
  echo "  $skin 빌드 ($( [ "$demo" = "1" ] && echo DEMO || echo PROD ))"
  echo "======================================"

  unset VITE_APP_NAME VITE_APP_SHORT_NAME VITE_APP_DESCRIPTION || true
  export VITE_SKIN="$skin"
  export VITE_LICENSE_STORAGE_KEY="$license_key"
  if [ "$demo" = "1" ]; then
    export VITE_DEMO_BUILD=true
  else
    unset VITE_DEMO_BUILD || true
  fi

  rm -rf dist/public
  npx vite build
  cp client/public/sw.js dist/public/sw.js
  case "$skin" in
    v1) sw_skin=equus ;;
    v2) sw_skin=hizz ;;
    v3) sw_skin=home24 ;;
    demo) sw_skin=demo ;;
    *) sw_skin=app ;;
  esac
  sw_cache="${sw_skin}-v37"
  python3 -c "
import pathlib, re
p = pathlib.Path('dist/public/sw.js')
t = p.read_text(encoding='utf-8')
t = re.sub(r\"const CACHE_NAME = '[^']+'\", \"const CACHE_NAME = '$sw_cache'\", t, count=1)
p.write_text(t, encoding='utf-8')
print(f'SW CACHE_NAME = {\"$sw_cache\"}')
"
  for f in favicon.png favicon-light.png icon-192.png icon-192-light.png icon-512.png icon-512-light.png icon-1024.png icon-1024-light.png manifest.json; do
    if [ -f "client/skins/$skin/$f" ]; then
      cp "client/skins/$skin/$f" "dist/public/$f"
    fi
  done

  prepare_netlify_bundle "$demo"

  rm -f "$zip_name"
  python3 "$ROOT/scripts/pack-netlify-zip.py" dist/public "$zip_name"
  verify_zip "$zip_name" "$( [ "$demo" = "1" ] && echo demo || echo prod )" "$skin"
  echo "$zip_name 생성 완료"
}

if [ "$TARGET" = "demo" ]; then
  build_one demo
elif [ "$TARGET" = "all" ]; then
  build_one v1
  build_one v2
  build_one v3
else
  build_one "$TARGET"
fi

echo ""
echo "빌드 완료"
