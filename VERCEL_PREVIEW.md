# Vercel 공개 조회 화면

Vercel에서는 비밀번호 없이 공개 공고 사본을 조회합니다. 검색·필터·캘린더·상세 조회를 사용할 수 있습니다. 개인 조건·관심 목록·수집 이력은 제외하고 저장·수집 요청과 관리 API는 차단합니다. DB 원본, `.env`, API 키, 원본 수집 파일과 소스맵은 배포하지 않습니다.

## Git 자동 배포

`vercel.json`의 `npm run build:vercel`이 Build Output API 패키지를 만듭니다. 로컬 SQLite 없이 `apps/api/snapshots/public-notices.snapshot.json`의 검증된 공개 사본을 사용합니다. 이 사본은 공개 Git 저장소에도 포함됩니다.

`PREVIEW_AUTH_HASH`와 `PREVIEW_HOURS`는 Vercel 공개 배포에서 사용하지 않습니다. 비밀번호와 8시간 만료 제한은 없습니다. 기존 `data/vercel-preview-access.txt`의 인증 정보도 공개 배포에서는 사용하지 않습니다. Vercel 계정 자체의 Deployment Protection은 별도 설정이며 이 코드에서 변경하지 않습니다.

`main`에 병합하면 연결된 Vercel 프로젝트의 운영 주소에 자동 배포됩니다. CI에서도 인증 환경변수 없이 배포 패키지를 검사합니다.

## 공고 갱신

공고 사본은 자동 갱신되지 않습니다. 로컬 수집 후 `npm.cmd run snapshot:preview`를 실행하고 생성된 공개 사본을 검토·커밋·푸시하세요. 화면에는 사본 생성 시각을 표시합니다. 접수 중 여부와 마감 제외는 한국 날짜로 조회할 때 다시 계산합니다. 오래된 사본에는 새 공고가 없으므로 정기 갱신이 필요합니다.

## PC에서 수동 배포

프로젝트 루트에서 다음 명령을 실행합니다. 이 경로도 비밀번호 없이 공개되는 조회 전용 패키지를 만듭니다.

```powershell
npm.cmd run preview:vercel
npx.cmd vercel deploy --prebuilt --prod --scope kiminwoos-projects
```

프로젝트 연결 정보는 보존하며 `.vercel/output`만 갱신합니다. 허용한 화면 파일과 공고 API만 단일 함수로 제공합니다. 유료 기능은 활성화하지 않으며 사용량은 본인의 Vercel 요금제에 따릅니다.

## 로컬 개발과 운영 범위

로컬 개발은 `npm.cmd run dev`와 `http://127.0.0.1:4310`을 사용합니다. 별도 `npm.cmd run preview`의 로컬 보호 화면은 기존 비밀번호·만료 정책을 유지합니다.

로그인·개인별 추천·관심 저장·자동 수집을 외부에서 운영하려면 사용자 인증과 권한 분리, 외부 영구 DB, 별도 수집 작업 환경이 필요합니다. 현재 Vercel 배포는 공개 공고 조회 전용입니다.
