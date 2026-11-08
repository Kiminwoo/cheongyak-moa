# 청약모아 0.4 · TypeScript 모노레포

사용자 조건으로 청약을 검색·비교하는 로컬 웹앱입니다. [GitHub](https://github.com/Kiminwoo/cheongyak-moa)

## 실행

Node.js 22.15 이상에서 프로젝트 루트에서 실행합니다. 최초 설치에는 인터넷 연결이 필요합니다.

```powershell
npm.cmd install
npm.cmd start
```

Windows에서는 `start.cmd`도 사용할 수 있습니다. 브라우저는 <http://127.0.0.1:4310>입니다. 기존 서버가 실행 중이면 Ctrl+C로 종료한 뒤 다시 시작하세요. 포트는 루트 `.env`의 `PORT`로 변경합니다.

개발 중 소스 감시·서버 재시작은 `npm run dev`입니다. PC 로컬 서버이며 인터넷·휴대폰에 공개한 상태는 아닙니다.

## 구조와 경계

```text
apps/
  web/
    src/                 React + TypeScript, 화면과 브라우저 상태
    public/              CSS, PWA manifest, Service Worker, 아이콘
    test/                프런트 로직·React DOM 테스트
    dist/                웹 빌드 결과 (Git 제외)
  api/
    src/
      main.ts            프로세스 실행 진입점
      server.ts          HTTP 앱 생성·라우팅
      core/              수집·정규화·품질 검사·저장
      cli/               수집·진단·가져오기·환경 설정 명령
    test/                API·수집·저장·PWA 테스트
    dist/                API·CLI 빌드 결과 (Git 제외)
packages/
  contracts/src/         공통 DTO, API 타입, 경계 검사 도우미
  domain/src/            순수 매칭·프로필 검증·날짜 로직
scripts/                 빌드·검증·커밋 컨벤션 도구
test/                    공통 테스트 자료·도구 테스트
.env                     로컬 인증키 (Git 제외)
data/                    SQLite·원본 응답 (Git 제외)
```

`web`은 공통 계약만 사용하고 API 구현을 가져오지 않습니다. 공통 패키지는 애플리케이션이나 파일·네트워크 구현에 의존하지 않습니다. npm workspaces와 TypeScript project references를 사용하며, 각 앱의 타입 검사 설정을 분리했습니다. 빌드는 esbuild로 웹·서버를 독립 실행할 수 있습니다.

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build:web
npm.cmd run build:api
npm.cmd test
npm.cmd run test:ui
npm.cmd run check
npm.cmd run format:check
```

`check`는 strict 타입 검사·전체 빌드·일반 테스트·React 테스트를 실행합니다. `lint`는 워크스페이스 의존성 경계를 검사합니다. DOM 테스트는 실제 브라우저 시각 검증을 대체하지 않습니다.

## 공식 데이터 연결

1. [공공데이터포털](https://www.data.go.kr/)에 로그인합니다.
2. [청약홈 분양정보 API](https://www.data.go.kr/data/15098547/openapi.do)와 [LH 분양임대공고문 API](https://www.data.go.kr/data/15058530/openapi.do)를 각각 활용 신청합니다.
3. 개발계정 상세에서 일반 인증키(Decoding)를 확인합니다.
4. `npm run setup:env`로 빈 설정 파일을 만들고 루트 `.env`에 키를 입력합니다. 기존 `.env`는 덮어쓰지 않습니다.

```dotenv
APPLYHOME_SERVICE_KEY=본인의_청약홈_인증키
LH_SERVICE_KEY=본인의_LH_인증키
PORT=4310
COLLECT_LOOKBACK_DAYS=180
```

키를 채팅·커밋·Issue에 붙이지 마세요. 설정 후 서버를 재시작합니다.

```powershell
npm.cmd run doctor
npm.cmd run collect
```

진단은 키 값과 외부 호출 없이 설정 유무·수집 기간만 출력합니다. 수집 실패는 네트워크 제한·인증/승인 오류·응답 형식 오류로 구분합니다. 한 출처 수집 도중 실패하면 해당 실행의 공고 변경을 적용하지 않습니다.

화면의 데이터 현황에서도 수집 실행·설정 상태·최근 처리 이력을 확인할 수 있습니다. 기본 수집은 최근 180일 목록이며 전국 전체 기관이나 전체 과거 공고를 뜻하지 않습니다. 키 설정과 실제 응답 성공, 공고 원문 검수는 각각 다른 상태입니다.

## 응답 파일 가져오기

공식 API에서 받은 공개 목록 JSON을 데이터 현황 화면에서 가져오거나 CLI로 검증할 수 있습니다. 1MiB·1,000행 이하이며 비밀정보 항목·위험한 원문 링크·잘못된 날짜·충돌하는 공고번호를 검사합니다.

```powershell
npm.cmd run import:data -- --format applyhome-apt --file 응답.json --dry-run
npm.cmd run import:data -- --format applyhome-apt --file 응답.json
```

형식: `applyhome-apt`, `applyhome-remnant`, `applyhome-other`, `lh-notices`.

파일 자료는 `파일·미검수`로 표시합니다. 파일의 출처를 자동 인증하지 않으며 API 수집 성공으로 계산하지 않습니다. 원본·변경 이력은 보관하되 재가져오기로 같은 공고 버전을 중복 생성하지 않습니다.

## 현재 기능과 한계

### 선호 조건 비교

`내 조건 설정하기`에서 관심 지역·주거유형·분양 예산 또는 보증금·월세 예산을 저장하면 추천순에 반영됩니다. 예산 입력 단위는 만원입니다. 공고 카드와 상세 화면에서 선호 비교를 신청 자격 점검과 별도로 표시합니다.

- 일치: 입력한 항목 중 비교 가능한 정보가 맞음. 미입력 항목은 비교하지 않음
- 불일치: 관심 지역·주거유형이 다르거나 표시 금액이 예산을 초과함
- 확인 필요: 비교할 금액이 없거나 전국·미확인 지역이라 세부 공급 지역 확인이 필요함
- 미입력: 해당 선호 항목을 입력하지 않음

`선호 조건 불일치 제외`는 불일치 공고만 숨깁니다. 미확인 자료는 제외하지 않습니다. 추천 점수는 지역 30·유형 15·예산 항목별 10점을 일치 시 더하고 불일치 시 뺍니다. 예시 자격 규칙에 따른 기존 점수도 유지됩니다. 표시 금액 비교는 주택형별 총비용·대출 가능액을 보장하지 않습니다. 선호 조건이 일치해도 실제 신청 자격은 원문 검수가 필요합니다.

### 제공 범위

- 조건 입력·검색·추천 이유·관심 저장·달력·일정 파일·공고 상세·변경 이력
- 기관별 수집 상태, 응답 가져오기, 누락된 일정·금액 등의 품질 확인
- 공급유형별 날짜 분리. LH 공고게시 종료일은 접수 마감일로 사용하지 않음
- 전국 표시 공고는 특정 지역 필터에서도 숨기지 않음. 거주 자격은 별도 확인
- 기본 가상 공고 9건의 이름·금액·일정·규칙은 실제 청약 자료가 아님
- 실제 자격 규칙이 승인되지 않은 공고는 확인 필요 상태. 본인 주택 보유 여부만으로 세대 무주택 판정하지 않음
- SH·GH·기타 지자체 연동, 공고문 PDF/HWP 추출, 주택형별 가격, 실제 자격 승인, 로그인·알림·운영 배포는 후속 범위
- 한 명이 사용하는 로컬 도구이며 DB 자체 암호화는 미적용. 외부 공개 전에 사용자별 접근 제어·보안 검토 필요

PWA는 설치 정보·아이콘과 화면 파일 캐시를 제공합니다. API 응답과 사용자 조건은 오프라인 캐시하지 않습니다. 설치해도 최신 조회·저장에는 서버가 필요합니다. 브라우저별 실제 설치·다양한 화면 크기의 시각 검증은 별도입니다.

## Git·컨벤션

[CONTRIBUTING.md](CONTRIBUTING.md)와 [AGENTS.md](AGENTS.md)를 따릅니다. 검증된 변경은 Conventional Commits로 자동 커밋·작업 브랜치 푸시하고 CI를 확인합니다. API 키·DB·원본 응답·캐시·빌드 결과는 Git 제외 대상입니다.
