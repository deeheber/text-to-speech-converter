# Handoff

Branch: build/2026-10-31
Base commit: fb69d1e (main)
Tasks: 15 done, 0 blocked, 0 skipped (P0-01..P0-08, P1-01..P1-07).

## Blocked / skipped
None.

## Interpretation choices
- P0-05: body validation (400) runs before TTL/secret checks; invalid `TOKEN_TTL_HOURS` returns 500 and logs `Login failed ConfigError`.
- P0-06: Login env var is `TOKEN_TTL_HOURS` (task/PLAN), not SPEC's `TOKEN_TTL_SECONDS`; `login.mjs` converts hours to seconds.
- P1-03: the password input is cleared at the start of submit (value copied out first) and stays empty after any outcome; `notice` seeds the alert and is cleared on next submit.
- P1-04: `onLocked` is in the `useEffect` deps of App and Form; PasswordGate passes a stable `useCallback` lock.
- P1-05: `vite build` was run to a scratch outDir to confirm it compiles; `npm run production` was not run.

## ASSUMPTION config keys
None introduced. `TokenTtlHours` default 168 (not tuned).

## Manual checks (NOT VERIFIED, human)
Phase 0 (after deploy, API): GET /voices without token -> 401; with `Authorization: v1.1.abc` -> 403 (note whether `access-control-allow-origin` is present with `Origin: http://localhost:3000`); POST /login wrong -> 401, right -> 200 with token; GET /voices with token -> 200; OPTIONS preflight -> 204 with CORS; rapid POST /login -> 429; deploy passes with FailOnWarnings; rotated signing key rejects old token within ~10 min; CloudWatch logs of all six Lambdas contain no password or token. Deploying Phase 0 without Phase 1 breaks the deployed frontend.
Phase 1 (localhost and CloudFront): wrong/right password; convert, list, download, delete; reload stays unlocked and localStorage holds only `tts.session`; Lock clears table; past `expiresAt` shows prompt; key rotation returns to prompt; shared *.mp3 link opens without password; console shows no password or token.

## Codebase notes
- Vitest: create rejected mock promises lazily (`mockImplementation(() => ({ response: Promise.reject(err) }))`); eager `Promise.reject` causes unhandled-rejection errors.
- `no-credential-equality` flags `===` next to names containing secret/token/key/password unless the line has `typeof`; use truthiness/`typeof` checks.
- node:test: calling `mock.restoreAll()` at the start of a test lets it replace the `console` mocks installed in `beforeEach`.
- `kukulu_feedback_log` creates a commit, so `kukulu_task_done` then fails (HEAD subject must start with the task id); log feedback after `task_done` or add an empty `<ID>:` commit.

## For the reviewer
- `kukulu_verify` reports `no-build-references` failing on `.gitignore` line 12 (`.kukulu/implement.lock`), a line the pipeline added; it matches "Kukulu" case-insensitively. No project code triggers it; all other constraints and verify commands are green.
- Nothing was deployed; no AWS CLI commands run.
