# Netlify 수동 배포용 zip 빌드 (Windows)

# 사용법:

#   .\build-netlify.ps1                  → V2 정식 (히즈)

#   .\build-netlify.ps1 -Skin v1         → V1 정식 (에쿠스)

#   .\build-netlify.ps1 -Skin v3         → V3 정식 (홈)

#   .\build-netlify.ps1 -Skin demo       → 통합 체험판 (단일 demo zip)



param(

    [ValidateSet('v1', 'v2', 'v3', 'demo')]

    [string]$Skin = 'v2'

)



$ErrorActionPreference = 'Stop'

$Root = $PSScriptRoot

$IsDemo = $Skin -eq 'demo'



if ($IsDemo) {

    $env:VITE_SKIN = 'demo'

    $env:VITE_DEMO_BUILD = 'true'

    $env:VITE_LICENSE_STORAGE_KEY = 'rest_hotel_license_demo'

    $ZipName = 'netlify-demo.zip'

} elseif ($Skin -eq 'v3') {

    $env:VITE_SKIN = 'v3'

    Remove-Item Env:VITE_DEMO_BUILD -ErrorAction SilentlyContinue

    $env:VITE_LICENSE_STORAGE_KEY = 'rest_hotel_license_v3'

    $ZipName = 'netlify-v3.zip'

} elseif ($Skin -eq 'v2') {

    $env:VITE_SKIN = 'v2'

    Remove-Item Env:VITE_DEMO_BUILD -ErrorAction SilentlyContinue

    $env:VITE_LICENSE_STORAGE_KEY = 'rest_hotel_license_v2'

    $ZipName = 'netlify-v2.zip'

} else {

    $env:VITE_SKIN = 'v1'

    Remove-Item Env:VITE_DEMO_BUILD -ErrorAction SilentlyContinue

    $env:VITE_LICENSE_STORAGE_KEY = 'rest_hotel_license'

    $ZipName = 'netlify-v1.zip'

}



Remove-Item Env:VITE_APP_NAME -ErrorAction SilentlyContinue

Remove-Item Env:VITE_APP_SHORT_NAME -ErrorAction SilentlyContinue

Remove-Item Env:VITE_APP_DESCRIPTION -ErrorAction SilentlyContinue



$modeLabel = if ($IsDemo) { 'DEMO' } else { 'PROD' }

Write-Host "=== Vite build ($Skin / $modeLabel) ==="

Set-Location $Root



$publishDir = Join-Path $Root 'dist/public'

if (Test-Path $publishDir) { Remove-Item $publishDir -Recurse -Force }



npx vite build

if (-not (Test-Path (Join-Path $publishDir 'index.html'))) {

    throw "빌드 실패: dist/public/index.html 없음"

}



Copy-Item (Join-Path $Root 'client\public\sw.js') (Join-Path $publishDir 'sw.js') -Force

# 스킨별 SW 캐시 이름 — 덮어쓰기 배포 잔여물·교차 오염 방지 (activate 시 구 캐시 전체 삭제)
$swCacheSkin = switch ($Skin) {
    'v1'   { 'equus' }
    'v2'   { 'hizz' }
    'v3'   { 'home24' }
    'demo' { 'demo' }
    default { 'app' }
}
$swCacheName = "$swCacheSkin-v37"
$swPath = Join-Path $publishDir 'sw.js'
$swText = [System.IO.File]::ReadAllText($swPath)
$swText = [regex]::Replace($swText, "const CACHE_NAME = '[^']+'", "const CACHE_NAME = '$swCacheName'")
[System.IO.File]::WriteAllText($swPath, $swText)
Write-Host "SW CACHE_NAME = $swCacheName"

$skinDir = Join-Path $Root "client\skins\$Skin"

foreach ($file in @('favicon.png', 'favicon-light.png', 'icon-192.png', 'icon-192-light.png', 'icon-512.png', 'icon-512-light.png', 'icon-1024.png', 'icon-1024-light.png', 'manifest.json')) {

    $src = Join-Path $skinDir $file

    if (Test-Path $src) {

        Copy-Item $src (Join-Path $publishDir $file) -Force

    }

}



if ($IsDemo) {

    Copy-Item (Join-Path $Root 'client\public\icon-demo.png') (Join-Path $publishDir 'icon-demo.png') -Force

    $manifestPath = Join-Path $publishDir 'manifest.json'

    if (Test-Path $manifestPath) {

        python (Join-Path $Root 'scripts\patch-demo-manifest.py') $manifestPath

    }

    $licenseGen = Join-Path $publishDir 'license-generator.html'

    if (Test-Path $licenseGen) { Remove-Item $licenseGen -Force }

    Set-Content -Path (Join-Path $publishDir 'demo-build.txt') -Value "IVANSAUNA_DEMO_SITE" -Encoding UTF8

    Write-Host "데모 빌드: PWA 설치 비활성, license-generator.html 제외"

}



Write-Host "sw.js / 스킨 자산 동기화 완료 ($Skin / $modeLabel)"



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

    if ($LASTEXITCODE -ne 0) { throw "demo-trial Function 번들 실패" }

    Write-Host "Netlify Functions 복사/번들 완료"

}



Write-Host "=== zip 생성: $ZipName ==="

$zipPath = Join-Path $Root $ZipName

if (Test-Path $zipPath) { Remove-Item $zipPath -Force }



python (Join-Path $Root 'scripts\pack-netlify-zip.py') $publishDir $zipPath

python (Join-Path $Root 'scripts\verify-netlify-zip.py') $zipPath $Skin

if ($LASTEXITCODE -ne 0) { throw "zip 검증 실패" }



$flagMode = if ($IsDemo) { 'demo' } else { 'prod' }

python (Join-Path $Root 'scripts\verify-demo-flag.py') $zipPath $flagMode

if ($LASTEXITCODE -ne 0) { throw "데모/정식 플래그 검증 실패" }



Write-Host "완료: $zipPath ($(('{0:N1}' -f ((Get-Item $zipPath).Length / 1MB))) MB)"

if ($IsDemo) {

    Write-Host "통합 체험판 zip입니다. 정식 사이트와 다른 Netlify 사이트에 배포하세요."

    Write-Host "체험 비밀번호: 12345678 (기본 10일)"

    Write-Host "PWA(홈 화면 설치)는 지원하지 않습니다."

} else {

    Write-Host "정식 zip입니다. ?demo=true 로는 체험이 되지 않습니다."

}

Write-Host "Netlify에 $ZipName 을 드래그 앤 드롭하여 배포하세요."

