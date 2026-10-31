# Site-wide password — Specification

Version: 0.1 Status: ready
Issue: https://github.com/deeheber/text-to-speech-converter/issues/71

## 1. Overview

`POST /login` checks a shared password and returns an expiring HMAC-signed token. An HTTP API Lambda authorizer requires a valid token on every other route. The React app exchanges the password for a token and stores only the token. Done: unauthorized requests are rejected, the app works end to end, and no password or token is logged.

## 2. Goals and non-goals

Goals: the secrets, `Login` and `TokenAuthorizer` functions, throttling, the frontend password gate, the Lambda logging fix, README updates.

Non-goals (do not build):
- Cognito, accounts, per-user data
- Private or signed audio URLs (the `*.mp3` behavior stays public)
- HttpOnly cookies, routing the API through CloudFront, protecting the static page
- JWT libraries, token refresh, secret-rotation Lambdas
- Removing Amplify or replacing `config.js`
- Changes to conversion, list or delete behavior beyond logging
- Deploying: never run `sam deploy`, `sam build`, `npm run production` (it overwrites the local `config.js`) or any AWS CLI command

## 3. Engineering principles

1. **No raw event logging.** In `src/{CreateNewFile,ListFiles,DeleteFile,GetVoices}/index.js` and `src/Auth/*.mjs`, no `console.*` call receives the event variable (`message`/`event`), bare or via `JSON.stringify`. Log only `requestContext?.requestId` and `routeKey`. `src/WebsiteBuildTrigger` is exempt.
2. **No logging of credentials.** Under `src/Auth/`, no `console.*` call references `authorization`, `headers`, `body`, `password`, `token`, `secret` or `key`. Log errors by `err.name`.
3. **Constant-time comparisons.** Compare passwords via SHA-256 digests and signatures as HMAC buffers, both with `crypto.timingSafeEqual`. Never use `===` or `!==` on a credential.
4. **No secret values** in template `Environment` blocks, `config.js` or source. Lambdas get secret ARNs only.
5. **Frontend storage.** `localStorage` is used only in `src/frontend/src/session.js`, key `tts.session`. No `sessionStorage` or `document.cookie`. The password lives only in `PasswordForm` state and is cleared after each submit.
6. **No console output** under `src/frontend/src/` references `password`, `token` or `session`.
7. **Config import.** Only `src/frontend/src/index.jsx` imports `./config` (it's gitignored, so tests can't depend on it).
8. **One public route.** `HttpApi` has `Auth.DefaultAuthorizer`; the only `Authorizer: NONE` is `POST /login`. Enforced by the template test.
9. **One token implementation:** `src/Auth/token.mjs`.
10. **Tests ship in the same task as their code.** Frontend tests import `describe/it/expect/vi` from `vitest`.
11. **No build references in code.** Outside `docs/`, `.kukulu/` and `CLAUDE.md`: no task IDs (`/\bP\d+-\d{2}\b/`), no `SPEC`, `PLAN.md` or `§`, no `Kūkulu`/`kukulu`.

## 4. Architecture

| Path | Responsibility |
|---|---|
| `template.yaml` | Secrets, two functions, `HttpApi.Auth`, invoke permission, throttling, `TokenTtlHours` parameter, outputs |
| `src/Auth/` | ESM package (`"test": "node --test"`; dependency `@aws-sdk/client-secrets-manager`, dev dependency `aws-sdk-client-mock`) shared by both functions |
| `src/Auth/token.mjs` | Pure functions: `signToken(key, nowSec, ttlSec)` → `{token, expiresAt}`, `verifyToken(key, token, nowSec)` → bool, `passwordMatches(expected, given)` → bool |
| `src/Auth/secrets.mjs` | `getSecret(arn)` with a 300 s in-memory cache; `_resetCache()` and `_setNow(fn)` test hooks |
| `src/Auth/login.mjs`, `authorizer.mjs` | Handlers |
| `src/Auth/test/` | `token.test.mjs`, `login.test.mjs`, `authorizer.test.mjs` |
| `test/template/` | Standalone package (`yaml` dev dependency, `node --test`) parsing `template.yaml` with custom tags for `!Ref`/`!Sub`/`!GetAtt`/`!Join` |
| `src/{CreateNewFile,ListFiles,DeleteFile,GetVoices}/index.js` | Logging fix only |
| `src/frontend/src/session.js` | `getSession()` (returns `null` and clears the entry if expired), `saveSession({token, expiresAt})`, `clearSession()` |
| `src/frontend/src/api.js` | `login(password)`; `isAuthError(err)` is true when `err.response?.statusCode` is 401 or 403 |
| `src/frontend/src/amplifyConfig.js` | `configureAmplify(config)` |
| `src/frontend/src/components/PasswordGate.jsx`, `PasswordForm.jsx` | Lock state, password form |
| `src/frontend/src/components/{App,Form,Table}.jsx` | Lock button; auth-error handling |
| `src/frontend/src/index.jsx` | Calls `configureAmplify(config)`, renders `<PasswordGate/>` |

## 5. Data and configuration

### Secrets

    ApiPassword:
      Type: AWS::SecretsManager::Secret
      Properties:
        Name: !Sub ${AWS::StackName}-api-password
        GenerateSecretString: { PasswordLength: 32, ExcludePunctuation: true }
    TokenSigningKey:
      Type: AWS::SecretsManager::Secret
      Properties:
        Name: !Sub ${AWS::StackName}-token-signing-key
        GenerateSecretString: { PasswordLength: 64, ExcludePunctuation: true }

Plain-string values. Outputs: `ApiPasswordSecretArn`, `TokenSigningKeySecretArn`.

### Token

The token is `v1.<expiresAt>.<sig>`:
- `expiresAt` is integer Unix seconds.
- `sig` is base64url (unpadded) of `HMAC-SHA256(signingKey, "v1.<expiresAt>")`.

`verifyToken` returns false on any of:
- not exactly 3 parts
- version isn't `v1`
- `expiresAt` isn't an integer, or `expiresAt <= nowSec`
- signature length mismatch
- `timingSafeEqual` failure

Lifetime comes from the `TokenTtlHours` parameter (default 168), passed to `Login` as `TOKEN_TTL_SECONDS`.

### Functions

Both functions: `CodeUri: src/Auth`, `nodejs24.x`, `arm64`, `Tracing: Active`, `MemorySize: 256`, `Timeout: 5`.

| Function | Handler | Environment | `secretsmanager:GetSecretValue` on |
|---|---|---|---|
| `Login` | `login.handler` | `PASSWORD_SECRET_ARN`, `SIGNING_KEY_SECRET_ARN`, `TOKEN_TTL_SECONDS` | both secrets |
| `TokenAuthorizer` | `authorizer.handler` | `SIGNING_KEY_SECRET_ARN` | `TokenSigningKey` only |

`Login` event: `HttpApi`, `POST /login`, `ApiId: !Ref HttpApi`, `Auth: { Authorizer: NONE }`. Also add `/login: post: responses: {}` to the inline `DefinitionBody`.

### HTTP API

Keep the inline `DefinitionBody`, `FailOnWarnings: true` and `CorsConfiguration` unchanged. A local SAM transform confirmed that the default authorizer attaches to the `DefinitionBody` routes. Add:

    Auth:
      DefaultAuthorizer: TokenAuthorizer
      Authorizers:
        TokenAuthorizer:
          FunctionArn: !GetAtt TokenAuthorizer.Arn
          AuthorizerPayloadFormatVersion: '2.0'
          EnableSimpleResponses: true
          Identity: { Headers: [Authorization], ReauthorizeEvery: 300 }
    DefaultRouteSettings: { ThrottlingRateLimit: 5, ThrottlingBurstLimit: 10 }
    RouteSettings:
      'POST /login': { ThrottlingRateLimit: 1, ThrottlingBurstLimit: 3 }

API Gateway applies HTTP API throttling on a best-effort basis: the limits are targets, not guaranteed ceilings, and small limits like these may never return 429. Brute-force resistance comes from the random 32-character password, not from the throttle.

Plus `AWS::Lambda::Permission` for `apigateway.amazonaws.com` to invoke `TokenAuthorizer`, with `SourceArn: !Sub arn:${AWS::Partition}:execute-api:${AWS::Region}:${AWS::AccountId}:${HttpApi}/authorizers/*`. SAM does not create this permission.

## 6. Interfaces

### Template test asserts

- Both secrets use `GenerateSecretString` and have no `SecretString`.
- Function environments and secret policies match the Functions table exactly.
- The default authorizer is set, with simple responses and the `Authorization` header.
- The only `Authorizer: NONE` is `POST /login`.
- The invoke permission exists.
- `RouteSettings` has `POST /login`.
- Every `HttpApi` event uses `ApiId: !Ref HttpApi`.
- CORS still includes `http://localhost:3000` and the CloudFront domain.
- The `*.mp3` behavior exists.
- `TokenTtlHours` defaults to 168.

### `POST /login`

Body: `{"password": "<string>"}`. Every response sets `Cache-Control: no-store`.

| Case | Status | Body |
|---|---|---|
| Correct | 200 | `{"token", "expiresAt"}` |
| Wrong | 401 | `{"message": "Incorrect password"}` |
| Missing/non-string password, bad JSON | 400 | `{"message": "Password is required"}` |
| Secrets Manager error | 500 | `{"message": "Login unavailable"}` |

Tests:
- Every case in the table.
- The returned token passes `verifyToken`.
- No console output contains the password or the token.

### Authorizer

Returns `{ isAuthorized: verifyToken(key, event.headers?.authorization, nowSec) }`. A missing header or a Secrets Manager error returns false, the latter after logging `err.name`.

Tests:
- Valid → true.
- Expired, tampered signature, tampered `expiresAt`, wrong key, garbage, empty or missing → false, with no throws.
- Secrets Manager error → false.
- The key is fetched once within the cache window and again after it.
- No console output contains the token.

`token.test.mjs` also covers `passwordMatches` with inputs of different lengths (must not throw).

### Logging fix tests

In each of `CreateNewFile`, `ListFiles`, `GetVoices` and `DeleteFile`: invoke with `headers.authorization: 'SECRET-TOKEN-123'` (AWS SDK mocked) and assert no console output contains it. `DeleteFile` gains a `test` script, a `test/` directory and an `aws-sdk-client-mock` dev dependency.

### Frontend

    Amplify.configure(
      { API: { REST: { backend: { endpoint: config.backendAPI } } } },
      { API: { REST: { headers: async () => {
          const s = getSession();
          return s ? { Authorization: s.token } : {};
      } } } }
    );

`PasswordGate` starts unlocked if `getSession()` returns a session; otherwise it renders `PasswordForm`:
- `<input type="password" autoComplete="current-password">` and an Unlock button, disabled while a request is in flight.
- Submit calls `login`, then clears the input whatever the result.
- 200 → `saveSession`, then unlocked.
- Errors are shown in a `role="alert"` element:
  - 401 → "Incorrect password."
  - 429 → "Too many attempts. Wait a minute and try again."
  - Anything else → "Couldn't reach the server. Try again."

When unlocked, `PasswordGate` renders `<App onLocked={lock}/>`:
- The `App` header has a "Lock" button.
- `lock(message?)` calls `clearSession()` and returns to the form, which unmounts `App` and its data.

If an API call in `App`, `Form` or `Table` fails, call `onLocked("Your session expired. Enter the password again.")` when `isAuthError(err)` is true **or** `getSession()` returns `null`. API Gateway may omit CORS headers on authorizer rejections, and then the browser sees a network error instead of 401/403.

## 7. Commands

Run from the repo root.

| Purpose | Command | Available from |
|---|---|---|
| Template lint | `sam validate --lint` | now |
| Template test | `npm ci --prefix test/template && npm test --prefix test/template` | the task creating `test/template/` |
| Frontend lint | `npm run lint --prefix src/frontend` | now |
| Frontend test | `npm test --prefix src/frontend` | the task adding Vitest |
| Lambda tests | `npm test --prefix src/<pkg>` for `CreateNewFile`, `ListFiles`, `GetVoices`, `WebsiteBuildTrigger`, `DeleteFile`, `Auth` | the task adding each package's tests |
| Single test (mutation) | `node --test {filter}` (repo-relative path) or `npx --prefix src/frontend vitest run {filter}` | — |
| Fresh-checkout setup | `npm ci` in `src/frontend` and each Lambda package | — |

Vitest setup:
- The `test` script is `vitest run`.
- Dev dependencies: `vitest` (a version whose peer dependencies include `vite ^8`), `jsdom`, `@testing-library/react`, `@testing-library/user-event`.
- `vite.config.js` gets `test: { environment: 'jsdom' }`.

`docs/kukulu.json`: `policies: { "finalize": "draft" }` (the maintainer merges by hand). Leave every other setting at its default.

## 8. Phases

### Phase 0 — API

Build:
- The `src/Auth` package and its tests
- The template changes and the template test
- The logging fix and its tests

README additions:
- **Get the password:** `aws secretsmanager get-secret-value --secret-id <ApiPasswordSecretArn> --query SecretString --output text`
- **Change it:** `put-secret-value`. Existing tokens stay valid until they expire.
- **Sign out all devices:** `put-secret-value` on `TokenSigningKey`. Takes effect within about 10 minutes.
- **Lock is local:** it doesn't revoke the token.
- **Deploy order:** deploy together with Phase 1 (this phase alone breaks the deployed frontend).

Manual check (human, after deploying):

| Request | Expected |
|---|---|
| `GET /voices` without a token | 401 |
| `GET /voices` with `Authorization: v1.1.abc` | 403 (note whether `access-control-allow-origin` is present when sent with `Origin: http://localhost:3000`) |
| `POST /login`, wrong password | 401 |
| `POST /login`, right password | 200 with a token |
| `GET /voices` with that token | 200 |
| OPTIONS preflight | 204 with CORS headers |
| Rapid repeated `POST /login` | Best effort: 429 may appear, but 401s alone are not a failure (throttling isn't guaranteed) |

Also check:
- The deploy passes with `FailOnWarnings`.
- After rotating the key, the old token is rejected within about 10 minutes.
- CloudWatch logs for all six Lambdas contain no password or token.

### Phase 1 — Frontend

Build:
- Vitest setup
- `session.js`, `api.js`, `amplifyConfig.js`, `PasswordForm`, `PasswordGate`
- Lock and error handling in `App`, `Form` and `Table`
- README local-dev note: the app now prompts for the password

Tests (Amplify mocked):
- `session.js`: save, read and clear; an expired session reads as `null` and is removed; no password is ever written to `localStorage`.
- `configureAmplify`: `headers()` returns the token when a session exists, and `{}` otherwise.
- `PasswordGate`:
  - no session → form
  - correct password → app
  - 401 and 429 → their messages
  - the input is empty after submit
  - Lock removes the table rows from the DOM and clears the session
- `App`: a 401/403 from `GET /file`, or a failure while `getSession()` is `null`, calls `onLocked`.
- `isAuthError`: true for 401/403; false for 500 and network errors.

Manual check (human, on localhost and the CloudFront URL):
- The wrong password shows the error; the right one unlocks.
- Convert, list, download and delete all work.
- After a reload you stay unlocked, and `localStorage` holds only `tts.session`.
- Lock clears the table.
- Setting `expiresAt` to a past value, then reloading, shows the prompt.
- Rotating the key returns you to the prompt.
- A shared `*.mp3` link opens without the password.
- The console shows no password or token.

## 9. Open questions

None.

## Appendix: mockups and fixtures

None.
