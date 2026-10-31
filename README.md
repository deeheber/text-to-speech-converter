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
         │              └──── Polly (background tasks → S3)
         └── TokenAuthorizer (Lambda) ── Secrets Manager

CodeBuild ── S3 (frontend)
```

## Deploy

Requires Node.js 24 and the [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html).

```sh
sam build
sam deploy --guided
```

Set the `SourceVersion` parameter to the Git SHA to deploy. CodeBuild clones this public repo at that SHA to build the frontend ([details](src/WebsiteBuildTrigger/README.md)), so the commit must be pushed. Wait for the `RecordingsByCreatedAt` index to become `ACTIVE`, then open `FrontendURL` from the stack outputs. CloudFormation can finish its update before an added index is ready.

This version indexes new recordings only. It performs no backfill or deletion of existing records or audio.

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
| `GET /file?limit=10&cursor=...` | `{Items, nextCursor}`; newest first, default 10 and maximum 50 rows |
| `POST /file` | `{requestId, text, voice?}` → HTTP 202 with the accepted recording |
| `GET /file/{id}` | Check one recording and refresh its status |
| `DELETE /file/{id}` | Delete a terminal recording and its audio |

`requestId` must be a UUID v4. Reuse it with the same text and effective voice to retry an uncertain submission; a changed payload returns `409`. A retry returns the existing recording, including a previous failure. A new conversion needs a new UUID. Deduplication lasts while the record exists.

Text is plain text, limited to 100,000 UTF-16 code units (JavaScript `text.length`); emoji may count as two. The default voice is Matthew. Only the first 1,500 Unicode code points are stored as a preview, along with a hash of the full text and voice.

Recordings move through `STARTING`, `QUEUED`, and `PROCESSING` to `COMPLETE` or `FAILED`. `UNKNOWN` means the outcome could not be confirmed. Only `COMPLETE` has a download URL. Definite Polly rejections return a `FAILED` record with an error status; ambiguous starts return `202` with `UNKNOWN`. Retrying an uncertain start never automatically starts Polly again.

The browser refreshes the visible page every 10 seconds while jobs are active or a just-submitted record has not appeared in the index. Refresh pauses in hidden tabs and backs off to 60 seconds on errors. Each backend request checks at most five unfinished rows, least recently checked first, with an eight-second budget and at most two Polly status requests per second. `GET /file/{id}` and **Check status** also refresh a single recording.

The index orders by creation time, then recording ID descending for equal timestamps. It is eventually consistent; pages do not represent a frozen snapshot while records are created or deleted. Follow `nextCursor` until it is `null` and pass the cursor unchanged.

Active jobs cannot be cancelled or deleted (`409`). Removing an `UNKNOWN` recording requires `DELETE /file/{id}?allowUnknown=true`; the UI asks for confirmation. This deletes currently discoverable audio, but a late Polly output may still need manual S3 cleanup. Failed deletions retain metadata so Delete can be retried.

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

- Polly writes MP3s directly to S3; synthesis uses no local temporary files.
- Status updates happen when the app is opened or refreshed. [Polly retains task history for 72 hours](https://docs.aws.amazon.com/polly/latest/APIReference/API_StartSpeechSynthesisTask.html). After that, S3 output can establish completion, but missing output cannot establish failure.
- A lost start response may leave a job without a task ID. After the submission Lambda has had time to finish (30 seconds), status checks look for one matching output. Missing or ambiguous output remains `UNKNOWN`; use **Check status** before explicitly submitting another attempt, which may create duplicate audio.
- Uncertain submission IDs and text are kept in browser memory. Reloading or locking clears that form state.

## Deployment verification

After an authorized deployment, verify a conversion that takes more than 29 seconds, close and reopen the browser, and check status. Confirm Polly's actual output key and content type, CloudFront download/cache behavior, pagination across more than 10 new recordings, and deletion. Local tests mock AWS and do not establish those live behaviors.

## Contributing

Bugs and questions: [open an issue](https://github.com/deeheber/text-to-speech-converter/issues) with steps to reproduce. Open PRs against `main`, with `fixes #<issue>` if one applies.

For anything else, contact links are in the footer of [my website](https://danielleheberling.xyz/).
