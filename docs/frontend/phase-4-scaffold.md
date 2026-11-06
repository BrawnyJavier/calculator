# Phase 4 — Frontend: Scaffold & Tooling

**Budget:** 15 min · **Depends on:** nothing (can run in parallel with Phases 1–3)

## Goal
A clean Vite + React + TypeScript project with linting, unit testing, coverage, and a dev proxy to the
Go backend — with all template boilerplate removed.

## Scope
- **In:** project generation, dev dependencies, Vite/Vitest/TS config, npm scripts.
- **Out:** any application code (Phases 5–6).

## Files
- `frontend/package.json`, `frontend/package-lock.json`
- `frontend/vite.config.ts`
- `frontend/tsconfig*.json` (template defaults, `strict: true`)
- `frontend/src/setupTests.ts`
- `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/index.css` (minimal placeholders)

## Steps
1. `npm create vite@latest frontend -- --template react-ts`, then `npm install`.
2. Dev deps:
   ```bash
   npm i -D vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
   ```
3. `vite.config.ts` (Vitest config lives here — no separate file):
   ```ts
   export default defineConfig({
     plugins: [react()],
     server: { proxy: { '/api': 'http://localhost:8080' } },
     test: {
       environment: 'jsdom',
       setupFiles: './src/setupTests.ts',
       coverage: { provider: 'v8', include: ['src/**'], exclude: ['src/main.tsx', 'src/**/*.test.*'] },
     },
   })
   ```
   Add `/// <reference types="vitest/config" />` at the top for typing.
4. `src/setupTests.ts`: `import '@testing-library/jest-dom/vitest'`.
5. Scripts: `"test": "vitest run"`, `"test:watch": "vitest"`, `"coverage": "vitest run --coverage"`
   (keep template `dev`, `build`, `lint`, `preview`).
6. Remove boilerplate: `App.css`, `assets/`, `public/vite.svg`, counter demo; set `<title>Calculator</title>`.
7. Commit: `frontend: scaffold Vite React-TS app with Vitest`.

## Tests
- A throwaway smoke test (`App renders a heading`) to prove the toolchain works; it is replaced in Phase 6.

## Definition of done
- `npm run dev`, `npm run build`, `npm run lint`, `npm test`, `npm run coverage` all succeed.
- No template demo code or assets remain.
- Only `react` and `react-dom` in `dependencies`.
