# Vercel 임시 조회 전용 공유

현재 PC에서 수집한 실제 공고의 공개 정보만 사본으로 만들어 Vercel에 배포합니다. React 화면의 검색·필터·캘린더·상세 조회를 사용할 수 있습니다. 개인 조건, 관심 목록, 저장·수집·설정 API, DB 원본, `.env`, API 키, 원본 수집 파일은 배포하지 않습니다.

공고 사본은 자동으로 갱신되지 않습니다. 화면 상단에 사본 생성 시간을 표시하며, 새로운 공고·가격을 반영하려면 로컬 수집 후 다시 준비·배포하세요. 접수 중 여부와 마감 제외는 한국 날짜를 기준으로 조회 시 다시 계산합니다.

## 준비 및 배포

프로젝트 루트의 PowerShell에서 실행합니다.

```powershell
npm.cmd run preview:vercel
npx.cmd vercel login
npx.cmd vercel deploy --prebuilt
```

Vercel 프로젝트를 처음 연결하는 경우 CLI 안내에서 본인 계정과 공유용 프로젝트를 선택하세요. 유료 요금제·추가 기능은 이 작업에서 활성화하지 않습니다. 최초 배포의 환경·도메인 지정은 Vercel 안내를 확인하세요.

`preview:vercel`은 배포 파일만 생성하며 외부 업로드를 실행하지 않습니다. `.vercel/output`에는 인증을 적용하는 단일 Node.js Function과 공개 공고 사본, 필요한 화면 파일만 들어갑니다. 공개 정적 파일 디렉터리는 비어 있고 모든 요청이 인증 함수로 전달됩니다. DB 파일, 소스맵, 비밀번호 원문은 포함하지 않습니다. 프로젝트 연결 정보는 보존하며, 다른 도구가 만든 빌드 결과를 발견하면 덮어쓰지 않습니다.

배포 URL에서 브라우저의 인증 창이 나오면 사용자 이름 `preview`와 `data/vercel-preview-access.txt`의 비밀번호를 입력하세요. 이 파일은 Git에서 제외됩니다. 비밀번호는 채팅·이슈·커밋에 올리지 마세요. Vercel 계정 보호가 추가로 설정된 프로젝트라면 Vercel 로그인도 요청될 수 있습니다. 해당 보호 설정은 이 명령에서 변경하지 않습니다.

애플리케이션의 비밀번호 인증을 사용하므로 Vercel의 유료 Password Protection 기능을 켤 필요는 없습니다. 호스팅 요금·사용량 제한은 본인의 Vercel 요금제에 따릅니다.

## 만료와 재배포

기본 유효 시간은 **파일 생성 시점부터 8시간**입니다. 재생성하면 새 비밀번호와 만료 시간이 만들어지며 이전 배포의 비밀번호를 바꾸지는 않습니다. 이전 배포는 자체 만료 시각까지 유효합니다. 즉시 공유를 종료하려면 Vercel에서 해당 배포를 삭제하세요. 만료 후에도 Vercel 배포 자체가 자동 삭제되지는 않습니다.

유효 시간은 최대 24시간까지 지정할 수 있습니다.

```powershell
$env:PREVIEW_HOURS = '24'
npm.cmd run preview:vercel
npx.cmd vercel deploy --prebuilt
```

## 현재 지원 범위

이 구성은 공고 조회를 위한 임시 미리보기입니다. GitHub 저장소만 Vercel에 Import해서 현재 로컬 서버를 그대로 운영하는 구성은 아닙니다. 로그인·사용자별 추천·관심 저장·자동 수집을 운영하려면 외부 영구 DB, 사용자 인증과 권한 분리, 별도 수집 작업 실행 환경이 필요합니다. Vercel 함수의 로컬 SQLite 파일은 운영용 영구 저장소로 사용할 수 없습니다.

로컬에서 같은 보호 화면을 점검하려면 `npm.cmd run preview`를 실행하고 `http://127.0.0.1:4311`로 접속하세요. 로컬 인증 파일은 `data/preview-access.txt`입니다. 개발 서버는 기존대로 `npm.cmd run dev`와 `http://127.0.0.1:4310`을 사용합니다.

공식 참고: [Vercel Build Output API](https://vercel.com/docs/build-output-api/primitives), [사전 빌드 배포](https://vercel.com/docs/cli/deploy#prebuilt), [SQLite와 영구 저장소](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel), [Vercel Password Protection 요금제](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/password-protection).
