# Hue Stay — 정적 사이트 + Cloudflare Worker

GitHub + Cloudflare Pages + Cloudflare Workers + Google Sheets 조합으로
**완전 무료 + 영구 호스팅**되는 Hue Stay 웹사이트 패키지.

```
[ 방문자 ] → huestay.pages.dev (Cloudflare Pages, 정적)
                       │
                  폼 제출 (POST)
                       ↓
       huestay-api.<user>.workers.dev (Cloudflare Worker)
                       ↓
                Google Sheets (DB)
```

## 폴더 구조
```
huestay-site/
├── index.html          # 정적 메인 페이지 (Pages가 그대로 서빙)
├── images/             # 이미지 자산
├── worker/
│   ├── src/index.js    # Cloudflare Worker (폼 → Google Sheets)
│   ├── wrangler.toml   # Worker 배포 설정
│   └── package.json
└── README.md
```

---

## 🚀 배포 가이드 (사장님이 직접 진행)

### 1단계 — GitHub Repo 생성
1. github.com 로그인 → New repository → 이름: `huestay-site` (Public 권장)
2. 로컬에서:
   ```bash
   cd /home/ubuntu/huestay-site
   git init
   git add -A
   git commit -m "feat: initial huestay site"
   git branch -M main
   git remote add origin https://github.com/<YOUR_USERNAME>/huestay-site.git
   git push -u origin main
   ```

### 2단계 — Cloudflare Worker 배포 (폼 처리 API)
1. Cloudflare 로그인 → Workers & Pages → Create → Workers
2. 또는 CLI로:
   ```bash
   cd /home/ubuntu/huestay-site/worker
   npm install
   npx wrangler login          # 브라우저로 로그인
   npx wrangler secret put GOOGLE_SA_JSON   # credentials.json 내용 전체 붙여넣기
   npx wrangler secret put SHEET_ID         # Google Sheet ID 붙여넣기
   npx wrangler deploy
   ```
3. 배포 완료되면 Worker URL이 표시됩니다 → 예: `https://huestay-api.<your-cf-user>.workers.dev`

> Sheet ID: `1-jPmG6kCYueTSR-mbr0Gi97XACUx8QZu9cxTlzY1YaE` (이미 sheets_sync.py에서 사용 중)
> 시트가 service account `hue-stay-customer-db@gen-lang-client-0222193071.iam.gserviceaccount.com`에 **편집자**로 공유되어 있어야 함.

### 3단계 — index.html에 Worker URL 반영
`index.html` line 842 수정:
```js
const SUBMIT_URL = 'https://huestay-api.YOUR-CF-USER.workers.dev/submit';
```
→ 실제 Worker URL로 변경 후 GitHub에 push.

### 4단계 — Cloudflare Pages 연결 (정적 사이트 배포)
1. Cloudflare 대시보드 → Workers & Pages → Create → Pages → Connect to Git
2. GitHub 인증 → `huestay-site` 리포 선택
3. 빌드 설정:
   - **Framework preset**: None
   - **Build command**: 비워둠
   - **Build output directory**: `/` (루트)
4. Save and Deploy

→ 배포 완료되면 `https://huestay-XXX.pages.dev` 로 접속 가능.
→ 프로젝트명을 `huestay`로 하면 `https://huestay.pages.dev` 가 됩니다.

### 5단계 (선택) — CORS 보안 강화
`worker/wrangler.toml`의 `ALLOWED_ORIGIN` 을 실제 Pages URL로 변경 후 재배포:
```toml
ALLOWED_ORIGIN = "https://huestay.pages.dev"
```

---

## 🧪 로컬 테스트
```bash
cd /home/ubuntu/huestay-site
python3 -m http.server 8000        # → http://localhost:8000
```
폼 제출 시 Worker URL이 유효해야 정상 동작.

## 💸 비용
- GitHub: 무료 (public repo)
- Cloudflare Pages: 무료 (월 500 빌드, 무제한 트래픽)
- Cloudflare Workers: 무료 (일 10만 요청)
- Google Sheets API: 무료 (분 60 요청 / 사용자)

## 📝 커스텀 도메인 (예: huestay.com 구매한 경우)
Cloudflare Pages → Custom domains → Add → `huestay.com`
DNS는 자동으로 Cloudflare가 관리하므로 추가 설정 거의 없음.
