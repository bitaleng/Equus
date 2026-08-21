# Netlify 수동 배포용 zip 빌드 (Windows) — 매장 구분 없는 단일 공통 빌드
#
# 사용법:
#   .\build-netlify.ps1          → 정식 통합 빌드 (netlify.zip)
#   .\build-netlify.ps1 -Demo    → 체험판 빌드 (netlify-demo.zip)

param(
    [switch]$Demo
)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot

if ($Demo) {
    $env:VITE_DEMO_BUILD = 'true'
    $ZipName = 'netlify-demo.zip'
} else {
    Remove-Item Env:VITE_DEMO_BUILD -ErrorAction SilentlyContinue
    $ZipName = 'netlify.zip'
}

$modeLabel = if ($Demo) { 'DEMO' } else { 'PROD' }
Write-Host "=== Vite build ($modeLabel) ==="
Set-Location $Root

$publishDir = Join-Path $Root 'dist/public'
if (Test-Path $publishDir) { Remove-Item $publishDir -Recurse -Force }

npx vite build
if (-not (Test-Path (Join-Path $publishDir 'index.html'))) {
    throw "빌드 실패: dist/public/index.html 없음"
}

Copy-Item (Join-Path $Root 'client\public\sw.js') (Join-Path $publishDir 'sw.js') -Force
Write-Host "sw.js 동기화 완료"

if ($Demo) {
    $manifestPath = Join-Path $publishDir 'manifest.json'
    if (Test-Path $manifestPath) {
        python (Join-Path $Root 'scripts\patch-demo-manifest.py') $manifestPath
    }
    $licenseGen = Join-Path $publishDir 'license-generator.html'
    if (Test-Path $licenseGen) { Remove-Item $licenseGen -Force }
    $storeAdmin = Join-Path $publishDir 'store-admin.html'
    if (Test-Path $storeAdmin) { Remove-Item $storeAdmin -Force }
    Set-Content -Path (Join-Path $publishDir 'demo-build.txt') -Value "IVANSAUNA_DEMO_SITE" -Encoding UTF8
    Write-Host "데모 빌드: PWA 설치 비활성, license-generator.html/store-admin.html 제외"
}

$precachePath = Join-Path $publishDir 'sw-precache.json'
if (-not (Test-Path $precachePath)) {
    $assetUrls = Get-ChildItem (Join-Path $publishDir 'assets') -File -ErrorAction SilentlyContinue |
        ForEach-Object { "/assets/$($_.Name)" }
    $wasmUrls = @()
    if (Test-Path (Join-Path $publishDir 'sql-wasm.wasm')) {
        $wasmUrls += '/sql-wasm.wasm'
    }
    $urls = ($assetUrls + $wasmUrls | Sort-Object -Unique)
    $urls | ConvertTo-Json -Compress | Set-Content $precachePath -Encoding UTF8
    Write-Host "sw-precache.json 생성 (fallback)"
}

$staticToml = Join-Path $Root 'netlify-static.toml'
if (-not (Test-Path $staticToml)) { throw "netlify-static.toml 없음" }
Copy-Item $staticToml (Join-Path $publishDir 'netlify.toml') -Force

$fnSrc = Join-Path $Root 'netlify\functions'
$fnDst = Join-Path $publishDir 'netlify\functions'
if (Test-Path $fnDst) { Remove-Item $fnDst -Recurse -Force }
if (Test-Path $fnSrc) {
    Copy-Item $fnSrc $fnDst -Recurse -Force
    node (Join-Path $Root 'scripts\bundle-netlify-functions.mjs') $fnDst
    if ($LASTEXITCODE -ne 0) { throw "Netlify Functions 번들 실패" }
    Write-Host "Netlify Functions 복사/번들 완료"
}

Write-Host "=== zip 생성: $ZipName ==="
$zipPath = Join-Path $Root $ZipName
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

python (Join-Path $Root 'scripts\pack-netlify-zip.py') $publishDir $zipPath

python (Join-Path $Root 'scripts\verify-netlify-zip.py') $zipPath
if ($LASTEXITCODE -ne 0) { throw "zip 검증 실패" }

$flagMode = if ($Demo) { 'demo' } else { 'prod' }
python (Join-Path $Root 'scripts\verify-demo-flag.py') $zipPath $flagMode
if ($LASTEXITCODE -ne 0) { throw "데모/정식 플래그 검증 실패" }

Write-Host "완료: $zipPath ($(('{0:N1}' -f ((Get-Item $zipPath).Length / 1MB))) MB)"
if ($Demo) {
    Write-Host "체험판 zip입니다. 정식 사이트와 다른 Netlify 사이트에 배포하세요."
    Write-Host "체험 비밀번호: 12345678 (기본 10일)"
    Write-Host "PWA(홈 화면 설치)는 지원하지 않습니다."
} else {
    Write-Host "정식 통합 zip입니다. 모든 매장이 같은 사이트를 씁니다 — 매장 구분은 라이선스 키 활성화 시 서버가 내려주는 프로필로 결정됩니다."
    Write-Host "새 매장 등록: /store-admin.html (관리자 키 필요, STORE_ADMIN_KEY 환경변수를 Netlify 사이트에 설정해두세요)."
}
Write-Host "Netlify에 $ZipName 을 드래그 앤 드롭하여 배포하세요."
