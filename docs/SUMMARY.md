# Summary: site-wide password (build/2026-10-31)

**Merge line:** `build/2026-10-31`, base `fb69d1e` (main) → head `fe91866`, 58 commits, 2 reviews, final verdict **APPROVED** (Round: 2).

Spec: `docs/SPEC.md` v0.1 (issue https://github.com/deeheber/text-to-speech-converter/issues/71). 21 of 21 tasks done, none blocked or skipped.

## What was built

**Phase 0: API (P0-01 to P0-08).** The four existing handlers (CreateNewFile, ListFiles, GetVoices, DeleteFile) no longer log the raw event. Each now logs only the request id and route key, and a test checks that the `Authorization` header never reaches the console. DeleteFile also got its first test suite. A new `src/Auth` package adds three pieces: an HMAC-signed `v1.<expiresAt>.<sig>` token module with constant-time comparison, a Secrets Manager cache with a time window, and a `TokenAuthorizer` Lambda that fails closed. It also adds a `Login` handler that checks the shared password and returns an expiring token. `template.yaml` wires in the secrets, both functions, the HTTP API authorizer on every route except `POST /login`, throttling, and the `TokenTtlHours` parameter (default 168). A template test covers the wiring. The README documents the password, key rotation, and the rule that Phase 0 and Phase 1 must be deployed together.

**Phase 1: Frontend (P1-01 to P1-07).** Vitest was added, together with a `session.js` store that is the only code that touches `localStorage`. It stores only `tts.session` with a token and an `expiresAt`. A login API client and an Amplify configuration send the token on each request. A `PasswordForm` and a `PasswordGate` lock the app until a valid session exists. A Lock button and auth-error handling in App, Form and Table send the user back to the prompt on a 401/403, or on any failure once the session has gone. The README's local-dev section mentions the prompt.

**Review fixes, round 1 (R1-01 to R1-06).** These tasks changed only tests and one constraint rule. They changed no source files. The `no-build-references` constraint no longer matches the pipeline's own `.kukulu/` path. New tests cover these cases:
- `verifyToken` rejects correctly signed but non-canonical tokens.
- The `session.js` expiry boundary and the numeric-type check.
- The no-session branches in App (GET /file), Form (GET /voices 401/403 and POST /file) and Table (DELETE).

## Decisions that shaped it

- **P0-06:** The token lifetime env var is `TOKEN_TTL_HOURS`, not SPEC's `TOKEN_TTL_SECONDS`, and `login.mjs` converts hours to seconds (×3600). CloudFormation has no arithmetic intrinsic. The template test asserts `TOKEN_TTL_HOURS`. (PLAN Decision and HANDOFF interpretation.)
- **P0-01/P0-02:** The logging fix came first in Phase 0, so the `no-raw-event-logging` constraint could switch on at P0-02 and guard every Auth task.
- **P0-04:** `secrets.mjs` has no test file of its own. Its cache window is covered by the authorizer test.
- **P0-03:** Signatures are compared as the UTF-8 bytes of the base64url string, not as decoded bytes, because lenient base64url decoding would accept some tampered signatures.
- **P0-03:** `expiresAt` must match `/^[0-9]+$/` and be `Number.isSafeInteger`. `1e10`, `+5`, `1.0` and `""` are rejected.
- **P0-05:** `POST /login` with `{"password": ""}` returns 400 "Password is required".
- **P0-05:** A body with `isBase64Encoded: true` is base64-decoded before `JSON.parse`.
- **P0-05:** Body validation (400) runs before the TTL and secret checks. An invalid `TOKEN_TTL_HOURS` returns 500 and logs `Login failed ConfigError`.
- **P1-01:** Frontend tests live in `src/frontend/test/`, outside `src/`, so principles 5 to 7 hold for them without exclusions.
- **P1-03/P1-05:** `PasswordGate` keeps the `lock(message?)` notice and shows it in `PasswordForm`'s `role="alert"` element until the next submit.
- **P1-03:** The password input is cleared at the start of submit (the value is copied out first) and stays empty after any outcome.
- **P1-04:** `onLocked` is in the `useEffect` deps of App and Form. `PasswordGate` passes a stable `useCallback`.
- **P0-06:** `TokenTtlHours` is `Type: Number`, `Default: 168`, `MinValue: 1`.
- **P0-06:** Both new functions also get `AWSXrayWriteOnlyAccess`. "Secret policies match exactly" is read as: the only `secretsmanager:*` grant is `GetSecretValue` on exactly the listed secrets.
- **Plan:** No parallel streams were used.
- **Plan:** `build` in `docs/kukulu.json` is empty, because SPEC forbids `sam build`/`npm run production` and `vite build` needs the gitignored `config.js`.
- **P1-05:** `vite build` was run once, to a scratch outDir, only to confirm the app compiles. `npm run production` was not run.
- **R1-01:** The `no-build-references` pattern became `(?<!\.)[Kk][uūŪU]kulu`, which exempts any "kukulu" that directly follows a dot.

## Assumptions still in play

- No `⚠️ ASSUMPTION` config keys were introduced.
- `TokenTtlHours` default 168 (7 days) comes from SPEC and has not been tuned.

## Spec issues

Edits to make to SPEC.md:
- **SPEC 5 `TOKEN_TTL_SECONDS` vs `TOKEN_TTL_HOURS`.** Update the Functions table to `TOKEN_TTL_HOURS`, or rename the parameter to seconds. Renaming would change the 168 default that the template test pins.
- **SPEC 3 principle 11 and `.kukulu/` paths.** Read literally, the principle forbids the `.kukulu/implement.lock` line that the pipeline writes into `.gitignore`. State the exemption for `.kukulu/` path references explicitly.
- **SPEC 4 test files.** SPEC 4 lists only `token`, `login` and `authorizer` tests. The `secrets.mjs` cache is covered by the authorizer test. Say so, or list a `secrets` test.
- **SPEC 7 single-test command.** `npx --prefix src/frontend vitest run {filter}` from the repo root does not find `vite.config.js`. `docs/kukulu.json` adds `--root src/frontend`, and SPEC should too.
- **SPEC 3 principle 3.** The ban on `===`/`!==` for credentials is only partly mechanical, because the constraint keys on variable names. Note that the rest is checked by reading.
- **SPEC 6 `lock(message)`.** SPEC does not say where the message is shown. PLAN shows it in `PasswordForm`'s alert element.
- **SPEC 5 X-Ray policy.** SPEC does not mention the `AWSXrayWriteOnlyAccess` policy that every existing function has. Mention it, or clarify that "exactly" applies only to the Secrets Manager grants.

Known-gap candidates: none (the final REVIEW.md lists none).

## Manual checks owed (NOT VERIFIED)

**Phase 0: API, after deploying.** Deploy together with Phase 1, because Phase 0 alone breaks the deployed frontend.
- `GET /voices` without a token returns 401.
- `GET /voices` with `Authorization: v1.1.abc` returns 403. Note whether `access-control-allow-origin` is present when sent with `Origin: http://localhost:3000`.
- `POST /login` with the wrong password returns 401. With the right password it returns 200 with a token.
- `GET /voices` with that token returns 200.
- An OPTIONS preflight returns 204 with CORS headers.
- Rapid repeated `POST /login` returns 429.
- The deploy passes with `FailOnWarnings`.
- After the signing key is rotated, the old token is rejected within about 10 minutes.
- CloudWatch logs for all six Lambdas (CreateNewFile, ListFiles, DeleteFile, GetVoices, Login, TokenAuthorizer) contain no password or token.

**Phase 1: Frontend, on localhost and the CloudFront URL.**
- The wrong password shows the error, and the right one unlocks.
- Convert, list, download and delete all work.
- After a reload you stay unlocked, and `localStorage` holds only `tts.session`.
- Lock clears the table.
- Setting `expiresAt` to a past value, then reloading, shows the prompt.
- Rotating the key returns you to the prompt.
- A shared `*.mp3` link opens without the password.
- The console shows no password or token.

## Review history

- **Round 1: CHANGES REQUESTED.** 6 findings and 6 fix tasks (R1-01 to R1-06). By source: 5 from review, 1 from mutation, 0 from blocked tasks. Converging. There was no earlier round, so nothing could recur.
- **Round 2: APPROVED.** 0 findings and 0 fix tasks. No finding recurred: none of R1-01 to R1-06 reappeared.

Round 2 was a notes-only approval. Its `## Notes` section flagged these items, and none of them was queued as work:
- The `docs/kukulu.json` mutant could not be checked through `kukulu_mutate`. The reviewer confirmed the fixture by hand.
- The `(?<!\.)` lookbehind blind spot: any "kukulu" right after a dot is exempt.
- A stale comment at `src/GetVoices/index.js:4`: "Log the event argument for debugging..." sits above a line that no longer logs the event.
- `src/Auth/test/authorizer.test.mjs` prints `Authorizer invoked undefined undefined` to stdout eight times.
- No test checks that a failed fetch in `src/Auth/secrets.mjs` is not cached. This holds structurally.

## Pipeline friction

- **implement, tool-refusal:** The no-build-references constraint flags the `.gitignore` line `.kukulu/implement.lock` (added by run_start), because it matches Kukulu case-insensitively. As a result, verify reports ok:false regardless of the task.
- **review, misleading-verdict:** `kukulu_mutate` reports every mutant as "killed: constraint no-build-references caught the mutation", because the pipeline-added `.gitignore` line `.kukulu/implement.lock` permanently fails that constraint. Survivors are only visible by reading each result's command exit codes.
- **review, tool-behavior:** `kukulu_mutate` on `docs/kukulu.json` (reverting the no-build-references pattern) reported "survived" with constraints ok. The constraint self-test does not appear to reload the mutated config, so a config-rule mutant cannot be checked through the tool. The fixture had to be confirmed by hand with node.
- **implement, not logged** (from HANDOFF Codebase notes): `kukulu_feedback_log` creates a commit, after which `kukulu_task_done` fails because the HEAD subject must start with the task id. The workaround was an extra `P0-01: ... (record)` commit.

## Suggested CLAUDE.md additions

- Vitest: create rejected mock promises lazily (`mockImplementation(() => ({ response: Promise.reject(err) }))`). An eager `Promise.reject` causes unhandled-rejection errors.
- `no-credential-equality` flags `===` next to names that contain secret/token/key/password unless the line has `typeof`. Use truthiness or `typeof` checks.
- node:test: calling `mock.restoreAll()` at the start of a test lets it replace the `console` mocks installed in `beforeEach`.
- `src/Auth/test/authorizer.test.mjs` prints stray `Authorizer invoked undefined undefined` lines, because some tests do not mock `console.log`.
- (Pipeline, not project) `kukulu_feedback_log` commits, so log feedback after `kukulu_task_done`, or add an empty `<ID>:` commit.

## Advisory mutation survivors

- **`docs/kukulu.json` mutant.** Reverting the `no-build-references` pattern through `kukulu_mutate` reported `survived` with constraints `ok`. The tool's constraint self-test does not appear to reload a mutated config. I confirmed by hand with `node` that the `.kukulu/implement.lock` `shouldNotMatch` fixture fails against the old pattern. The rule's own self-test therefore guards the fix. I logged this as pipeline friction. It is not a task.

## Breaking call

Breaking: yes. Every API route except `POST /login` now requires a token, so existing clients and the currently deployed frontend stop working. SPEC also says Phase 0 must be deployed together with Phase 1. The repository has no CHANGELOG.md.
