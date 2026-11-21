# Vercel 공개 조회 화면

Vercel에서는 임시 고객 또는 관리자 계정으로 로그인해 공고 사본을 조회합니다. 검색·필터·캘린더·상세 조회를 사용할 수 있습니다. 개인 조건·관심 목록·수집 이력은 제외하고 저장·수집 요청과 관리 API는 차단합니다. DB 원본, `.env`, API 키, 원본 수집 파일과 소스맵은 배포하지 않습니다.

## 임시 계정 관리

로컬 앱의 관리자 계정은 **데이터 연결 현황**에서 갱신을 실행할 수 있습니다. Vercel의 관리자 계정은 **데이터 연결 현황 → 전체 데이터 갱신**으로 클라우드 수집 작업을 실행할 수 있습니다. 고객 계정은 공고·일정·상세 결과를 조회할 수 있습니다.

계정 교체는 `npm run accounts:create`를 실행한 뒤 새 공개 검증 키만 커밋하고 배포합니다. 비밀번호는 로컬 `data/temporary-admin-*.txt`와 `data/temporary-client-*.txt`에서 각각 확인합니다. 생성된 고강도 비밀번호는 로그인에 필요한 키이며 링크·커밋·출력 로그에 포함하지 않습니다. 새 계정을 배포하면 교체 전 세션도 만료됩니다. Git 저장소에 있는 공개 공고 사본의 접근 권한은 Git 설정을 따릅니다.

## 휴대폰에 설치

- **Android**에서 공개 HTTPS 주소를 Chrome으로 엽니다. 화면의 **앱 설치 안내**를 누르거나 Chrome 메뉴에서 **홈 화면에 추가** 또는 **앱 설치**를 선택합니다.
- **iPhone·iPad**에서 공개 주소를 Safari로 엽니다. **공유 → 홈 화면에 추가 → 추가**를 선택합니다.

홈 화면의 청약모아 아이콘을 누르면 앱 창으로 열립니다. 화면 파일만 기기에 저장하며 공고 조회에는 인터넷 연결이 필요합니다.

## Git 자동 배포

`vercel.json`의 `npm run build:vercel`이 Build Output API 패키지를 만듭니다. 로컬 SQLite 없이 `apps/api/snapshots/public-notices.snapshot.json`의 검증된 공개 사본을 사용합니다. 이 사본은 공개 Git 저장소에도 포함됩니다.

`PREVIEW_AUTH_HASH`와 `PREVIEW_HOURS`는 Vercel 공개 배포에서 사용하지 않습니다. 임시 계정은 생성 후 1년, 로그인 세션은 최대 8시간 동안 유효합니다. 기존 `data/vercel-preview-access.txt`의 인증 정보도 공개 배포에서는 사용하지 않습니다. Vercel 계정 자체의 Deployment Protection은 별도 설정이며 이 코드에서 변경하지 않습니다.

`main`에 병합하면 연결된 Vercel 프로젝트의 운영 주소에 자동 배포됩니다. CI에서도 인증 환경변수 없이 배포 패키지를 검사합니다.

## 클라우드 공고 갱신

Render에서 이 저장소의 `main` 브랜치와 [Render Blueprint](https://render.com/docs/infrastructure-as-code) 파일 `render.yaml`로 수집 서비스를 생성합니다. 수집 작업은 Render에서 실행 시간에 따라 과금됩니다. 템플릿은 매일 **오전 8시 한국시간(UTC 23시)**에도 같은 명령을 실행합니다.

1. Render의 수집 서비스에 `APPLYHOME_SERVICE_KEY`, `APPLYHOME_RESULTS_SERVICE_KEY`, `LH_SERVICE_KEY`, `MYHOME_SERVICE_KEY`를 설정합니다. LH 키에 마이홈 서비스 승인도 있으면 같은 키를 쓸 수 있습니다. 같은 서비스에 이 저장소의 Contents 쓰기 권한을 가진 `GITHUB_PUBLISH_TOKEN`을 설정합니다.
2. Vercel 운영 프로젝트의 환경에 Render 서비스 ID인 `RENDER_REFRESH_SERVICE_ID`와 Render 작업 조회·생성이 가능한 `RENDER_REFRESH_API_KEY`를 설정하고 재배포합니다.
3. 운영 사이트의 **데이터 현황 → 전체 데이터 갱신**을 눌러 실행합니다. 작업 상태는 관리 화면에서 확인하고, 실패 상세는 Render 작업 로그에서 확인합니다.

클라우드 수집은 GitHub에 발행된 직전 공개 사본에서 시작합니다. 청약홈·LH·마이홈·SH/GH와 주택형별 공급 정보, 청약홈 APT 결과를 수집합니다. 인천도시공사 직접 API는 제외합니다. 필수 API와 가격·결과 검증이 성공하면 공개 사본만 GitHub에 반영하고 Vercel이 자동 배포합니다. 다른 작업이 공개 사본을 먼저 발행한 경우 GitHub가 이전 사본을 기준으로 한 변경을 거부합니다.

## PC에서 공고 갱신

운영 일일 갱신은 **매일 오전 8시 한국시간(UTC 23시)**에 시작하도록 수집 전용 PC 또는 서버에 등록합니다. 청약홈 분양·가격·APT 결과, LH, 마이홈 공고와 SH·GH 게시판을 한 번 조회합니다. 필수 API와 가격·결과 검증을 통과하면 공개 사본만 `main`에 푸시합니다. 화면 반영 시각은 수집과 Vercel 빌드가 끝나는 시각입니다. 인천도시공사 직접 API는 일일 갱신에서 제외합니다.

수집 전용 `main` 체크아웃에 Node.js 22 이상과 Git을 설치하고 `npm ci`를 실행합니다. 로컬 `.env`에 `APPLYHOME_SERVICE_KEY`, `LH_SERVICE_KEY`, `MYHOME_SERVICE_KEY`, `APPLYHOME_RESULTS_SERVICE_KEY`를 설정합니다. LH 인증키에 마이홈 서비스 승인도 있으면 마이홈 키를 공유할 수 있습니다. 예약을 실행하는 OS 계정의 Git 자격 증명과 커밋 작성자 설정으로 `origin/main`에 푸시할 수 있어야 합니다. `.env`와 수집 DB는 이 계정의 저장소에 보관합니다.

- **Windows**에서 수집 체크아웃 루트에서 PowerShell로 `.\scripts\install-daily-refresh.ps1`을 실행합니다. 작업 스케줄러의 **CheongyakMoa Daily Refresh**에 등록되며, 해당 Windows 계정에 로그인된 상태에서 실행됩니다.
- **Linux**에서는 cron 시간대를 UTC로 설정하고 `0 23 * * * /절대경로/node /수집체크아웃/scripts/publish-daily-data.mjs`를 수집 계정에 등록합니다. Git을 찾을 수 있도록 예약 작업의 `PATH`를 설정합니다.

예약 결과는 `data/daily-refresh.log`, 수집 검증은 `data/refresh-report.json`에서 확인합니다. 중단 뒤 잠금 파일이 남았다면 수집 프로세스가 종료된 것을 확인한 다음 `data/daily-refresh.lock`을 삭제합니다. 푸시에만 실패한 경우 다음 실행에서 대기 중인 사본 커밋을 재시도합니다. 다른 커밋과 충돌한 경우 로그에서 확인할 수 있습니다.

수동 갱신은 관리자 앱의 **데이터 연결 현황 → 전체 데이터 갱신**에서 실행합니다. 예약 작업 없이 앱을 켜 둔 동안 수집할 수 있습니다. 같은 버튼으로 운영에 발행하려면 위와 같이 수집 전용 `main` 체크아웃과 Git 자격 증명을 준비하고 로컬 `.env`에 `PUBLISH_DATA_ON_REFRESH=1`을 설정한 뒤 앱을 다시 시작합니다. 검증에 실패하면 아래 상태 메시지와 `data/daily-refresh.log`를 확인할 수 있습니다. 운영 공유 화면은 공개 사본을 조회합니다.

파일로 확인하려면 수집 후 `npm.cmd run snapshot:preview`를 실행해 생성된 사본을 검토·커밋·푸시할 수 있습니다. 화면에는 사본 생성 시각을 표시하며, 접수 상태는 조회 시점의 한국 날짜로 다시 계산합니다.

## PC에서 수동 배포

프로젝트 루트에서 다음 명령을 실행합니다. 이 경로도 계정 로그인과 공고 조회를 제공하는 패키지를 만듭니다.

```powershell
npm.cmd run preview:vercel
npx.cmd vercel deploy --prebuilt --prod --scope kiminwoos-projects
```

프로젝트 연결 정보는 보존하며 `.vercel/output`만 갱신합니다. 허용한 화면 파일과 공고 API만 단일 함수로 제공합니다. 유료 기능은 활성화하지 않으며 사용량은 본인의 Vercel 요금제에 따릅니다.

## 로컬 개발과 운영 범위

로컬 개발은 `npm.cmd run dev`와 `http://127.0.0.1:4310`을 사용합니다. 별도 `npm.cmd run preview`의 로컬 보호 화면은 기존 비밀번호·만료 정책을 유지합니다.

로그인·개인별 추천·관심 저장·자동 수집을 외부에서 운영하려면 사용자 인증과 권한 분리, 외부 영구 DB, 별도 수집 작업 환경이 필요합니다. 현재 Vercel 배포는 공개 공고 조회 전용입니다.
