# text-to-speech-converter

Text-to-speech app: React (Vite) frontend on CloudFront/S3, HTTP API + Node 24 Lambdas, DynamoDB, Polly, deployed with AWS SAM. The site is gated by a shared password exchanged at `POST /login` for an HMAC-signed token.

## Principles

- [ ] No raw event logging in `src/{CreateNewFile,ListFiles,DeleteFile,GetVoices}/index.js` or `src/Auth/*.mjs`: log only `requestContext?.requestId` and `routeKey` (`src/WebsiteBuildTrigger` is exempt).
- [ ] No credentials in logs: under `src/Auth/`, log errors by `err.name` only.
- [ ] Constant-time comparisons: passwords via SHA-256 digests, signatures via `crypto.timingSafeEqual`; never `===`/`!==` on a credential.
- [ ] No secret values in `template.yaml` `Environment` blocks, `config.js` or source; Lambdas get secret ARNs only.
- [ ] Frontend stores only the token (`localStorage` key `tts.session`, via `src/frontend/src/session.js`); the password lives only in `PasswordForm` state and is cleared after each submit.
- [ ] One public route: `POST /login`. One token implementation: `src/Auth/token.mjs`.
- [ ] Tests ship in the same commit as the code they cover.
- [ ] Change nothing about conversion, list or delete behavior beyond logging.
- [ ] Never deploy: no `sam deploy`, `sam build`, `npm run production` (it overwrites the local `config.js`) or AWS CLI command.

## Commands

Run from the repo root.

| Purpose | Command |
|---|---|
| Template lint | `sam validate --lint` |
| Template test | `npm ci --prefix test/template && npm test --prefix test/template` |
| Frontend lint | `npm run lint --prefix src/frontend` |
| Frontend test | `npm test --prefix src/frontend` (Vitest) |
| Lambda tests | `npm test --prefix src/<pkg>` for `CreateNewFile`, `ListFiles`, `GetVoices`, `WebsiteBuildTrigger`, `DeleteFile`, `Auth` |
| One Node test file | `node --test <repo-relative path>` |
| One frontend test file | `npx --prefix src/frontend vitest run --root src/frontend <path>` |
| Fresh-checkout setup | `npm ci` in `src/frontend` and each Lambda package (and `test/template`) |

## Module map

| Path | Responsibility |
|---|---|
| `template.yaml` | All infrastructure: secrets `ApiPassword`/`TokenSigningKey`, functions, `HttpApi` (inline `DefinitionBody`, default `TokenAuthorizer`, throttling), `TokenTtlHours` parameter, outputs |
| `src/Auth/token.mjs` | Pure: `signToken(key, nowSec, ttlSec)`, `verifyToken(key, token, nowSec)`, `passwordMatches(expected, given)` |
| `src/Auth/secrets.mjs` | `getSecret(arn)` with a 300 s in-memory cache; `_resetCache()`, `_setNow(fn)` test hooks |
| `src/Auth/login.mjs` | `POST /login` handler (`Login` function) |
| `src/Auth/authorizer.mjs` | HTTP API simple-response Lambda authorizer (`TokenAuthorizer` function) |
| `src/Auth/test/` | `token.test.mjs`, `login.test.mjs`, `authorizer.test.mjs` |
| `test/template/` | Standalone package parsing `template.yaml` (custom tags for `!Ref`/`!Sub`/`!GetAtt`/`!Join`) and asserting its security shape |
| `src/{CreateNewFile,ListFiles,DeleteFile,GetVoices}/` | Existing API handlers (each its own ESM package with `node --test` tests) |
| `src/WebsiteBuildTrigger/` | CloudFormation custom resource that builds and publishes the frontend |
| `src/frontend/src/session.js` | `getSession()`, `saveSession({token, expiresAt})`, `clearSession()` |
| `src/frontend/src/api.js` | `login(password)`, `isAuthError(err)` |
| `src/frontend/src/amplifyConfig.js` | `configureAmplify(config)`: endpoint plus `Authorization` header from the session |
| `src/frontend/src/components/` | `PasswordGate`, `PasswordForm`, `App` (Lock button), `Form`, `Table` |
| `src/frontend/src/index.jsx` | Only importer of `./config` (gitignored); calls `configureAmplify`, renders `<PasswordGate/>` |
| `src/frontend/test/` | Vitest tests (jsdom); never import `index.jsx` or `config.js` |

## Constraints

Rules marked (data) are also entries in `docs/kukulu.json` `constraints` and are checked by verify.

- (data `no-raw-event-logging`) No `console.*` call in the four handler `index.js` files or `src/Auth/` (excluding `src/Auth/test/`) receives `message`/`event` bare, spread, interpolated or via `JSON.stringify`. Multi-line `console.*` calls: reviewer checks by reading.
- (data `no-credential-logging`) No `console.*` line under `src/Auth/` (excluding tests) mentions `authorization`, `headers`, `body`, `password`, `token`, `secret` or `key`, in any case, even inside an identifier (`signingKey`); `routeKey` is allowed.
- (data `no-credential-equality`) No `===`/`!==`/`==`/`!=` next to a credential-named identifier under `src/Auth/`. Credentials held under other names: reviewer checks by reading.
- (data `no-secret-string-in-template`) `template.yaml` has no `SecretString:` key.
- Function `Environment` blocks hold only secret ARNs and the TTL: enforced by the template test; reviewer checks by reading.
- (data `local-storage-only-in-session`) `localStorage` appears under `src/frontend/src/` only in `session.js`.
- (data `no-session-storage-or-cookies`) No `sessionStorage` or `document.cookie` under `src/frontend/src/`.
- (data `no-frontend-credential-console`) No `console.*` line under `src/frontend/src/` mentions password, token or session.
- (data `config-import-only-in-index`) Only `src/frontend/src/index.jsx` imports `./config`.
- `HttpApi` has `Auth.DefaultAuthorizer`, and the only `Authorizer: NONE` is `POST /login`: enforced by the template test (structural, not a line pattern).
- (data `single-token-implementation`) `createHmac` and `timingSafeEqual` appear only in `src/Auth/token.mjs` (tests excepted).
- (data `no-jwt-libraries`) No JWT library (`jsonwebtoken`, `jose`, `jwt-decode`, ...) anywhere under `src/` or `test/`.
- (data `vitest-no-globals`) `src/frontend/vite.config.js` never sets `globals: true`; frontend tests import `describe/it/expect/vi` from `vitest`.
- (data `no-build-references`) Outside `docs/`, `.kukulu/` and `CLAUDE.md`: no task IDs (`P0-01` style), `SPEC`, `PLAN.md`, `§` or Kukulu.

## Task protocols

**Console capture (no-leak tests).** In `node:test` files, inside the test: `const lines = []; for (const m of ['log', 'info', 'warn', 'error', 'debug']) mock.method(console, m, (...args) => { lines.push(args.map((a) => (typeof a === 'string' ? a : util.inspect(a, { depth: null }))).join(' ')); });` (import `util` from `node:util`), run the handler, then `assert.ok(lines.every((l) => !l.includes(SECRET)))` for each secret value (header value, password, issued token). `mock.restoreAll()` in `afterEach` undoes it. In Vitest, use `vi.spyOn(console, m).mockImplementation(...)` the same way.

**Dependency install.** Change a package's dependencies only with `npm install --prefix <pkg dir> [--save-dev] <name>@<range>`, then commit both `package.json` and `package-lock.json`. Never commit `node_modules/`. A new package gets its lockfile from the first `npm install`.

**Forbidden commands.** Never run `sam deploy`, `sam build`, `sam sync`, `npm run production`, or any `aws` CLI command. `sam validate --lint` is allowed.

**Phase end.** Run the full verify set, then `git push -u origin HEAD`. Append to the progress log `Manual check: NOT VERIFIED (human)` followed by the task's list of checks, verbatim. Do not attempt the checks; do not deploy.

## Commit template

```
<ID>: <title>

Goal: <one sentence>
Tests: <test files and names added or changed>
Interpretation: <any reading of SPEC/PLAN you had to choose, or "none">
Manual check: <"NOT VERIFIED (human)" plus the list, for phase-end tasks; otherwise "n/a">
```

SPEC.md wins over PLAN.md, which wins over code comments.
