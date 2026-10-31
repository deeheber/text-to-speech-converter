# Site-wide password build progress

Branch: build/2026-10-31
Started: 2026-10-31T17:18:59.941Z

## Tasks

- [x] P0-01 Stop logging raw events in CreateNewFile, ListFiles and GetVoices
- [x] P0-02 Stop logging raw events in DeleteFile and give it a test suite
- [ ] P0-03 Create the Auth package with the token module
- [ ] P0-04 Add the secrets cache and the token authorizer
- [ ] P0-05 Add the login handler
- [ ] P0-06 Wire secrets, functions, authorizer and throttling into the template, with a template test
- [ ] P0-07 Document the password, rotation and deploy order in the README
- [ ] P0-08 Phase 0 checkpoint: push and list manual API checks
- [ ] P1-01 Add Vitest and the session store
- [ ] P1-02 Add the login API client and the Amplify configuration
- [ ] P1-03 Add the password form
- [ ] P1-04 Add the Lock button and auth-error handling to App, Form and Table
- [ ] P1-05 Add the password gate and render it from index.jsx
- [ ] P1-06 Note the password prompt in the README's local-dev section
- [ ] P1-07 Phase 1 checkpoint: push and list manual frontend checks

## Log

(one entry per task, appended by implement)

### P0-01 — 30c186c

Tests: 'does not log the authorization header' added to CreateNewFile, ListFiles, GetVoices. Replaced first log line with request id/route key line (code in c99a8c8). Test calls mock.restoreAll() first to replace the no-op console mock. Note: verify's no-build-references flags .gitignore ".kukulu/implement.lock" (tooling-added); logged as feedback. Lesson: log feedback AFTER task_done, since it moves HEAD.

### P0-02 — 941df04

Tests: 3 added in src/DeleteFile/test/index.test.js. Added test script, aws-sdk-client-mock ^4.1.0 devDependency, .npmignore. No interpretation choices. no-build-references still fails on .gitignore ".kukulu/implement.lock" (tooling-added, pre-existing).
