$ErrorActionPreference = "Stop"

$ProjectId = "stock-monitor-777"
$Root = Split-Path -Parent $PSScriptRoot
$ServiceAccountKey = Join-Path $Root ".secrets\firebase-deploy-key.json"

Set-Location $Root

if (-not (Test-Path ".env.local")) {
  throw ".env.local 파일이 없습니다. 로컬 실행/빌드용 환경변수를 먼저 준비하세요."
}

if (Test-Path $ServiceAccountKey) {
  $env:GOOGLE_APPLICATION_CREDENTIALS = $ServiceAccountKey
  Write-Host "Using service account key: $ServiceAccountKey"
} else {
  Write-Host "No service account key found. Firebase CLI login credentials will be used."
  Write-Host "Expected optional key path: $ServiceAccountKey"
}

$firebase = Get-Command firebase -ErrorAction SilentlyContinue
if (-not $firebase) {
  throw "Firebase CLI가 없습니다. 먼저 npm install -g firebase-tools 를 실행하세요."
}

npm run build
if ($LASTEXITCODE -ne 0) {
  throw "Next.js build failed."
}

firebase deploy --project $ProjectId --only hosting,firestore
if ($LASTEXITCODE -ne 0) {
  throw "Firebase deploy failed."
}
