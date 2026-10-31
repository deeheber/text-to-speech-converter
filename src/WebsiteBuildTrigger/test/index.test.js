import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { handler } from '../index.js';
import { sendProvisionResponse } from '../sendProvisionResponse.mjs';

const message = {
  ResponseURL:
    'https://example.invalid/callback%2Ftoken?X-Amz-Credential=a%2Fb&X-Amz-Signature=c%2Bd',
  StackId: 'stack-id',
  RequestId: 'request-id',
  LogicalResourceId: 'trigger',
};

function mockRequest(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(console, 'log', () => {});

  const req = new EventEmitter();

  req.end = t.mock.fn();
  req.destroy = t.mock.fn();

  let respond;
  const request = t.mock.method(https, 'request', (...args) => {
    respond = args.at(-1);

    return req;
  });

  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });

  return {
    req,
    request,
    respond(statusCode) {
      const response = Readable.from([]);

      response.statusCode = statusCode;
      respond(response);
    },
  };
}

test('sends the CloudFormation payload to the unchanged signed URL and clears the deadline on success', async (t) => {
  const transport = mockRequest(t);
  const result = sendProvisionResponse(
    'sha',
    { website: 'ready' },
    'SUCCESS',
    message,
    'Published',
  );

  transport.respond(200);
  await result;

  const args = transport.request.mock.calls[0].arguments;

  assert.equal(args[0].href, message.ResponseURL);
  assert.equal(args[1].method, 'PUT');
  assert.deepEqual(JSON.parse(transport.req.end.mock.calls[0].arguments[0]), {
    Status: 'SUCCESS',
    Reason: 'Published',
    PhysicalResourceId: 'sha',
    StackId: 'stack-id',
    RequestId: 'request-id',
    LogicalResourceId: 'trigger',
    Data: { website: 'ready' },
  });

  t.mock.timers.tick(10000);

  assert.equal(transport.req.destroy.mock.callCount(), 0);
});

test('rejects a non-200 response and clears the deadline', async (t) => {
  const transport = mockRequest(t);
  const result = sendProvisionResponse('sha', null, 'SUCCESS', message);

  transport.respond(403);

  await assert.rejects(
    result,
    /Bad response from CloudFormation Response URL: 403/,
  );

  t.mock.timers.tick(10000);

  assert.equal(transport.req.destroy.mock.callCount(), 0);
});

test('rejects a transport error and clears the deadline', async (t) => {
  const transport = mockRequest(t);
  const result = sendProvisionResponse('sha', null, 'SUCCESS', message);

  transport.req.emit('error', new Error('connection reset'));

  await assert.rejects(
    result,
    /Error while sending response to CloudFormation: connection reset/,
  );

  t.mock.timers.tick(10000);

  assert.equal(transport.req.destroy.mock.callCount(), 0);
});

test('rejects and destroys a stalled request at 10 seconds even before a socket is assigned', async (t) => {
  const transport = mockRequest(t);
  const result = sendProvisionResponse('sha', null, 'SUCCESS', message);
  let settled = false;

  result.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  t.mock.timers.tick(9999);
  await Promise.resolve();

  assert.equal(settled, false);
  assert.equal(transport.req.destroy.mock.callCount(), 0);

  t.mock.timers.tick(1);

  assert.equal(transport.req.destroy.mock.callCount(), 1);
  await assert.rejects(
    result,
    /Timed out sending response to CloudFormation after 10000ms/,
  );
  assert.equal(transport.request.mock.callCount(), 1);
});

test('accepts STOPPED in the event filter and replies FAILED with the original CloudFormation details', async (t) => {
  const template = readFileSync(
    new URL('../../../template.yaml', import.meta.url),
    'utf8',
  );
  const rule = template
    .split('  WebsiteEvents:')[1]
    .split('  WebsiteEventsPermission:')[0];

  assert.match(rule, /^\s+- STOPPED$/m);

  const originalRegion = process.env.AWS_REGION;

  process.env.AWS_REGION = 'us-west-2';
  t.after(() => {
    if (originalRegion === undefined) {
      delete process.env.AWS_REGION;
    } else {
      process.env.AWS_REGION = originalRegion;
    }
  });

  const transport = mockRequest(t);
  const result = handler({
    source: 'aws.codebuild',
    detail: {
      'project-name': 'website',
      'build-id':
        'arn:aws:codebuild:us-west-2:123456789012:build/website:build-id',
      'build-status': 'STOPPED',
      'additional-information': {
        environment: {
          'environment-variables': Object.entries({
            CFN_RESPONSE_URL: message.ResponseURL,
            CFN_STACK_ID: message.StackId,
            CFN_REQUEST_ID: message.RequestId,
            CFN_LOGICAL_ID: message.LogicalResourceId,
            SOURCE_VERSION: 'sha',
          }).map(([name, value]) => ({ name, value })),
        },
      },
    },
  });

  transport.respond(200);
  await result;

  const payload = JSON.parse(transport.req.end.mock.calls[0].arguments[0]);

  assert.equal(
    transport.request.mock.calls[0].arguments[0].href,
    message.ResponseURL,
  );
  assert.deepEqual(payload, {
    Status: 'FAILED',
    Reason:
      'Failed to publish site, see https://us-west-2.console.aws.amazon.com/codesuite/codebuild/projects/website/build/website:build-id/log?region=us-west-2',
    PhysicalResourceId: 'sha',
    StackId: message.StackId,
    RequestId: message.RequestId,
    LogicalResourceId: message.LogicalResourceId,
    Data: {},
  });
});

test('the CodeBuild shell guard prevents publishing after a failed build', () => {
  const template = readFileSync(
    new URL('../../../template.yaml', import.meta.url),
    'utf8',
  );
  const guard = template.match(
    /^\s+- (if \[ .*CODEBUILD_BUILD_SUCCEEDING.*)$/m,
  )[1];

  assert.doesNotMatch(guard, /==/, 'POSIX test uses = for string comparison');

  for (const [value, expectedStatus, expectedOutput] of [
    ['0', 1, ''],
    ['1', 0, 'published'],
  ]) {
    const result = spawnSync('/bin/sh', ['-c', `${guard}\nprintf published`], {
      env: { ...process.env, CODEBUILD_BUILD_SUCCEEDING: value },
      encoding: 'utf8',
    });

    assert.equal(result.status, expectedStatus);
    assert.equal(result.stdout, expectedOutput);
    assert.equal(result.stderr, '');
  }
});
