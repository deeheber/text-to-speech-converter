# Site-wide password build progress

Branch: build/2026-10-31
Started: 2026-10-31T17:18:59.941Z

## Tasks

- [x] P0-01 Stop logging raw events in CreateNewFile, ListFiles and GetVoices
- [x] P0-02 Stop logging raw events in DeleteFile and give it a test suite
- [x] P0-03 Create the Auth package with the token module
- [x] P0-04 Add the secrets cache and the token authorizer
- [x] P0-05 Add the login handler
- [x] P0-06 Wire secrets, functions, authorizer and throttling into the template, with a template test
- [x] P0-07 Document the password, rotation and deploy order in the README
- [x] P0-08 Phase 0 checkpoint: push and list manual API checks
- [x] P1-01 Add Vitest and the session store
- [x] P1-02 Add the login API client and the Amplify configuration
- [x] P1-03 Add the password form
- [x] P1-04 Add the Lock button and auth-error handling to App, Form and Table
- [x] P1-05 Add the password gate and render it from index.jsx
- [x] P1-06 Note the password prompt in the README's local-dev section
- [x] P1-07 Phase 1 checkpoint: push and list manual frontend checks
- [x] R1-01 Stop no-build-references matching the pipeline's .kukulu/ path in .gitignore
- [x] R1-02 Test verifyToken's part-count, digit-only and safe-integer rejections
- [x] R1-03 Test session.js expiry boundary and numeric expiresAt check
- [x] R1-04 Test App's no-session branch on GET /file and the skipped error path
- [x] R1-05 Test Form's 401/403 on GET /voices and its no-session branch on POST /file
- [ ] R1-06 Test Table's no-session branch on DELETE

## Log

(one entry per task, appended by implement)

### P0-01 — 30c186c

Tests: 'does not log the authorization header' added to CreateNewFile, ListFiles, GetVoices. Replaced first log line with request id/route key line (code in c99a8c8). Test calls mock.restoreAll() first to replace the no-op console mock. Note: verify's no-build-references flags .gitignore ".kukulu/implement.lock" (tooling-added); logged as feedback. Lesson: log feedback AFTER task_done, since it moves HEAD.

### P0-02 — 941df04

Tests: 3 added in src/DeleteFile/test/index.test.js. Added test script, aws-sdk-client-mock ^4.1.0 devDependency, .npmignore. No interpretation choices. no-build-references still fails on .gitignore ".kukulu/implement.lock" (tooling-added, pre-existing).

### P0-03 — 1ced678

Tests: 10 in src/Auth/test/token.test.mjs. Package auth created with @aws-sdk/client-secrets-manager and aws-sdk-client-mock installed. verifyToken compares Buffer (UTF-8 byte) lengths then timingSafeEqual on encoded strings. Exports: signToken, verifyToken, passwordMatches. No interpretation choices.

### P0-04 — c84662b

Tests: 5 in src/Auth/test/authorizer.test.mjs. secrets.mjs exports getSecret, _resetCache, _setNow; CACHE_TTL_MS=300_000; failed fetches not cached. authorizer.mjs handler uses env SIGNING_KEY_SECRET_ARN; logs 'Authorizer invoked' with requestId/routeKey and 'Authorizer failed' err.name. Some tests print the invoke line to stdout (harmless). No interpretation choices.

### P0-05 — 4bb0529

Tests: 8 in src/Auth/test/login.test.mjs. Interpretation: 400 body validation runs before TTL/secret checks; invalid TOKEN_TTL_HOURS -> 500 with log 'Login failed ConfigError'. Env: PASSWORD_SECRET_ARN, SIGNING_KEY_SECRET_ARN, TOKEN_TTL_HOURS (read per request).

### P0-06 — 1280411

Tests: 11 in test/template/template.test.mjs (yaml customTags for Ref/GetAtt/Sub/Join scalar+seq). Interpretation: env var is TOKEN_TTL_HOURS (task/PLAN) not SPEC's TOKEN_TTL_SECONDS. Template: ApiPassword, TokenSigningKey, Login, TokenAuthorizer, TokenAuthorizerInvokePermission, TokenTtlHours param (168), outputs, HttpApi Auth/throttling. sam validate --lint passes. Not deployed.

### P0-07 — f1d122f

README: Site password section, POST /login endpoint, new test commands. Names match template (ApiPasswordSecretArn, TokenSigningKeySecretArn, TokenTtlHours). No tests (docs).

### P0-08 — d1c9da3

Push: done (git push -u origin HEAD). Full verify set green except tooling-added .gitignore line flagged by no-build-references.
Manual check: NOT VERIFIED (human)
- GET /voices without a token -> 401
- GET /voices with Authorization: v1.1.abc -> 403 (note whether access-control-allow-origin is present when sent with Origin: http://localhost:3000)
- POST /login wrong password -> 401; right password -> 200 with a token
- GET /voices with that token -> 200
- OPTIONS preflight -> 204 with CORS headers
- rapid repeated POST /login -> 429
- deploy passes with FailOnWarnings
- after rotating the signing key the old token is rejected within about 10 minutes
- CloudWatch logs for all six Lambdas (CreateNewFile, ListFiles, DeleteFile, GetVoices, Login, TokenAuthorizer) contain no password or token
- Deploying Phase 0 without Phase 1 breaks the deployed frontend.

### P1-01 — 86bfb49

Tests: 4 in src/frontend/test/session.test.js. Installed vitest@^5 (5.0.5, peer vite ^8), jsdom, @testing-library/react, @testing-library/user-event; test script "vitest run"; vite.config.js test.environment jsdom, no globals. session.js: key tts.session, getSession removes bad/expired entries.

### P1-02 — 7bffef0

Tests: api.test.js (3), amplifyConfig.test.js (3). Pattern: vi.hoisted mock fn + vi.mock('aws-amplify' / 'aws-amplify/api'). api.js exports login, isAuthError; amplifyConfig.js exports configureAmplify(config) using config.backendAPI. No interpretation choices.

### P1-03 — a01587c

Tests: 7 in PasswordForm.test.jsx. Interpretation: input cleared at submit start (before request) and stays empty after any result. Notice prop initializes the alert and is cleared on next submit. Codebase note: in vitest, mock Promise.reject lazily via mockImplementation or it raises unhandled rejection errors (exit code stays 0 but reports Errors).

### P1-04 — d1e6cd9

Tests: 7 in App.test.jsx. Interpretation: onLocked is in the useEffect deps of App and Form, so PasswordGate MUST pass a stable (useCallback) lock function or the initial fetches rerun. Auth-error branch returns before existing error UI; other errors unchanged. Lock button calls onLocked() with no args.

### P1-05 — c6c75e2

Tests: 7 in PasswordGate.test.jsx. lock/handleUnlocked are useCallback-stable. index.jsx now calls configureAmplify(config) and renders PasswordGate (not tested; imports gitignored config). `vite build` to a scratch outDir compiled OK (did not run npm run production).

### P1-06 — 3f305c3

README: local-dev step 5 (password prompt, tts.session) and frontend test commands. Docs only.

### P1-07 — 15cb582

Push: done (git push -u origin HEAD).
Manual check: NOT VERIFIED (human)
On both localhost and the CloudFront URL:
- wrong password shows the error and the right one unlocks
- convert, list, download and delete all work
- after a reload you stay unlocked and localStorage holds only tts.session
- Lock clears the table
- setting expiresAt to a past value then reloading shows the prompt
- rotating the signing key returns you to the prompt
- a shared *.mp3 link opens without the password
- the console shows no password or token
- re-run the Phase 0 API checks if they have not been done

### R1-01 — f95380a

Changed no-build-references pattern to (?<!\.)[Kk][uūŪU]kulu; added .kukulu/implement.lock to shouldNotMatch. Verify all green, constraint hits empty.

### R1-02 — 81b34b6

Added test with signed non-canonical tokens; manually confirmed deleting token.mjs lines 17, 20, 22 each fails the test file. Note: Auth tests print "Authorizer invoked undefined undefined" noise.

### R1-03 — 80bf9cb

Added fake-timer boundary test and string expiresAt case; manually confirmed both mutants (>=, removed typeof check) fail session.test.js.

### R1-04 — 1d26886

Added no-session GET /file test (asserts onLocked and no console.error); both mutants (drop getSession check, drop return) confirmed failing App.test.jsx.

### R1-05 — cbeb792

Added two Form tests; all three mutants (drop isAuthError at :33, drop return at :35, drop getSession check at :79) confirmed failing App.test.jsx.
