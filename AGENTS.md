# Development instructions

- Use TypeScript for application and shared-package code. Keep strict checks enabled; do not add `any`, `@ts-ignore`, or `@ts-nocheck` to silence errors.
- `apps/web` owns React presentation and browser state. It may depend on `packages/contracts`, never API implementation.
- `apps/api` owns HTTP, SQLite, collection, normalization and file I/O. Keep server construction separate from the process entry point.
- `packages/contracts` owns shared DTOs and boundary helpers. `packages/domain` owns pure matching and qualification logic. Neither package may import an application.
- Preserve root `.env` and `data/`. Never print credentials, add them to commits, send them to GitHub Actions, or claim unverified data is official/eligible.
- Use Prettier and Conventional Commits 1.0: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `build`, `ci`, `chore`, `style`, `revert`. Prefer scopes `web`, `api`, `domain`, `contracts`, `tooling`, `deps`, `data`.
- The user authorizes automatic commits and pushes for completed additions, changes and fixes. Stage only files related to the current work, preserve unrelated user edits, run relevant checks, commit coherent changes, and push the active task branch to origin. Do not force-push.
- Before a normal completed-change push, run `npm run check` and `npm run format:check`. If an environment restriction prevents a check, state the exact limitation; a task-branch push to run that check in CI is allowed. Do not merge an unverified change into main.
- Verify CI after pushing. Resolve failures before claiming completion. Do not change repository sharing, secrets, branch protection, billing or deployment without a matching user request.
- Use feature branches for substantial work and a PR targeting main. Push does not imply release or production deployment.
