# 개발 및 형상 관리

기본 브랜치는 `main`입니다. 기능 작업은 `feat/설명`, 수정 작업은 `fix/설명` 브랜치에서 진행하고 Pull Request로 반영하는 흐름을 권장합니다. 저장소의 브랜치 보호 설정은 별도로 활성화해야 합니다.

```powershell
git switch -c feat/기능명
npm.cmd install
npm.cmd run build
npm.cmd test
npm.cmd run test:ui
git add 필요한_파일
git diff --cached
git commit -m "feat: 변경 내용"
git push -u origin feat/기능명
```

첫 정상 설치에서 생성되는 `package-lock.json`을 커밋하세요. 이후 새 환경과 CI에서는 `npm ci`로 같은 의존성을 설치할 수 있습니다. 기본 CI는 lockfile 유무를 확인해 설치 방식을 선택합니다.

## 커밋에 포함하지 않는 파일

- `.env`, `.env.*`의 인증키·설정 비밀정보. 이름과 빈 값만 있는 `.env.example`은 포함합니다.
- `data/`, SQLite DB·WAL·SHM, 사용자 조건·관심 공고·원본 API 응답
- `node_modules/`, `.npm-cache/`, 테스트 임시 파일, 로그
- `public/app.js`와 source map: React 소스로부터 빌드합니다.

공개 저장소의 Issue·PR·커밋에도 인증키와 실제 사용자 정보를 붙이지 마세요. 실행·구현 범위는 README를 확인하세요.

## GitHub Actions

`main`에 push하거나 `main` 대상 PR을 만들면 Node 22에서 패키지 설치, React 빌드, 일반 테스트, React DOM 테스트를 실행합니다. 배포와 외부 API 호출은 수행하지 않으며 API 인증키가 필요하지 않습니다.
