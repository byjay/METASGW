# 메타SGW (METASGW)

SGW 세션으로 로그인한 직원이 자신이 멤버인 SEDMS 프로젝트를 항구에 정박한 배로 확인하고, 클릭·승선으로 SEDMS 프로젝트·팀 채팅·NAS·메일로 이동하는 **3D 입구 및 항구 상황판** 정적 웹 앱입니다.

- 업무 기능 자체를 3D 안에 복제하지 않고, SGW·SEDMS·bmail 딥링크로 연결합니다.
- 백엔드 서버·WebSocket·별도 SSO 없이 SGW 동일 오리진(`/meta/`)의 정적 파일로 동작합니다.

---

## 1. 실행 모드 (`sgw` / `preview`)

`src/runtimeEnv.ts` 의 `detectRuntimeEnv()` 가 호스트와 경로(`base`)를 기준으로 실행 모드를 자동 분기합니다.

| 모드 | 판별 조건 | 동작 |
| --- | --- | --- |
| `sgw` | SGW 운영 호스트 또는 `/meta/` 경로 하위 | 동일 오리진 SGW API 만 호출. 데모 픽스처 코드 경로 완전 차단. `401` 시 `/?next=/meta/` 이동, `403`/`404` 시 안내 화면 표시. |
| `preview` | 로컬 개발(`localhost`)·미리보기 환경 | 네트워크 호출 대신 가명 픽스처(`user01`~`user05`, `dept01`~`dept03`, `proj01`~`proj04`) 사용. 상단에 `"데모 — 가명 데이터, SGW 미연결"` 배지 상시 표시, 외부 이동 버튼은 안내 토스트만 표시. |

---

## 2. SGW 저장소 이관 및 배포 방법

SGW 저장소의 `/talk/` 배포 방식과 동일한 정적 번들 구조를 따릅니다.

1. **폴더 배치**
   - SGW 저장소 루트의 `meta/` 디렉터리에 본 프로젝트를 배치합니다.
2. **빌드 스크립트 연결 (`scripts/build-meta.mjs`)**
   - `node scripts/build-meta.mjs` 실행 시 다음 순서로 검증·빌드합니다.
     1. TypeScript 타입 검사 (`tsc --noEmit`)
     2. 전체 단위 테스트 (`scripts/run-tests.mjs`)
     3. `VITE_META_BASE=/meta/` 정적 빌드 (`vite build`, `vite.config.ts` 의 `base` 가 `/meta/` 로 설정됨)
     4. 산출물 `dist/index.html` 에 `/meta/` 경로 존재 여부 및 외부 CDN 링크 부재 검증
     5. 상위 `../app/build/web` 디렉터리가 존재하면 `../app/build/web/meta/` 로 자동 복사
3. **SPA 라우팅 (`_redirects`)**
   - Cloudflare Pages 등 정적 호스팅의 `_redirects` 파일에 아래 **한 줄**을 추가합니다.
   ```text
   /meta/* /meta/index.html 200
   ```
4. **초기 로딩 최적화**
   - `three` 및 3D 장면(`HarborSceneController`)은 동적 `import()` 로 분리되어, 첫 진입 시 로그인 확인·HUD·2D 목록이 먼저 열리고 3D 는 백그라운드에서 로드됩니다.
   - WebGL 미지원·컨텍스트 손실(`webglcontextlost`)·3D 청크 로드 실패 시 자동으로 2D 목록 모드를 유지하며 `"3D 를 다시 시도"` 복구 버튼을 제공합니다.

---

## 3. 사용하는 SGW API 및 미구현 계약

모든 `fetch()` 호출은 `src/sgwAdapter.ts` 한 곳에서만 수행하며 `credentials: 'same-origin'` 을 사용합니다.

| 용도 | 메서드·경로 | 비고 |
| --- | --- | --- |
| 로그인 세션 확인 | `GET /auth/me` | `401` → `/?next=/meta/` 이동 |
| 로그아웃 | `POST /api/auth/logout` | 세션 종료 후 `/` 이동 |
| 직원 목록 | `GET /api/employees` | 부두 아바타·동료 찾기 목록 구성 (`sub` 키 기준) |
| 접속 현황 조회 | `GET /api/presence` | 12초 폴링, 실패 시 HUD에 `"연결 끊김 — 마지막 갱신 n분 전"` 표시 |
| 접속 하트비트 | `POST /api/presence` | 12초 주기, 요청 바디에 클라이언트 신원 주장 필드 미포함 |
| **내 SEDMS 프로젝트 목록** | `GET /api/gateway/sedms/projects` | **미구현 계약 (SEDMS 배포 후 활성화)**. 60초 캐시. `mapped:false` → `"SEDMS 에 한 번 로그인하면 내 프로젝트 배가 보입니다"` + `[SEDMS 열기](/api/sedms-sso?return=/projects)`, `available:false` → `"SEDMS 연결 준비 중"`, `mapped:true` & 0건 → `"참여 중인 프로젝트가 없습니다"`, `404`/`501` → 준비 중 안내 유지 |

### 딥링크 계약 (`src/deepLink.ts`)
- SEDMS 이동: `/api/sedms-sso?return=<encoded>` (허용 경로: `/projects`, `/project/<id>`, `/app`, `return` 파라미터명 고정)
- 팀 채팅 / 1:1 대화: `/talk/`, `/talk/?dm=<sub>`, `/talk/?room=<roomId>`
- 파일함(NAS): `/nas/`
- 메일 앱: `bmail://inbox` (열기 링크만 제공, 본문 처리 없음)

---

## 4. 보안 규칙 요약

- **서버 권한 단일 진실**: 브라우저 측 권한 판정 함수 없음. `401`/`403`/`404`/`429`/`5xx`/오프라인 응답을 `src/errorCatalog.ts` 단일 카탈로그로 처리.
- **토큰·개인정보 저장소 금지**: `Authorization` 헤더 미사용, 토큰·세션·PII 의 `localStorage`/`sessionStorage`/`IndexedDB` 저장 금지(비-PII 선박 표시 설정만 `src/shipDisplayPrefs.ts` 에 격리). HttpOnly 동일 오리진 세션 쿠키만 사용.
- **DOM·링크 안전성**: `innerHTML`, `dangerouslySetInnerHTML`, `eval`, `postMessage`, `window.open`, `window.alert` 전면 금지. 내비게이션 URL 은 동일 오리진 경로(`/...`), `http://`, `https://`, `bmail://` 만 허용.
- **외부 CDN 차단**: 폰트·텍스처·스크립트·3D 모델 외부 CDN 미사용 (PBR 텍스처는 절차 생성, CC0 아바타 모델은 `public/models/` 로컬 번들).
- **식별자 비노출**: 코드·테스트·문서에 실명, 실제 이메일·전화번호, 사내 주소, 고객사·조선소명, 호선번호를 포함하지 않으며 `src/compliance.test.ts` 로 자동 검사.
- **프로젝트 전환 격리**: 다른 배 승선·하선 시 이전 프로젝트의 선상 패널·미니맵 선택·래디얼 메뉴 상태를 즉시 초기화(`src/boardingState.ts`).

---

## 5. 개발 및 테스트 실행

```bash
# 의존성 설치 (package.json 버전 정확 고정)
npm install

# 개발 서버 실행 (preview 모드, http://localhost:3000)
npm run dev

# 타입 검사
npm run lint

# 전체 단위 테스트 실행 (Node 내장 테스트 러너 + tsx)
npm run test

# 일반 정적 빌드 (base=/)
npm run build

# SGW 배포용 통합 검증 및 빌드 (타입 검사 + 테스트 + base=/meta/ 빌드)
npm run build:sgw
```
