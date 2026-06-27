# StockMonitor 설정 가이드

## 1. Firebase 설정

`.env.local` 파일에 Firebase 콘솔에서 값을 복사해 넣으세요:

```
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

Firebase 콘솔 → 프로젝트 설정 → 내 앱 → SDK 설정 및 구성

### Firebase Authentication
- Google 로그인 제공업체 활성화

### Firestore
- 데이터베이스 생성 (프로덕션 모드)
- `firestore.rules` 파일 내용을 규칙에 붙여넣기
- `firestore.indexes.json` 인덱스 적용 (또는 앱 실행 후 자동 생성 링크 클릭)

## 2. Cloudflare Worker URL 설정

```
NEXT_PUBLIC_STOCK_WORKER_URL=https://don-boja-stock.YOUR_ACCOUNT.workers.dev
```

실제 Worker URL로 교체하세요.

## 3. 실행

```bash
npm run dev
```
