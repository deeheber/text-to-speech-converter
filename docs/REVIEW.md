# Review: site-wide password (build/2026-10-31)
Round: 1

**Verdict: CHANGES REQUESTED**

Base `fb69d1e`, head `192ee74`, 15 of 15 tasks done, none blocked or skipped. PR checks: `pass`.

I read every task commit against PLAN.md and the SPEC sections it cites, and ran `kukulu_verify` myself. All verify commands pass (sam lint, frontend lint, the six Lambda suites, the template test, Vitest: 31 tests). 11 of 12 constraints pass. `no-build-references` fails on one line. I ran 33 mutants through `kukulu_mutate` with the targeted `node`/`vitest` commands, covering every source module. 13 survived (their test command exited 0).

Note on mutation results: every survivor below was reported by the tool as `killed: constraint no-build-references caught the mutation`, because that constraint fails on every run (finding 1). A survivor here means the targeted test command exited 0. I read every result's exit code instead of trusting the verdict string.

## Findings

### 1. [Category 1: constraint] `no-build-references` fails on `.gitignore:12`
- `.gitignore:12` holds `.kukulu/implement.lock`. The pipeline's `chore: start implementation run` commit (`4318c2f`) added it; no task did. The rule's `[Kk][uūŪU]kulu` alternative matches it.
- What breaks: `kukulu_verify` returns `ok: false` on every task and every round. Every `kukulu_mutate` call reports "killed" whatever the tests did, so a reviewer who trusts the verdict string misses every survivor. That happened 13 times in this review.
- Minimal fix: in `docs/kukulu.json`, keep `no-build-references` from matching a path reference to the tool's own directory. For example, change `[Kk][uūŪU]kulu` to `(?<!\.)[Kk][uūŪU]kulu`; the existing `shouldMatch` fixtures (`// built by Kūkulu`, `# kukulu flight`) have a space before the word and still match. Add `.kukulu/implement.lock` to `shouldNotMatch`. Do not edit `.gitignore`; the pipeline owns that line.
- Task: R1-01.

### 2. [Category 3: tests] `src/Auth/token.mjs`: three SPEC 5 rejection rules are untested
SPEC 5 "Token" requires `verifyToken` to return false when there are "not exactly 3 parts" and when "`expiresAt` isn't an integer". Each of these guards can be deleted without any test failing:
- `token.mjs:17` `if (parts.length !== 3) return false;`: survived. `<valid token>.extra` would then verify as true. Every 2-part or 4-part case in the test also fails the expiry or HMAC check, so none of them isolates this guard.
- `token.mjs:20` `if (!/^[0-9]+$/.test(expPart)) return false;`: survived. The `v1.1e10.<sig>` case reuses a signature made for a different payload, so the HMAC check rejects it whether or not the regex runs.
- `token.mjs:22` `if (!Number.isSafeInteger(expiresAt)) return false;`: survived. No case uses an integer beyond 2^53.
- Killed: the `<=` boundary at line 23, and the version check at line 19.
- Fix: in `token.test.mjs`, add cases that pass every other check, so that only the guard under test can reject them. Sign the non-canonical payload in the test with `createHmac('sha256', KEY).update(payload).digest('base64url')`:
  - a valid future token plus `.extra`
  - `v1.1e10`, ` <exp>` with a leading space, and `+<exp>`, each signed this way
  - `v1.99999999999999999999`, signed the same way
- Task: R1-02 (PLAN P0-03).

### 3. [Category 3: tests] `src/frontend/src/session.js`: the expiry boundary and the numeric-type check are untested
- `session.js:12` `>` changed to `>=`: survived. The expired case uses `now - 1`, so no test hits `expiresAt === now`. PLAN P1-01 says "`expiresAt <= Math.floor(Date.now() / 1000)`" reads as null.
- `session.js:11` `typeof parsed.expiresAt === 'number' &&` deleted: survived. The `'soon'` fixture compares as NaN and fails anyway. A numeric string such as `'9999999999'` would be coerced and returned as a live session.
- Killed: dropping `removeItem` in `getSession`, and storing the whole argument in `saveSession`.
- Fix: add a test that fixes the clock with `vi.useFakeTimers()`/`vi.setSystemTime()` and saves `expiresAt` equal to now, expecting null with the entry removed. Add `{ token: 'abc', expiresAt: '9999999999' }` to the malformed-entry fixtures.
- Task: R1-03 (PLAN P1-01).

### 4. [Category 3: tests] `src/frontend/src/components/App.jsx`: the `getSession() === null` branch on `GET /file` is untested
- `App.jsx:50`: replacing `isAuthError(err) || getSession() === null` with `isAuthError(err)` survived. SPEC 8 Phase 1 asks for an **App** test where "a failure while `getSession()` is `null`" calls `onLocked`. The existing test (`calls onLocked when a request fails and there is no session`) fails `/voices`, which goes through Form's catch, and lets `/file` succeed.
- `App.jsx:52`: deleting `return;` after `onLocked(...)` survived, so nothing checks that the existing error path (`console.error`, `setIsLoading(false)`) is skipped. PLAN P1-04 says to skip it.
- Killed: dropping `isAuthError`, and passing an argument to the Lock button's `onLocked()`.
- Fix: add an App test where the session is cleared and `GET /file` fails with a network error while `/voices` succeeds. Assert that `onLocked` was called with the expired message and that `console.error` was not called.
- Task: R1-04 (PLAN P1-04).

### 5. [Category 3: tests] `src/frontend/src/components/Form.jsx`: two of the four auth branches, and the skip of the existing error path, are untested
SPEC 6 says to call `onLocked` from Form's failed API calls when `isAuthError(err)` **or** `getSession()` is null.
- `Form.jsx:33` (GET /voices): dropping `isAuthError(err)` survived. No test makes `/voices` return 401/403.
- `Form.jsx:79` (POST /file): dropping `getSession() === null` survived. No test fails POST /file while there is no session.
- `Form.jsx:35`: deleting `return;` after `onLocked(...)` in the `/voices` catch survived.
- Killed: dropping `isAuthError` in the POST catch.
- Fix: in `App.test.jsx`:
  - `/voices` returns 403 with a valid session → `onLocked(EXPIRED)`.
  - POST /file fails with a network error after the session is cleared → `onLocked(EXPIRED)`, and the "An error occurred" message is not rendered.
  - Assert that `console.error` was not called in the `/voices` auth case.
- Task: R1-05 (PLAN P1-04).

### 6. [Category 3: tests] `src/frontend/src/components/Table.jsx`: the `getSession() === null` branch on DELETE is untested
- `Table.jsx:18`: replacing `isAuthError(err) || getSession() === null` with `isAuthError(err)` survived (SPEC 6).
- Killed: dropping `isAuthError`, deleting `return;` (the `alert` assertion catches it), and changing the message.
- Fix: add a test where DELETE fails with a network error after the session is cleared. Assert `onLocked(EXPIRED)` and that `window.alert` was not called.
- Task: R1-06 (PLAN P1-04).

## Other categories checked (no findings)
- **Constraints read by hand:** Multi-line `console.*` calls in `src/GetVoices/index.js:18` and `src/DeleteFile/index.js:48` log only `err.message`. I found no credential compared with `===` under another name: `token.mjs` uses `timingSafeEqual` on both the signature and the SHA-256 digests. `Environment` blocks hold only ARNs and the TTL. The only `Authorizer: NONE` is `POST /login`.
- **Boundaries:** The only `.gitignore` edit came from the pipeline (finding 1). `.npmignore` files and the CSS were named in their tasks. No config values are hard-coded outside config. `index.jsx` is the only importer of `./config`.
- **Mutants killed:**
  - `token.mjs`: the expiry boundary and the version check.
  - `secrets.mjs`: the cache window `<` changed to `<=`.
  - `authorizer.mjs`: the fail-open catch.
  - `login.mjs`: the TTL multiplier, and bypassing `passwordMatches`.
  - All four handlers: putting `message.headers` into the first log line.
  - `template.yaml`: `EnableSimpleResponses: false`.
  - `api.js`: `isAuthError` widened.
  - `amplifyConfig.js`: a `Bearer` prefix added.
  - `PasswordForm.jsx`: the input-clear removed.
  - `PasswordGate.jsx`: `clearSession` removed from `lock`.
- **Performance:** SPEC says nothing about it.
- **Interpretation choices (HANDOFF):**
  - P0-05: validating the body before checking the TTL is fine.
  - P1-03: clearing the input before calling `login` is fine, because the value is copied first and the input is empty after every outcome.
  - P1-04: putting `onLocked` in the effect deps is fine, because `PasswordGate` passes a `useCallback`.
  - P1-05: the scratch `vite build` is fine.
  - P0-06 (`TOKEN_TTL_HOURS`): see Spec issues.
- **Blocked/skipped tasks:** none.

## Spec issues
- **SPEC 5 `TOKEN_TTL_SECONDS` vs `TOKEN_TTL_HOURS`.** SPEC says the `TokenTtlHours` parameter (default 168) is passed to `Login` as `TOKEN_TTL_SECONDS`. CloudFormation has no arithmetic intrinsic, so the template cannot convert hours to seconds. PLAN chose `TOKEN_TTL_HOURS`, converted in `login.mjs` (hours × 3600), and the template test asserts that name. This is the most workable reading, so it is not a finding. The maintainer should either update the SPEC Functions table or rename the parameter to seconds.
- **SPEC 3 principle 11 and the tool's own lock path.** Read literally, principle 11 forbids the `.kukulu/implement.lock` line the pipeline writes into `.gitignore`. SPEC should exempt path references to `.kukulu/` (or `.gitignore` entries for it). R1-01 makes the mechanical rule match that intent.

## Manual checks still owed (from HANDOFF.md, NOT VERIFIED)
Phase 0 (after deploying, API):
- `GET /voices` without a token → 401.
- `GET /voices` with `Authorization: v1.1.abc` → 403. Note whether `access-control-allow-origin` is present when sent with `Origin: http://localhost:3000`.
- `POST /login` with the wrong password → 401; with the right one → 200 with a token.
- `GET /voices` with that token → 200.
- OPTIONS preflight → 204 with CORS headers.
- Rapid repeated `POST /login` → 429.
- The deploy passes with `FailOnWarnings`.
- After rotating the signing key, the old token is rejected within about 10 minutes.
- CloudWatch logs for all six Lambdas contain no password or token.
- Deploying Phase 0 without Phase 1 breaks the deployed frontend.

Phase 1 (on localhost and the CloudFront URL):
- The wrong password shows the error; the right one unlocks.
- Convert, list, download and delete all work.
- After a reload you stay unlocked, and `localStorage` holds only `tts.session`.
- Lock clears the table.
- Setting `expiresAt` to a past value, then reloading, shows the prompt.
- Rotating the key returns you to the prompt.
- A shared `*.mp3` link opens without the password.
- The console shows no password or token.

## Notes
- `src/GetVoices/index.js:4` still has the comment "Log the event argument for debugging and for use in local development." above a line that no longer logs the event. The comment is stale.
- When the Auth tests run, `authorizer.test.mjs` prints `Authorizer invoked undefined undefined` to stdout eight times, from tests that do not mock `console.log`. This is harmless noise.
- In `secrets.mjs`, nothing tests that a failed fetch is not cached. That holds structurally, because the cache is written after the `await`.
