# Review: site-wide password (build/2026-10-31)
Round: 2

**Verdict: APPROVED**

Base `fb69d1e`, head `3082d31`. All 21 tasks are done (P0-01 to P0-08, P1-01 to P1-07, R1-01 to R1-06), and none are blocked or skipped. PR checks: `kukulu_status` reported `prChecks` as `pending` with no failing checks. That is not a finding. In round 1 they were `pass`.

Round 1 reviewed the whole branch. This round I checked the six fix tasks against their PLAN entries and against SPEC 5, 6 and 8. I also re-ran the full verify set and constraint scan over the whole repo. `git diff --name-only 689aa69..HEAD` lists only these files:
- `src/Auth/test/token.test.mjs`
- `src/frontend/test/App.test.jsx`
- `src/frontend/test/session.test.js`
- `docs/kukulu.json`
- pipeline-owned docs and state (`docs/HANDOFF.md`, `docs/PROGRESS.md`, `.kukulu/state.json`)

The round changed no source files.

## Findings

None.

## Categories checked

### 1. Constraints
- I ran `kukulu_verify` myself, and all 12 constraints are `ok`. Every rule has `fixture: null` and `hits: []`, including `no-build-references`, which failed in round 1.
- R1-01 changed only the `no-build-references` pattern, to `(?<!\.)[Kk][uūŪU]kulu`, and added `.kukulu/implement.lock` to `shouldNotMatch`. It did not touch `.gitignore`.
- I checked the fixtures with `node`:
  - The old pattern matches `.kukulu/implement.lock` and the new one does not, so the new fixture tells them apart.
  - Every existing `shouldMatch` entry still matches, including `// built by Kūkulu` and `# kukulu flight`.
- I read the new test code by hand:
  - It contains no task IDs, `SPEC` or `PLAN.md` in test names (principle 11).
  - The frontend tests import `describe/it/expect/vi` (plus `afterEach`) from `vitest` (principle 10).
  - `localStorage` appears only under `test/`, which is outside the constraint's scope.

### 2. Boundaries
No source files changed, and the round edited no `.gitignore`, `.gitattributes`, editor or CI config. Each commit stayed within its task's **Files touched**.

### 3. Tests
All verify commands pass:
- `sam validate --lint`
- frontend lint
- the six Lambda suites (Auth now has 24 tests)
- the template test (11 tests)
- Vitest (36 tests in 6 files)

I mutated every mechanic the fix round targeted with `kukulu_mutate`, using the targeted `node`/`vitest` commands and `confirmKill: true`. Every mutant was killed. Every confirm re-run on the unmutated tree passed. Every failure tail named the test the task added:

| File:line | Mutant | Caught by |
|---|---|---|
| `src/Auth/token.mjs:17` | delete `parts.length !== 3` guard | `verifyToken rejects correctly signed but non-canonical tokens` (`<token>.extra`) |
| `src/Auth/token.mjs:20` | delete digit-only regex | same test (`v1.1e10`) |
| `src/Auth/token.mjs:22` | delete `Number.isSafeInteger` | same test (`v1.99999999999999999999`) |
| `src/frontend/src/session.js:12` | `>` to `>=` | `treats a session expiring exactly now as expired` |
| `src/frontend/src/session.js:11` | delete `typeof expiresAt === 'number'` | `treats a malformed entry as null and removes it` (`'9999999999'`) |
| `src/frontend/src/components/App.jsx:50` | drop `getSession() === null` | `calls onLocked when GET /file fails and there is no session` |
| `src/frontend/src/components/App.jsx:52` | delete `return;` | same test (`console.error` not called) |
| `src/frontend/src/components/Form.jsx:33` | drop `isAuthError(err)` on GET /voices | `calls onLocked when GET /voices returns 403` |
| `src/frontend/src/components/Form.jsx:35` | delete `return;` on GET /voices | same test (`console.error` not called) |
| `src/frontend/src/components/Form.jsx:79` | drop `getSession() === null` on POST /file | `calls onLocked when POST /file fails and there is no session` |
| `src/frontend/src/components/Form.jsx:81` | delete `return;` on POST /file | same test ("An error occurred" not rendered) |
| `src/frontend/src/components/Table.jsx:18` | drop `getSession() === null` on DELETE | `calls onLocked when DELETE fails and there is no session` |

The new token cases sign each non-canonical payload with the real HMAC, so only the structural guard under test can reject it. The session boundary test fixes the clock with `vi.useFakeTimers()`/`vi.setSystemTime()` and restores real timers in `afterEach`.

### 4. Performance
SPEC says nothing about performance.

### 5. Spec drift
None. The fix round changed only tests and the constraint rule.

### 6. Interpretation choices
HANDOFF lists none for round 1. The round-0 choices were accepted in round 1 and are unchanged.

### 7. Blocked and skipped tasks
None.

## Spec issues
These carry forward from round 1. They are not resolved, and they are not findings.

- **SPEC 5 `TOKEN_TTL_SECONDS` vs `TOKEN_TTL_HOURS`.**
  - SPEC says the `TokenTtlHours` parameter (default 168) is passed to `Login` as `TOKEN_TTL_SECONDS`.
  - CloudFormation has no arithmetic intrinsic, so the template cannot convert hours to seconds.
  - PLAN chose `TOKEN_TTL_HOURS`, which `login.mjs` converts (hours × 3600), and the template test asserts that name. This is the most workable reading.
  - The maintainer should either update the SPEC Functions table or rename the parameter to seconds.
- **SPEC 3 principle 11 and the tool's own lock path.**
  - Read literally, principle 11 forbids the `.kukulu/implement.lock` line that the pipeline writes into `.gitignore`.
  - R1-01 made the mechanical rule skip `.kukulu/` path references.
  - SPEC should state that exemption explicitly.

## Manual checks still owed (from HANDOFF.md, NOT VERIFIED)
Phase 0 (after deploying, API):
- `GET /voices` without a token → 401.
- `GET /voices` with `Authorization: v1.1.abc` → 403. Note whether `access-control-allow-origin` is present when sent with `Origin: http://localhost:3000`.
- `POST /login` with the wrong password → 401. With the right one → 200 with a token.
- `GET /voices` with that token → 200.
- OPTIONS preflight → 204 with CORS headers.
- Rapid repeated `POST /login` → 429.
- The deploy passes with `FailOnWarnings`.
- After rotating the signing key, the old token is rejected within about 10 minutes.
- CloudWatch logs for all six Lambdas (CreateNewFile, ListFiles, DeleteFile, GetVoices, Login, TokenAuthorizer) contain no password or token.
- Deploying Phase 0 without Phase 1 breaks the deployed frontend.

Phase 1 (on localhost and the CloudFront URL):
- The wrong password shows the error, and the right one unlocks.
- Convert, list, download and delete all work.
- After a reload you stay unlocked, and `localStorage` holds only `tts.session`.
- Lock clears the table.
- Setting `expiresAt` to a past value, then reloading, shows the prompt.
- Rotating the key returns you to the prompt.
- A shared `*.mp3` link opens without the password.
- The console shows no password or token.

## Notes
- **`docs/kukulu.json` mutant.**
  - Reverting the `no-build-references` pattern through `kukulu_mutate` reported `survived` with constraints `ok`. The tool's constraint self-test does not appear to reload a mutated config.
  - I confirmed by hand with `node` that the `.kukulu/implement.lock` `shouldNotMatch` fixture fails against the old pattern. The rule's own self-test therefore guards the fix.
  - I logged this as pipeline friction. It is not a task.
- **Lookbehind blind spot.** `(?<!\.)` also exempts any word "kukulu" that directly follows a dot. Outside a path this is unlikely, so it is acceptable.
- **Stale comment.** `src/GetVoices/index.js:4` still says "Log the event argument for debugging and for use in local development." above a line that no longer logs the event.
- **Stdout noise.** `src/Auth/test/authorizer.test.mjs` prints `Authorizer invoked undefined undefined` to stdout eight times, from tests that do not mock `console.log`. This is harmless.
- **Uncached failures.** In `src/Auth/secrets.mjs`, no test checks that a failed fetch is not cached. That holds structurally, because the cache is written after the `await`.
