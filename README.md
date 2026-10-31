# text-to-speech-converter

Converts text to downloadable MP3 audio with Amazon Polly. Written for US English; other languages may not convert well.

[My deployed version](https://d21fkyflmuqkf4.cloudfront.net/) is password protected. To try it, [ask me](https://danielleheberling.xyz/) for the password. Audio links are public, so they can be shared.

## Architecture

```text
Browser ── CloudFront ── S3 (frontend)
   │            └────── S3 (recordings, public *.mp3 links)
   │                         ▲
   └── API Gateway ── Lambda ─┤
         │              ├──── DynamoDB
         │              └──── Polly
         └── TokenAuthorizer (Lambda) ── Secrets Manager

CodeBuild ── S3 (frontend)
```

## Deploy

Requires Node.js 24 and the [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html).

```sh
sam build
sam deploy --guided
```

Set the `SourceVersion` parameter to the Git SHA to deploy. CodeBuild clones this public repo at that SHA to build the frontend ([details](src/WebsiteBuildTrigger/README.md)), so the commit must be pushed. Then open `FrontendURL` from the stack outputs.

## Site password

One shared password protects the API. The password and the token-signing key are generated at deploy time; their ARNs are in the stack outputs.

| Task | Command |
|---|---|
| Get the password | `aws secretsmanager get-secret-value --secret-id <ApiPasswordSecretArn> --query SecretString --output text` |
| Change the password (existing tokens stay valid until they expire) | `aws secretsmanager put-secret-value --secret-id <ApiPasswordSecretArn> --secret-string "$(openssl rand -base64 48 \| tr -dc 'A-Za-z0-9' \| head -c 32)"` |
| Sign out every device (takes effect within ~10 minutes) | `aws secretsmanager put-secret-value --secret-id <TokenSigningKeySecretArn> --secret-string "$(openssl rand -base64 48 \| tr -dc 'A-Za-z0-9' \| head -c 64)"` |

- Tokens last `TokenTtlHours` (stack parameter, default 168).
- The Lock button only forgets the token in this browser; it doesn't revoke it.

## API

All routes except `/login` need `Authorization: <token>`.

| Route | Purpose |
|---|---|
| `POST /login` | `{"password": "..."}` → `{"token", "expiresAt"}` |
| `GET /voices` | Voices for the dropdown |
| `GET /file` | List conversions |
| `POST /file` | Create a conversion |
| `DELETE /file/{id}` | Delete a conversion |

## Run the frontend locally

Uses a deployed backend, whose CORS settings allow `http://localhost:3000`.

1. `cd src/frontend && npm ci`
2. Create `src/frontend/src/config.js` (gitignored) with the `ApiURL` stack output:

   ```js
   const apiRef = {
     backendAPI: 'https://<api-id>.execute-api.<region>.amazonaws.com',
   };

   export default apiRef;
   ```

3. `npm start`, then open http://localhost:3000 and enter the site password.

Don't run `npm run production` locally. It's for CodeBuild and overwrites `config.js` from `API_URL`.

## Tests

No AWS credentials needed; AWS calls are mocked.

```sh
for p in src/CreateNewFile src/ListFiles src/GetVoices src/DeleteFile src/WebsiteBuildTrigger src/Auth test/template src/frontend; do
  npm ci --prefix "$p" && npm test --prefix "$p" || break
done
sam validate --lint
```

## Known limitations

- `CreateNewFile` uses Lambda's default 512 MB `/tmp`. For very large requests, add [EphemeralStorage](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-resource-function.html#sam-function-ephemeralstorage).
- `GET /file` scans the whole DynamoDB table with no pagination.

## Contributing

Bugs and questions: [open an issue](https://github.com/deeheber/text-to-speech-converter/issues) with steps to reproduce. Open PRs against `main`, with `fixes #<issue>` if one applies.

For anything else, contact links are in the footer of [my website](https://danielleheberling.xyz/).
