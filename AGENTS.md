<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 공통 UI 규칙

조회·저장 상태 UI를 구현하거나 수정할 때는 [조회·요청 상태 UI 규칙](docs/ui-feedback.md)을 읽고 따른다.

## 코드 검사와 포맷

- 코드 규칙은 `eslint.config.mjs`, 타입 검사 범위는 `tsconfig.json`, 포맷은 `.prettierrc.json`과 `.prettierignore`를 기준으로 한다. 이 문서에 개별 규칙을 중복해서 관리하지 않는다.
- 변경한 파일은 프로젝트에 설치된 Prettier로 포맷한다. `npx --no-install prettier --write <파일 경로>`를 사용하며, 전체 포맷 적용이 필요한 경우에만 `npm run format`을 실행한다.
- 코드 변경 후 `npm run format:check`, `npm run lint`, `npm run typecheck`를 실행한다. 동작을 바꿨다면 관련 테스트도 실행한다. 실행하지 못한 검사는 완료 보고에 명시한다.
- 검사를 통과시키기 위해 규칙을 끄거나, 타입 검사를 우회하거나, 테스트를 삭제·건너뛰지 않는다. 기준 변경이 필요한 경우 이유를 설명하고 변경 범위를 분리한다.
- 자동 생성 파일의 포맷은 생성기가 관리한다. `.prettierignore`에 등록된 생성 파일은 직접 포맷하지 않는다.
