# 개발·형상 관리 규칙

## 변경 흐름

1. `feat/설명`, `fix/설명`, `refactor/설명` 등 작업 브랜치를 사용합니다.
2. 관련 기능을 구현하고 기존 사용자 변경은 보존합니다.
3. `npm run format`, `npm run lint`, `npm run check`, `npm run format:check`를 실행합니다.
4. 관련 파일만 스테이징하고 비밀정보 포함 여부를 확인합니다.
5. Conventional Commits로 커밋하고 현재 작업 브랜치를 `origin`으로 푸시합니다.
6. CI 성공을 확인합니다. 실패를 해결하기 전 완료로 보고하거나 main으로 반영하지 않습니다.

사용자는 이후 개발에서 이 자동 커밋·푸시 흐름을 승인했습니다. 강제 푸시·배포·공유 범위 변경은 이 승인에 포함되지 않습니다. 환경 제한으로 로컬 검증이 불가능하면 제한을 보고하고 작업 브랜치 CI에서 검증합니다.

## 커밋 메시지

[Conventional Commits 1.0](https://www.conventionalcommits.org/en/v1.0.0/)을 사용합니다.

```text
feat(api): add validated response import
fix(web): preserve nationwide notices in regional filters
refactor(domain): isolate matching logic
test(api): cover collection rollback
docs: update local setup
ci: verify TypeScript workspaces
```

유형: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `build`, `ci`, `chore`, `style`, `revert`.
범위: `web`, `api`, `domain`, `contracts`, `tooling`, `data`, `deps` 등을 사용합니다. 제목은 100자 이내입니다. 호환성 변경에는 `!` 또는 `BREAKING CHANGE:` 본문을 사용합니다.

`npm install`의 prepare 단계에서 로컬 `.githooks/commit-msg` 검사를 설정합니다. 전역 Git 설정은 변경하지 않습니다.

## 코드 컨벤션·경계

- TypeScript strict 모드, 공통 DTO는 `packages/contracts`.
- 순수 자격·선호 매칭은 `packages/domain`, I/O는 `apps/api`.
- React UI는 `apps/web`에 두며 API 구현을 import하지 않습니다.
- Prettier: 세미콜론, 작은따옴표, 들여쓰기 2칸, 줄 너비 100.
- 예외를 숨기기 위한 `any`, `@ts-ignore`, `@ts-nocheck`를 추가하지 않습니다.
- 금액 미확인을 0원으로 바꾸거나, API 수신·파일 가져오기를 자격 검수 완료로 표시하지 않습니다.
- 환경변수·SQLite·원본 응답·개인정보·빌드 결과를 커밋하지 않습니다.

## 의존성·실행

모노레포 전체 설치는 루트 `npm install`, 잠금 파일이 준비된 새 환경은 `npm ci`입니다. 패키지 manifest가 바뀌면 루트 lockfile도 함께 갱신합니다. 전체 실행은 루트 `npm start`, 개발 감시는 `npm run dev`입니다.

CI는 네트워크 API 인증키 없이 타입·경계·빌드·일반/React 테스트·포맷을 검증합니다. 브랜치 보호 설정과 운영 배포는 별도입니다.
