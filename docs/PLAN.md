# Site-wide password build plan

Derived from docs/SPEC.md v0.1 on 2026-10-31. SPEC.md wins over this file.

## Decisions

- Token lifetime wiring (SPEC 5 "Token" says `TokenTtlHours` is "passed to `Login` as `TOKEN_TTL_SECONDS`") → the template passes `TOKEN_TTL_HOURS: !Ref TokenTtlHours` and `login.mjs` computes `ttlSec = hours * 3600`. CloudFormation has no arithmetic intrinsic, so hours cannot become seconds in the template; the parameter name and its default of 168 are pinned by two SPEC statements (and a template-test assert), the env var name by one table cell, so renaming the env var breaks the least. The template test asserts `TOKEN_TTL_HOURS`. See Spec issues.
- Phase 0 order → the logging fix comes first (P0-01, P0-02), then `src/Auth`, then the template. The `no-raw-event-logging` constraint covers the four existing handlers and `src/Auth/`; doing the fix first lets that rule switch on at P0-02 (`from`) and guard every Auth task.
- `secrets.mjs` has no test file of its own in SPEC 4 → it ships with `authorizer.mjs` (P0-04), whose test file carries the cache-window test SPEC 6 lists. Tests ship with code (principle 10).
- Signature comparison → `verifyToken` compares the UTF-8 bytes of the given `sig` string with the UTF-8 bytes of the expected base64url HMAC string (length check, then `timingSafeEqual`). Decoding base64url is lenient (non-canonical final characters decode to the same bytes), so comparing decoded bytes would accept some tampered signatures.
- `expiresAt` integer check → the part must match `/^[0-9]+$/` and `Number(part)` must be `Number.isSafeInteger`; `"1e10"`, `"+5"`, `"1.0"` and `""` are rejected.
- `POST /login` with `{"password": ""}` → 400 "Password is required". An empty string carries no password; the message fits.
- `POST /login` body with `isBase64Encoded: true` → decode base64 before `JSON.parse`. HTTP API may base64-encode bodies.
- Frontend test location → `src/frontend/test/` (outside `src/frontend/src/`), so principles 5-7 (localStorage only in `session.js`, no credential console output, `./config` imported only by `index.jsx`) hold for test files without exclusions.
- `lock(message?)` notice → `PasswordGate` keeps the message and passes it to `PasswordForm` as a `notice` prop, shown in the same `role="alert"` element as login errors until the next submit.
- `TokenTtlHours` parameter → `Type: Number`, `Default: 168`, `MinValue: 1`.
- Both new functions → also attach the `AWSXrayWriteOnlyAccess` managed policy (they use `Tracing: Active`, like every existing function). "Secret policies match the Functions table exactly" is read as: the only `secretsmanager:*` grant is `secretsmanager:GetSecretValue` on exactly the listed secrets.
- Parallel streams → not used. Every verifiable checkout needs `npm ci` in seven packages, and this 15-task plan has little independent work to gain from it.
- `build` in `docs/kukulu.json` stays empty: SPEC 2 forbids `sam build` and `npm run production`, and `vite build` needs the gitignored `config.js`.

## Conventions

- Commit title `<ID>: <title>`; body per CLAUDE.md's Commit template. Commit messages may name task IDs; code, tests and README may not (principle 11).
- Every task runs the full `verify` set from `docs/kukulu.json`; commands gated with `from` switch on at the task that creates their package.
- Package changes go through `npm install` inside the package so `package-lock.json` is updated in the same commit.
- Task protocols (console capture, dependency install, forbidden commands, phase end) live in CLAUDE.md under `## Task protocols`.

## Phase 0 — API

### P0-01: Stop logging raw events in CreateNewFile, ListFiles and GetVoices

**Goal:** Replace the raw-event `console.log` calls in three handlers with a request-id/route-key log line and prove the `Authorization` header never reaches the console.
**Files touched:** `src/CreateNewFile/index.js`, `src/ListFiles/index.js`, `src/GetVoices/index.js`, `src/CreateNewFile/test/index.test.js`, `src/ListFiles/test/index.test.js`, `src/GetVoices/test/index.test.js`
**Design constraints:**
- SPEC 3 principle 1: no `console.*` call may receive the event variable (`message`), bare, spread, interpolated or via `JSON.stringify`. Replace the first log line of each handler with exactly one single-line call of the form `console.log('<FunctionName> invoked', { requestId: message.requestContext?.requestId, routeKey: message.routeKey });` (`<FunctionName>` is `CreateNewFile`, `ListFiles`, `GetVoices`). Keep it on one line (the `no-raw-event-logging` constraint is line-based).
- SPEC 2 non-goal: change nothing else about conversion, list or voice behavior. Other existing log lines stay as they are.
- SPEC 6 "Logging fix tests": invoke with `headers: { authorization: 'SECRET-TOKEN-123' }` (plus `requestContext: { requestId: 'req-1' }`, `routeKey`, and for CreateNewFile a valid `body` such as `JSON.stringify({ text: 'hello', voice: 'Joanna' })`), AWS SDK mocked with the existing `aws-sdk-client-mock` setup in each file. In CreateNewFile, rely on the existing `beforeEach`/`afterEach` (mocks, `createdIds` and `/tmp` cleanup); do not add a second cleanup path.
- Follow the console-capture protocol in CLAUDE.md.
- Principle 11: no task IDs, `SPEC`, `PLAN.md`, `§` or Kukulu in code or test names.
**Acceptance tests:**
- `src/CreateNewFile/test/index.test.js`: new test `does not log the authorization header`.
- `src/ListFiles/test/index.test.js`: new test `does not log the authorization header`.
- `src/GetVoices/test/index.test.js`: new test `does not log the authorization header`.
- Every existing test in those files still passes.
**Out of scope:** DeleteFile (next task); `src/WebsiteBuildTrigger` (exempt); any change to response shapes or other log lines; README.
**Verification:** `npm test --prefix src/CreateNewFile`, `npm test --prefix src/ListFiles`, `npm test --prefix src/GetVoices`; then the full verify set via `kukulu_verify`. `grep -n "console" src/{CreateNewFile,ListFiles,GetVoices}/index.js` shows no call receiving `message` itself.
**Depends on:** none

### P0-02: Stop logging raw events in DeleteFile and give it a test suite

**Goal:** Fix DeleteFile's raw-event log and add the package's first test script, test directory and mock dependency.
**Files touched:** `src/DeleteFile/index.js`, `src/DeleteFile/package.json`, `src/DeleteFile/package-lock.json`, `src/DeleteFile/test/index.test.js`, `src/DeleteFile/.npmignore`
**Design constraints:**
- SPEC 3 principle 1: replace `console.log(JSON.stringify(message, undefined, 2));` (and its comment) with the single line `console.log('DeleteFile invoked', { requestId: message.requestContext?.requestId, routeKey: message.routeKey });`. Leave the rest of the handler unchanged (SPEC 2 non-goal).
- SPEC 6 "Logging fix tests": `package.json` gains `"scripts": { "test": "node --test" }` and dev dependency `aws-sdk-client-mock` at `^4.1.0` (follow the dependency-install protocol in CLAUDE.md: `npm install --prefix src/DeleteFile --save-dev aws-sdk-client-mock@^4.1.0`). Add `src/DeleteFile/.npmignore` containing `test/`, as the other Lambda packages have.
- The test mocks `DynamoDBDocumentClient` (`GetCommand` resolves `{ Item: { id: 'abc' } }`, `DeleteCommand` resolves `{}`) and `S3Client` (`DeleteObjectCommand` resolves `{}`), invokes with `pathParameters: { id: 'abc' }`, `headers: { authorization: 'SECRET-TOKEN-123' }`, `requestContext: { requestId: 'req-1' }`, `routeKey: 'DELETE /file/{id}'`. Follow the console-capture protocol in CLAUDE.md. Model the file on `src/ListFiles/test/index.test.js` (`node:test`, `node:assert/strict`, ESM).
- Principle 11 applies.
**Acceptance tests:** `src/DeleteFile/test/index.test.js`: `does not log the authorization header`; `deletes the object and the record for an existing id` (asserts the response is `JSON.stringify('Success deleting item')` and one `DeleteObjectCommand` plus one `DeleteCommand` were sent); `returns 404 when the id does not exist` (`GetCommand` resolves `{}`).
**Out of scope:** any behavior change to DeleteFile; other packages; README.
**Verification:** `npm test --prefix src/DeleteFile`; then the full verify set (this task switches on the `npm test --prefix src/DeleteFile` verify entry and the `no-raw-event-logging` constraint).
**Depends on:** none

### P0-03: Create the Auth package with the token module

**Goal:** Create the `src/Auth` ESM package and `token.mjs` with `signToken`, `verifyToken` and `passwordMatches`, fully tested.
**Files touched:** `src/Auth/package.json`, `src/Auth/package-lock.json`, `src/Auth/.npmignore`, `src/Auth/token.mjs`, `src/Auth/test/token.test.mjs`
**Design constraints:**
- SPEC 4: `package.json` has `"name": "auth"`, `"type": "module"`, `"version": "1.0.0"`, `"scripts": { "test": "node --test" }`, dependency `@aws-sdk/client-secrets-manager` (`^3`), dev dependency `aws-sdk-client-mock` (`^4.1.0`). Install both now (dependency-install protocol in CLAUDE.md) so later tasks need no package change. `.npmignore` contains `test/`.
- SPEC 4 / principle 9: `token.mjs` is the one token implementation and is pure: no I/O, no `Date.now`, no environment reads, no logging. Exports exactly `signToken(key, nowSec, ttlSec)` → `{ token, expiresAt }`, `verifyToken(key, token, nowSec)` → boolean, `passwordMatches(expected, given)` → boolean. Use `node:crypto` (`createHmac`, `createHash`, `timingSafeEqual`).
- SPEC 5 "Token": token is `v1.<expiresAt>.<sig>`; `expiresAt = nowSec + ttlSec` (integer Unix seconds; `Math.floor` both inputs' sum); `sig` is unpadded base64url (`digest('base64url')`) of `HMAC-SHA256(key, "v1.<expiresAt>")`.
- `verifyToken` returns false, never throws, when: `token` is not a string (covers `undefined`/missing header); split on `.` is not exactly 3 parts; version is not `v1`; the `expiresAt` part does not match `/^[0-9]+$/` or `Number(part)` is not `Number.isSafeInteger`; `expiresAt <= nowSec`; the given `sig` string's UTF-8 byte length differs from the expected base64url string's; `timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))` is false. Compare the encoded strings' bytes, not decoded bytes (base64url decoding is lenient; see PLAN Decisions).
- Principle 3: `passwordMatches(expected, given)` returns false if either argument is not a string; otherwise compares `sha256(expected)` and `sha256(given)` digests with `timingSafeEqual` (equal 32-byte lengths, so different input lengths never throw). Never use `===`, `!==`, `==` or `!=` on a credential; name variables so the `no-credential-equality` constraint can see them (`expected`, `given`, `sig`, `expectedSig`, `key`). Type checks use `typeof`.
- Principle 11 applies.
**Acceptance tests:** `src/Auth/test/token.test.mjs` (`node:test`, `node:assert/strict`):
- `signToken returns v1.<expiresAt>.<sig> with expiresAt = nowSec + ttlSec`
- `the signature is unpadded base64url HMAC-SHA256 of v1.<expiresAt>` (known-answer check using `createHmac` in the test)
- `verifyToken accepts a fresh token`
- `verifyToken rejects an expired token` (also at exactly `expiresAt === nowSec`)
- `verifyToken rejects a tampered signature`
- `verifyToken rejects a tampered expiresAt`
- `verifyToken rejects a token signed with another key`
- `verifyToken rejects malformed input without throwing` (cases: `undefined`, `null`, `''`, `'garbage'`, `'v1.1'`, `'v1.1.a.b'`, `'v2.<exp>.<sig>'`, `'v1.1e10.<sig>'`, `'v1.-5.<sig>'`, a signature one character shorter)
- `passwordMatches is true only for the same password`
- `passwordMatches handles different lengths and non-strings without throwing`
**Out of scope:** `secrets.mjs`, handlers, template, README.
**Verification:** `npm test --prefix src/Auth`; then the full verify set (this task switches on the `npm test --prefix src/Auth` entry).
**Depends on:** none

### P0-04: Add the secrets cache and the token authorizer

**Goal:** Add `secrets.mjs` (`getSecret` with a 300 s cache) and the `TokenAuthorizer` handler, with tests covering every authorizer case and the cache window.
**Files touched:** `src/Auth/secrets.mjs`, `src/Auth/authorizer.mjs`, `src/Auth/test/authorizer.test.mjs`
**Design constraints:**
- SPEC 4: `secrets.mjs` exports `getSecret(arn)` (async; `GetSecretValueCommand({ SecretId: arn })` on a module-level `SecretsManagerClient` from `@aws-sdk/client-secrets-manager`; returns `SecretString`), `_resetCache()` (empties the cache) and `_setNow(fn)` (replaces the millisecond clock, default `Date.now`; `_setNow()` with no argument restores `Date.now`). Cache per ARN; a cached value is reused while `now() - fetchedAt < 300000` and refetched at or after 300 000 ms. Failed fetches are not cached. The 300 s window is a named module constant (`CACHE_TTL_MS = 300_000`). Check `SecretString`, environment variables and other optional values with `typeof x !== 'string'` (or truthiness), never `=== undefined`: the `no-credential-equality` constraint flags `===`/`!==` next to names containing `secret`, `token`, `key` or `password` (including `SecretString`, `TOKEN_TTL_HOURS`) and skips only lines containing `typeof`.
- SPEC 6 "Authorizer": `authorizer.mjs` exports `handler(event)` returning `{ isAuthorized: verifyToken(key, event.headers?.authorization, nowSec) }` where `key = await getSecret(process.env.SIGNING_KEY_SECRET_ARN)` and `nowSec = Math.floor(Date.now() / 1000)`. Missing header → `{ isAuthorized: false }`. A `getSecret` failure → log `console.error('Authorizer failed', err.name)` and return `{ isAuthorized: false }`. Never throw. Import `verifyToken` from `./token.mjs`; do not re-implement any HMAC or comparison (principle 9).
- Principles 1-2: no `console.*` call receives `event`, and none mentions `authorization`, `headers`, `body`, `password`, `token`, `secret` or `key` (any case, including inside identifiers such as `signingKey`); log errors by `err.name` only. If you log the invocation, use one line: `console.log('Authorizer invoked', event.requestContext?.requestId, event.routeKey);`.
- Tests mock `SecretsManagerClient` with `aws-sdk-client-mock`, call `_resetCache()` in `beforeEach`, build tokens with `signToken` from `../token.mjs`, and follow the console-capture protocol in CLAUDE.md. Set `process.env.SIGNING_KEY_SECRET_ARN` in the test.
- Principle 11 applies.
**Acceptance tests:** `src/Auth/test/authorizer.test.mjs`:
- `authorizes a valid token`
- `rejects expired, tampered, wrong-key, garbage, empty and missing tokens without throwing` (tampered signature and tampered `expiresAt` are separate cases)
- `returns false when Secrets Manager fails`
- `fetches the signing key once within the cache window and again after it` (uses `_setNow`: two calls at t and t+299 999 ms → one `GetSecretValueCommand`; a call at t+300 000 ms → two)
- `never logs the token`
**Out of scope:** `login.mjs`; template; any change to `token.mjs` beyond a bug fix its own tests justify.
**Verification:** `npm test --prefix src/Auth`; then the full verify set.
**Depends on:** P0-03

### P0-05: Add the login handler

**Goal:** Add `login.mjs`, which checks the password against the `ApiPassword` secret and returns a signed token, with tests for every response case.
**Files touched:** `src/Auth/login.mjs`, `src/Auth/test/login.test.mjs`
**Design constraints:**
- SPEC 6 "`POST /login`": body `{"password": "<string>"}`. Responses are `{ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(...) }`, every case including errors:
  - correct → 200 `{ token, expiresAt }`
  - wrong → 401 `{ message: 'Incorrect password' }`
  - missing body, invalid JSON, non-object JSON, `password` missing, not a string, or `''` → 400 `{ message: 'Password is required' }`
  - `getSecret` failure, or `TOKEN_TTL_HOURS` not a positive integer → 500 `{ message: 'Login unavailable' }`, after `console.error('Login failed', err.name)` (for the TTL case log `console.error('Login failed', 'ConfigError')`).
- If `event.isBase64Encoded` is true, decode `event.body` from base64 before `JSON.parse`.
- Environment (PLAN Decisions, token lifetime): `PASSWORD_SECRET_ARN`, `SIGNING_KEY_SECRET_ARN`, `TOKEN_TTL_HOURS`. `ttlSec = Number(process.env.TOKEN_TTL_HOURS) * 3600`, read per request. Do not hard-code 168 or any default lifetime in code.
- Use `getSecret` from `./secrets.mjs` and `passwordMatches`/`signToken` from `./token.mjs` (principles 3, 9); `nowSec = Math.floor(Date.now() / 1000)`. Validate with `typeof password !== 'string' || !password` (type checks only; never `===`/`!==` on a credential). Check `process.env.*` values with `typeof` or truthiness too, never `=== undefined` (the constraint flags `TOKEN_TTL_HOURS === undefined` and `PASSWORD_SECRET_ARN === undefined`).
- Principles 1-2: no `console.*` call receives `event` or mentions `authorization`, `headers`, `body`, `password`, `token`, `secret` or `key` (any case, inside identifiers too). Optional invocation log: `console.log('Login invoked', event.requestContext?.requestId, event.routeKey);`.
- The token is returned as-is; the frontend sends it as the bare `Authorization` header value (no `Bearer ` prefix).
- Tests mock `SecretsManagerClient` (distinct `SecretString` per ARN via `.on(GetSecretValueCommand, { SecretId })`), call `_resetCache()` in `beforeEach`, set the three env vars, and follow the console-capture protocol in CLAUDE.md. Principle 11 applies.
**Acceptance tests:** `src/Auth/test/login.test.mjs`:
- `returns 200 with a token that verifyToken accepts` (also asserts `expiresAt` = now + `TOKEN_TTL_HOURS` × 3600 within one second)
- `returns 401 for a wrong password`
- `returns 400 for missing, non-string or empty passwords and bad JSON`
- `accepts a base64-encoded body`
- `returns 500 when Secrets Manager fails`
- `sets Cache-Control no-store on every response`
- `never logs the password or the token`
**Out of scope:** template, authorizer, README.
**Verification:** `npm test --prefix src/Auth`; then the full verify set.
**Depends on:** P0-03, P0-04

### P0-06: Wire secrets, functions, authorizer and throttling into the template, with a template test

**Goal:** Add the two secrets, `Login` and `TokenAuthorizer` functions, the default authorizer, invoke permission, throttling, `TokenTtlHours` parameter and secret-ARN outputs to `template.yaml`, and a standalone template test asserting them.
**Files touched:** `template.yaml`, `test/template/package.json`, `test/template/package-lock.json`, `test/template/template.test.mjs`
**Design constraints:**
- SPEC 5 "Secrets": add `ApiPassword` and `TokenSigningKey` exactly as SPEC shows (`GenerateSecretString`, no `SecretString`). Outputs `ApiPasswordSecretArn: !Ref ApiPassword` and `TokenSigningKeySecretArn: !Ref TokenSigningKey` (Ref of a secret is its ARN).
- Parameter `TokenTtlHours`: `Type: Number`, `Default: 168`, `MinValue: 1`, with a description.
- SPEC 5 "Functions": `Login` and `TokenAuthorizer`, each `CodeUri: src/Auth`, `Runtime: nodejs24.x`, `Architectures: [arm64]`, `Tracing: Active`, `MemorySize: 256`, `Timeout: 5`, `FunctionName: !Sub ${AWS::StackName}-<Name>` and a `Description` in the existing style. Handlers `login.handler` and `authorizer.handler`. Policies: `AWSXrayWriteOnlyAccess` plus one statement `Effect: Allow`, `Action: secretsmanager:GetSecretValue`, `Resource` = `[!Ref ApiPassword, !Ref TokenSigningKey]` for `Login` and `!Ref TokenSigningKey` (alone) for `TokenAuthorizer`.
- Environment (principle 4, ARNs only): `Login` has exactly `PASSWORD_SECRET_ARN: !Ref ApiPassword`, `SIGNING_KEY_SECRET_ARN: !Ref TokenSigningKey`, `TOKEN_TTL_HOURS: !Ref TokenTtlHours` (PLAN Decisions: CloudFormation cannot multiply, so hours are passed and `login.mjs` converts). `TokenAuthorizer` has exactly `SIGNING_KEY_SECRET_ARN: !Ref TokenSigningKey`.
- `Login` event: `Type: HttpApi`, `Path: /login`, `Method: POST`, `ApiId: !Ref HttpApi`, `PayloadFormatVersion: '2.0'`, `Auth: { Authorizer: NONE }`. Add `/login: post: responses: {}` to the inline `DefinitionBody`.
- SPEC 5 "HTTP API": keep `DefinitionBody`, `FailOnWarnings: true` and `CorsConfiguration` unchanged otherwise; add the `Auth`, `DefaultRouteSettings` and `RouteSettings` blocks exactly as SPEC shows. Add `TokenAuthorizerInvokePermission` (`AWS::Lambda::Permission`, `Action: lambda:InvokeFunction`, `FunctionName: !GetAtt TokenAuthorizer.Arn`, `Principal: apigateway.amazonaws.com`, `SourceArn: !Sub arn:${AWS::Partition}:execute-api:${AWS::Region}:${AWS::AccountId}:${HttpApi}/authorizers/*`).
- Principle 8: `POST /login` is the only route with `Authorizer: NONE`.
- SPEC 4 / 6 "Template test asserts": `test/template/` is a standalone ESM package (`"type": "module"`, `"private": true`, `"scripts": { "test": "node --test" }`, dev dependency `yaml` `^2`; dependency-install protocol). The test reads `new URL('../../template.yaml', import.meta.url)` and parses it with the `yaml` package's `customTags`: `!Ref` → `{ Ref: v }`, `!GetAtt` → `{ 'Fn::GetAtt': v }`, `!Sub` → `{ 'Fn::Sub': v }` in both scalar and sequence form, `!Join` → `{ 'Fn::Join': v }` (sequence). The existing template uses `!Sub` with a sequence (`Description`) and `!Join` with a sequence, so both forms must parse.
- Never run `sam build` or `sam deploy`; `sam validate --lint` is the only SAM command allowed. Principle 11 applies.
**Acceptance tests:** `test/template/template.test.mjs`, one `node:test` test per SPEC 6 assert:
- `secrets use GenerateSecretString and no SecretString`
- `function environments match the functions table` (exact key sets and values, including `TOKEN_TTL_HOURS: { Ref: 'TokenTtlHours' }`)
- `secret policies match the functions table` (the only `secretsmanager:*` grant per function is `GetSecretValue` on exactly the listed secrets)
- `the default authorizer uses simple responses and the Authorization header`
- `only POST /login opts out of the authorizer` (scan every `AWS::Serverless::Function`'s `HttpApi` events)
- `the authorizer invoke permission exists`
- `route settings throttle POST /login`
- `every HttpApi event uses ApiId Ref HttpApi`
- `CORS still allows localhost and the CloudFront domain`
- `the mp3 cache behavior exists`
- `TokenTtlHours defaults to 168`
**Out of scope:** handler code, README, any change to existing resources other than `HttpApi` and `Outputs`/`Parameters` additions.
**Verification:** `sam validate --lint` (must still report a valid template); `npm ci --prefix test/template && npm test --prefix test/template`; then the full verify set (this task switches on the template-test entry).
**Depends on:** none

### P0-07: Document the password, rotation and deploy order in the README

**Goal:** Add the Phase 0 README material: getting and changing the password, signing out all devices, Lock being local, deploy order, the `/login` endpoint and the new test commands.
**Files touched:** `README.md`
**Design constraints:**
- SPEC 8 "Phase 0" README additions, in a new `### Site password` section after "Directions To Run":
  - Get the password: `aws secretsmanager get-secret-value --secret-id <ApiPasswordSecretArn> --query SecretString --output text` (ARN from the stack outputs).
  - Change it: `aws secretsmanager put-secret-value --secret-id <ApiPasswordSecretArn> --secret-string '<new password>'`; existing tokens stay valid until they expire.
  - Sign out all devices: `put-secret-value` on `TokenSigningKey` (`<TokenSigningKeySecretArn>`); takes effect within about 10 minutes.
  - Lock is local: it does not revoke the token.
  - Token lifetime: the `TokenTtlHours` parameter (default 168 hours).
  - Deploy order: deploy the API and frontend changes together; the API change alone breaks the deployed frontend.
- Under "Backend API Endpoints": add `POST /login` (public, throttled) and note that every other route needs the `Authorization` header with a token from `/login`.
- Under "Tests": add `npm ci`/`npm test` lines for `src/DeleteFile`, `src/Auth` and `test/template`.
- Never run the documented `aws` commands. Principle 11: no task IDs, `SPEC`, `PLAN.md`, `§` or Kukulu in the README.
**Acceptance tests:** none (documentation); `no-build-references` constraint passes over `README.md`.
**Out of scope:** the frontend local-dev note (Phase 1); any code.
**Verification:** full verify set; read the rendered section once for accuracy against the template (output names, parameter name).
**Depends on:** none

### P0-08: Phase 0 checkpoint: push and list manual API checks

**Goal:** Push the branch and record the Phase 0 manual checks a human must run after deploying.
**Files touched:** none (the progress log entry only)
**Design constraints:** Follow the phase-end protocol in CLAUDE.md. The manual checks to list, from SPEC 8 "Phase 0": `GET /voices` without a token → 401; with `Authorization: v1.1.abc` → 403 (note whether `access-control-allow-origin` is present when sent with `Origin: http://localhost:3000`); `POST /login` wrong password → 401; right password → 200 with a token; `GET /voices` with that token → 200; OPTIONS preflight → 204 with CORS headers; rapid repeated `POST /login` → 429; deploy passes with `FailOnWarnings`; after rotating the signing key the old token is rejected within about 10 minutes; CloudWatch logs for all six Lambdas (CreateNewFile, ListFiles, DeleteFile, GetVoices, Login, TokenAuthorizer) contain no password or token. Note that deploying Phase 0 without Phase 1 breaks the deployed frontend.
**Acceptance tests:** none; the full verify set passes.
**Out of scope:** deploying or calling AWS (SPEC 2 forbids it); any code change.
**Verification:** `git push -u origin HEAD` succeeds; progress log entry contains `Manual check: NOT VERIFIED (human)` and the list above.
**Depends on:** none

## Phase 1 — Frontend

### P1-01: Add Vitest and the session store

**Goal:** Set up Vitest with jsdom and add `session.js` (`getSession`, `saveSession`, `clearSession`) with its tests.
**Files touched:** `src/frontend/package.json`, `src/frontend/package-lock.json`, `src/frontend/vite.config.js`, `src/frontend/src/session.js`, `src/frontend/test/session.test.js`
**Design constraints:**
- SPEC 7 "Vitest setup": `"test": "vitest run"` script; dev dependencies `vitest` (a version whose `peerDependencies.vite` includes `^8`; check with `npm view vitest peerDependencies`), `jsdom`, `@testing-library/react`, `@testing-library/user-event` (dependency-install protocol in CLAUDE.md: `npm install --prefix src/frontend --save-dev ...`). `vite.config.js` gains `test: { environment: 'jsdom' }`; do not enable `globals` (principle 10; constraint `vitest-no-globals`).
- Frontend tests live in `src/frontend/test/` (PLAN Decisions), import `describe`, `it`, `expect`, `vi` from `vitest`, and never import `src/index.jsx` or `src/config.js` (principle 7; `config.js` is gitignored).
- SPEC 4 / principle 5: `session.js` is the only module that touches `localStorage`, under the key `tts.session` (a module constant). `saveSession({ token, expiresAt })` stores `JSON.stringify({ token, expiresAt })` with only those two fields, whatever else the argument carries. `getSession()` returns `{ token, expiresAt }` or `null`; it returns `null` and removes the entry when the entry is missing, unparsable, lacks a string `token`/numeric `expiresAt`, or `expiresAt <= Math.floor(Date.now() / 1000)`. `clearSession()` removes the entry. No `sessionStorage`, no `document.cookie`, no `console.*` mentioning password, token or session (principle 6).
- `npm run lint --prefix src/frontend` must stay clean, including for `test/`. Principle 11 applies.
**Acceptance tests:** `src/frontend/test/session.test.js`:
- `saves, reads and clears a session`
- `treats an expired session as null and removes it`
- `treats a malformed entry as null and removes it`
- `never writes a password to localStorage` (call `saveSession({ token, expiresAt, password: 'hunter2' })`, assert no `localStorage` value contains `hunter2` and the only key is `tts.session`)
**Out of scope:** `api.js`, Amplify config, components, README.
**Verification:** `npm test --prefix src/frontend`; `npm run lint --prefix src/frontend`; then the full verify set (this task switches on the frontend test entry).
**Depends on:** none

### P1-02: Add the login API client and the Amplify configuration

**Goal:** Add `api.js` (`login`, `isAuthError`) and `amplifyConfig.js` (`configureAmplify`) with tests.
**Files touched:** `src/frontend/src/api.js`, `src/frontend/src/amplifyConfig.js`, `src/frontend/test/api.test.js`, `src/frontend/test/amplifyConfig.test.js`
**Design constraints:**
- SPEC 4: `api.js` exports `login(password)`: `post({ apiName: 'backend', path: '/login', options: { body: { password } } })` from `aws-amplify/api`, awaits `.response`, returns `await response.body.json()` (`{ token, expiresAt }`); errors propagate unchanged. `isAuthError(err)` returns true exactly when `err?.response?.statusCode` is 401 or 403 (Amplify v6 REST errors carry `response.statusCode`).
- SPEC 6 "Frontend": `amplifyConfig.js` exports `configureAmplify(config)`, calling `Amplify.configure` from `aws-amplify` with exactly the two arguments SPEC shows: resource config `{ API: { REST: { backend: { endpoint: config.backendAPI } } } }` and library options whose `API.REST.headers` is an async function returning `{ Authorization: s.token }` when `getSession()` (from `./session.js`) returns a session and `{}` otherwise. The token is the bare header value (no `Bearer `).
- Tests mock `aws-amplify` and `aws-amplify/api` with `vi.mock`; Amplify errors are simulated as `Object.assign(new Error('x'), { response: { statusCode: 401 } })`. Tests live in `src/frontend/test/` and import from `vitest`; they never import `config.js` (principle 7).
- Principles 5-6 apply (no storage outside `session.js`; no console output mentioning password, token or session). Principle 11 applies.
**Acceptance tests:**
- `src/frontend/test/api.test.js`: `login posts the password to /login and returns the token`; `isAuthError is true for 401 and 403`; `isAuthError is false for 500 and network errors` (an `Error` with no `response`).
- `src/frontend/test/amplifyConfig.test.js`: `configures the backend endpoint`; `headers() returns the token when a session exists`; `headers() returns {} without a session`.
**Out of scope:** `index.jsx` (wired in the PasswordGate task); components; README.
**Verification:** `npm test --prefix src/frontend`; `npm run lint --prefix src/frontend`; full verify set.
**Depends on:** P1-01

### P1-03: Add the password form

**Goal:** Add `PasswordForm`, which exchanges the password for a token, saves the session and reports errors.
**Files touched:** `src/frontend/src/components/PasswordForm.jsx`, `src/frontend/src/styles/PasswordForm.css`, `src/frontend/test/PasswordForm.test.jsx`
**Design constraints:**
- SPEC 6 "Frontend": props `onUnlocked()` and `notice` (string, optional). Renders a `<form>` with `<input type="password" autoComplete="current-password">` (with an accessible label "Password") and a submit button labelled "Unlock", disabled while a request is in flight.
- On submit: call `login(password)` from `../api`; then clear the input whatever the result. 200 → `saveSession({ token, expiresAt })` from `../session`, then `onUnlocked()`. Errors (by `err.response?.statusCode`) are shown in one `role="alert"` element: 401 → "Incorrect password."; 429 → "Too many attempts. Wait a minute and try again."; anything else → "Couldn't reach the server. Try again.". The `notice` prop is shown in that same alert element until the next submit (PLAN Decisions).
- Principle 5: the password lives only in this component's state and is cleared after each submit; it is never passed to `onUnlocked`, stored, or logged. Principle 6: no `console.*` mentioning password, token or session.
- Tests mock `aws-amplify/api` (`post`) with `vi.mock`, use `@testing-library/react` and `@testing-library/user-event`, live in `src/frontend/test/`, and import from `vitest`. Principle 11 applies.
**Acceptance tests:** `src/frontend/test/PasswordForm.test.jsx`:
- `saves the session and calls onUnlocked on success`
- `shows the incorrect-password message on 401`
- `shows the too-many-attempts message on 429`
- `shows the connection message on other errors`
- `empties the input after every submit`
- `disables Unlock while the request is in flight`
- `shows the notice prop in the alert`
**Out of scope:** `PasswordGate`, `index.jsx`, `App`/`Form`/`Table` changes, README.
**Verification:** `npm test --prefix src/frontend`; `npm run lint --prefix src/frontend`; full verify set.
**Depends on:** P1-01, P1-02

### P1-04: Add the Lock button and auth-error handling to App, Form and Table

**Goal:** Give `App` an `onLocked` prop and a Lock button, and make every API failure in `App`, `Form` and `Table` call `onLocked` when the session is gone or rejected.
**Files touched:** `src/frontend/src/components/App.jsx`, `src/frontend/src/components/Form.jsx`, `src/frontend/src/components/Table.jsx`, `src/frontend/src/styles/App.css`, `src/frontend/test/App.test.jsx`
**Design constraints:**
- SPEC 6 "Frontend": `App` accepts `onLocked` and passes it to `Form` and `Table`. The `App` header gets a `<button type="button">Lock</button>` that calls `onLocked()` with no message.
- In every API `catch` (App `GET /file`; Form `GET /voices` and `POST /file`; Table `DELETE /file/{id}`): if `isAuthError(err)` (from `../api`) is true **or** `getSession()` (from `../session`) returns `null`, call `onLocked('Your session expired. Enter the password again.')` and skip the existing error UI; otherwise keep today's behavior (existing `console.error(err)`, messages and `alert`). Rationale from SPEC: API Gateway may omit CORS headers on authorizer rejections, so the browser sees a network error instead of 401/403.
- SPEC 2 non-goal: no other behavior change to conversion, list or delete.
- Principles 5-7 apply (no storage outside `session.js`, no console output mentioning password/token/session, no `./config` import). Principle 11 applies.
- Tests mock `aws-amplify/api` (`get`, `post`, `del`) per path, seed or clear the session through `saveSession`/`clearSession`, stub `window.confirm` for delete, live in `src/frontend/test/`, import from `vitest`.
**Acceptance tests:** `src/frontend/test/App.test.jsx`:
- `calls onLocked when GET /file returns 401`
- `calls onLocked when GET /file returns 403`
- `calls onLocked when a request fails and there is no session`
- `does not call onLocked for a network error while the session is valid`
- `calls onLocked when DELETE returns 403`
- `calls onLocked when POST /file returns 401`
- `the Lock button calls onLocked`
**Out of scope:** `PasswordGate`, `index.jsx`, README.
**Verification:** `npm test --prefix src/frontend`; `npm run lint --prefix src/frontend`; full verify set.
**Depends on:** P1-01, P1-02

### P1-05: Add the password gate and render it from index.jsx

**Goal:** Add `PasswordGate` (lock state, `lock(message?)`) and make `index.jsx` call `configureAmplify(config)` and render `<PasswordGate/>`.
**Files touched:** `src/frontend/src/components/PasswordGate.jsx`, `src/frontend/src/index.jsx`, `src/frontend/test/PasswordGate.test.jsx`
**Design constraints:**
- SPEC 6 "Frontend": `PasswordGate` starts unlocked when `getSession()` returns a session; otherwise renders `<PasswordForm onUnlocked={...} notice={notice}/>`. Unlocked, it renders `<App onLocked={lock}/>`. `lock(message?)` calls `clearSession()`, stores `message` (or nothing) as the notice, and returns to the form, which unmounts `App` and its data. A successful unlock clears the notice.
- `index.jsx` (principle 7: the only importer of `./config`): import `config from './config'`, call `configureAmplify(config)` from `./amplifyConfig`, render `<PasswordGate />` instead of `<App tab="home" />`; keep `serviceWorker.unregister()`. Remove the inline `Amplify.configure` call. No test imports `index.jsx` (it imports the gitignored `config.js`).
- Principles 5-6 apply. Principle 11 applies.
- Tests mock `aws-amplify/api` (`get` returns rows for `/file` and voices for `/voices`; `post` resolves a token for `/login` or rejects with `{ response: { statusCode } }`), use Testing Library, live in `src/frontend/test/`, import from `vitest`.
**Acceptance tests:** `src/frontend/test/PasswordGate.test.jsx`:
- `shows the form without a session`
- `shows the app when a valid session exists`
- `unlocks with the correct password`
- `shows the 401 and 429 messages`
- `empties the input after submit`
- `Lock removes the table rows and clears the session` (rows rendered first; after clicking Lock, no row text remains in the DOM and `localStorage` has no `tts.session`)
- `an auth error in the app returns to the form with the expired message`
**Out of scope:** README; changes to `PasswordForm`, `App`, `Form`, `Table` beyond fixes their own tests justify.
**Verification:** `npm test --prefix src/frontend`; `npm run lint --prefix src/frontend`; full verify set. Do not run `npm run production` (it overwrites the local `config.js`).
**Depends on:** P1-02, P1-03, P1-04

### P1-06: Note the password prompt in the README's local-dev section

**Goal:** Tell local developers that the app now asks for the site password and how to get it.
**Files touched:** `README.md`
**Design constraints:** SPEC 8 "Phase 1": in "Running the Frontend Locally against a Deployed Backend", add a step after `npm start`: the app prompts for the site password (see the Site password section for how to read it); the session is kept in `localStorage` under `tts.session` until it expires or you press Lock. Add `npm ci --prefix src/frontend` / `npm test --prefix src/frontend` to the "Tests" section. Principle 11 applies.
**Acceptance tests:** none (documentation).
**Out of scope:** code changes.
**Verification:** full verify set.
**Depends on:** none

### P1-07: Phase 1 checkpoint: push and list manual frontend checks

**Goal:** Push the branch and record the Phase 1 manual checks a human must run on localhost and the CloudFront URL.
**Files touched:** none (the progress log entry only)
**Design constraints:** Follow the phase-end protocol in CLAUDE.md. The manual checks to list, from SPEC 8 "Phase 1", on both localhost and the CloudFront URL: the wrong password shows the error and the right one unlocks; convert, list, download and delete all work; after a reload you stay unlocked and `localStorage` holds only `tts.session`; Lock clears the table; setting `expiresAt` to a past value then reloading shows the prompt; rotating the signing key returns you to the prompt; a shared `*.mp3` link opens without the password; the console shows no password or token. Also re-run the Phase 0 API checks if they have not been done.
**Acceptance tests:** none; the full verify set passes.
**Out of scope:** deploying, `npm run production`, any code change.
**Verification:** `git push -u origin HEAD` succeeds; progress log entry contains `Manual check: NOT VERIFIED (human)` and the list above.
**Depends on:** none

## Spec issues

- SPEC 5 "Token" passes `TokenTtlHours` "to `Login` as `TOKEN_TTL_SECONDS`", but CloudFormation has no arithmetic intrinsic, so the template cannot turn hours into seconds. Resolution: env var `TOKEN_TTL_HOURS`, converted in `login.mjs`; the Functions table's env-var name changes accordingly and the template test asserts the new name. The maintainer may prefer renaming the parameter to seconds instead; that would change the 168 default the template test pins.
- SPEC 4 lists only `token.test.mjs`, `login.test.mjs` and `authorizer.test.mjs` under `src/Auth/test/`; `secrets.mjs`'s cache is covered by the authorizer test's cache-window case rather than a separate file.
- SPEC 7's single-test command `npx --prefix src/frontend vitest run {filter}` runs from the repo root, where Vitest would not find `src/frontend/vite.config.js` (no jsdom). `docs/kukulu.json` adds `--root src/frontend`; a repo-relative path still matches as a substring filter.
- SPEC 3 principle 3 bans `===`/`!==` on credentials; this is only partly mechanical (the `no-credential-equality` constraint keys on variable names). Tasks name the variables; the reviewer checks the rest by reading.
- SPEC 6 does not say what `lock(message)` does with the message; PLAN shows it in `PasswordForm`'s alert element.
- SPEC 5 says Login's policy grants `GetSecretValue` on "both secrets" and the template test checks policies "exactly"; SPEC does not mention the X-Ray policy every existing function has. PLAN adds `AWSXrayWriteOnlyAccess` and the test checks only the secrets grants exactly.
