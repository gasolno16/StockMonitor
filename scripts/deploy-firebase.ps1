param(
  [switch]$Firestore
)

$ErrorActionPreference = "Stop"

$ProjectId = "stock-monitor-777"
$Root = Split-Path -Parent $PSScriptRoot
$ServiceAccountKey = Join-Path $Root ".secrets\firebase-deploy-key.json"
$FirebaseCliJs = Join-Path $env:APPDATA "npm\node_modules\firebase-tools\lib\bin\firebase.js"

Set-Location $Root

if (-not (Test-Path ".env.local")) {
  throw ".env.local 파일이 없습니다. 로컬 실행/빌드용 환경변수를 먼저 준비하세요."
}

if (Test-Path $ServiceAccountKey) {
  $resolvedKey = (Resolve-Path $ServiceAccountKey).Path
  $env:GOOGLE_APPLICATION_CREDENTIALS = $resolvedKey
  $env:GOOGLE_CLOUD_PROJECT = $ProjectId
  $env:GCLOUD_PROJECT = $ProjectId
  $env:CLOUDSDK_CORE_PROJECT = $ProjectId
  Write-Host "Using service account key: $resolvedKey"
} else {
  Write-Host "No service account key found. Firebase CLI login credentials will be used."
  Write-Host "Expected optional key path: $ServiceAccountKey"
}

$firebase = Get-Command firebase -ErrorAction SilentlyContinue
if (-not $firebase) {
  throw "Firebase CLI가 없습니다. 먼저 npm install -g firebase-tools 를 실행하세요."
}

if (-not (Test-Path $FirebaseCliJs)) {
  throw "Firebase CLI 실행 파일을 찾을 수 없습니다: $FirebaseCliJs"
}

npm run build
if ($LASTEXITCODE -ne 0) {
  throw "Next.js build failed."
}

$deployTarget = "hosting"
if ($Firestore) {
  $deployTarget = "hosting,firestore"
}

npx -y -p node@22 node $FirebaseCliJs deploy --project $ProjectId --only $deployTarget
if ($LASTEXITCODE -ne 0) {
  throw "Firebase deploy failed."
}
