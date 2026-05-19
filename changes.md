# CHANGES — gasless

> Shared change log for AI agents. Newest entry on top. One entry per meaningful change. Include commit SHAs and scope.

---

## 2026-05-18 — TypeScript strict mode enabled
**Author:** Satoshi (OpenClaw)
**Scope:** `tsconfig.base.json`
**Changes:**
- Enabled `strict: true` in `tsconfig.base.json`
- Note: repo not cloned in workspace yet — clone with `git clone https://github.com/skulls206-creator/gasless.git` before working

**Notes for next AI:**
- Strict mode is now enforced. Run `pnpm run typecheck` after any change before committing.
- The `strict: true` flag adds `strictFunctionTypes`, `strictNullChecks`, `strictPropertyInitialization`, `noImplicitAny`, `noImplicitThis`, `alwaysStrict`, `useUnknownInCatchVariables`, and `strictBindCallApply`.
- Sub-tsconfigs with `"extends": "./tsconfig.base.json"` inherit this automatically.
- **Repo not cloned yet** — clone with `git clone https://github.com/skulls206-creator/gasless.git` before working on this repo.
