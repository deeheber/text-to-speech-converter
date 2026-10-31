# text-to-speech-converter

## Commands

There's no root `package.json`. Each Lambda directory, `src/frontend` and `test/template` is its own npm package. Run commands from the repo root with `--prefix`. The test loop is in `README.md`.

- **Template checks:** `sam validate --lint`, plus `npm test --prefix test/template`, which asserts the template's auth and security setup.
- **One frontend test file:** `npx --prefix src/frontend vitest run --root src/frontend <path>`. Without `--root`, Vitest won't find its config.
- **Don't run unless asked:** `sam deploy`, `sam build`, `aws` CLI commands, or `npm run production`. That last one overwrites the gitignored `src/frontend/src/config.js`, which CodeBuild generates at deploy time.

## Style

Use braces and multiline control flow. Separate validation, setup, side effects, and assertions with blank lines. Prettier handles layout; ESLint enforces braces.

## Security rules

- **Request logging:** handlers never log the raw event, which carries the `Authorization` header. Log only `requestContext?.requestId` and `routeKey`. (`src/WebsiteBuildTrigger` is exempt.)
- **Auth logging:** under `src/Auth/`, never log headers, bodies, passwords, tokens or keys. Log errors by `err.name`.
- **Comparisons:** compare credentials only with `crypto.timingSafeEqual` (passwords via SHA-256 digests). Keep token signing and verification in `src/Auth/token.mjs`. No JWT libraries.
- **Secret values:** never in `template.yaml` `Environment` blocks, `config.js` or source. Lambdas get secret ARNs only.
- **Public route:** `POST /login` is the only one. Every other route uses the default `TokenAuthorizer`.
- **Frontend:** stores only the token (`session.js`, key `tts.session`), never the password. No `sessionStorage`, cookies, or `console` output of credentials.
- **Leak tests:** mock every `console` method and assert that no output line contains the secret value.
- **Imports:** frontend tests must not import `index.jsx` or `config.js` (gitignored).
