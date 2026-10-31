import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from 'yaml';

const scalarTag = (name, key) => ({
  tag: name,
  resolve: (value) => ({ [key]: value }),
});
const seqTag = (name, key) => ({
  tag: name,
  collection: 'seq',
  resolve: (seq) => ({ [key]: seq.toJSON() }),
});
const scalarAndSeq = (name, key) => [scalarTag(name, key), seqTag(name, key)];

const customTags = [
  ...scalarAndSeq('!Ref', 'Ref'),
  ...scalarAndSeq('!GetAtt', 'Fn::GetAtt'),
  ...scalarAndSeq('!Sub', 'Fn::Sub'),
  ...scalarAndSeq('!Join', 'Fn::Join'),
];

const template = parse(
  readFileSync(new URL('../../template.yaml', import.meta.url), 'utf8'),
  { customTags },
);
const resources = template.Resources;
const functions = Object.entries(resources).filter(
  ([, r]) => r.Type === 'AWS::Serverless::Function',
);
const httpApiEvents = functions.flatMap(([name, fn]) =>
  Object.entries(fn.Properties.Events ?? {})
    .filter(([, e]) => e.Type === 'HttpApi')
    .map(([eventName, e]) => ({ name, eventName, props: e.Properties })),
);

const secretStatements = (fn) =>
  fn.Properties.Policies.filter((p) => typeof p === 'object').flatMap(
    (p) => p.Statement,
  );

test('secrets use GenerateSecretString and no SecretString', () => {
  for (const name of ['ApiPassword', 'TokenSigningKey']) {
    assert.equal(resources[name].Type, 'AWS::SecretsManager::Secret');
    assert.ok(resources[name].Properties.GenerateSecretString, name);
    assert.ok(!('SecretString' in resources[name].Properties), name);
  }
  assert.deepEqual(template.Outputs.ApiPasswordSecretArn.Value, { Ref: 'ApiPassword' });
  assert.deepEqual(template.Outputs.TokenSigningKeySecretArn.Value, { Ref: 'TokenSigningKey' });
});

test('function environments match the functions table', () => {
  assert.deepEqual(resources.Login.Properties.Environment.Variables, {
    PASSWORD_SECRET_ARN: { Ref: 'ApiPassword' },
    SIGNING_KEY_SECRET_ARN: { Ref: 'TokenSigningKey' },
    TOKEN_TTL_HOURS: { Ref: 'TokenTtlHours' },
  });
  assert.deepEqual(resources.TokenAuthorizer.Properties.Environment.Variables, {
    SIGNING_KEY_SECRET_ARN: { Ref: 'TokenSigningKey' },
  });
  for (const name of ['Login', 'TokenAuthorizer']) {
    const props = resources[name].Properties;
    assert.equal(props.CodeUri, 'src/Auth');
    assert.equal(props.Runtime, 'nodejs24.x');
    assert.deepEqual(props.Architectures, ['arm64']);
    assert.equal(props.Tracing, 'Active');
    assert.equal(props.MemorySize, 256);
    assert.equal(props.Timeout, 5);
  }
  assert.equal(resources.Login.Properties.Handler, 'login.handler');
  assert.equal(resources.TokenAuthorizer.Properties.Handler, 'authorizer.handler');
});

test('secret policies match the functions table', () => {
  const grants = (name) =>
    secretStatements(resources[name]).filter((s) =>
      [].concat(s.Action).some((a) => a.startsWith('secretsmanager:')),
    );
  const expectations = {
    Login: [{ Ref: 'ApiPassword' }, { Ref: 'TokenSigningKey' }],
    TokenAuthorizer: { Ref: 'TokenSigningKey' },
  };
  for (const [name, resource] of Object.entries(expectations)) {
    const found = grants(name);
    assert.equal(found.length, 1, name);
    assert.equal(found[0].Effect, 'Allow');
    assert.equal(found[0].Action, 'secretsmanager:GetSecretValue');
    assert.deepEqual(found[0].Resource, resource);
  }
  for (const [name, fn] of functions) {
    if (name === 'Login' || name === 'TokenAuthorizer') continue;
    assert.equal(
      secretStatements(fn).filter((s) =>
        [].concat(s.Action).some((a) => a.startsWith('secretsmanager:')),
      ).length,
      0,
      name,
    );
  }
});

test('the default authorizer uses simple responses and the Authorization header', () => {
  const auth = resources.HttpApi.Properties.Auth;
  assert.equal(auth.DefaultAuthorizer, 'TokenAuthorizer');
  const authorizer = auth.Authorizers.TokenAuthorizer;
  assert.deepEqual(authorizer.FunctionArn, { 'Fn::GetAtt': 'TokenAuthorizer.Arn' });
  assert.equal(authorizer.AuthorizerPayloadFormatVersion, '2.0');
  assert.equal(authorizer.EnableSimpleResponses, true);
  assert.deepEqual(authorizer.Identity.Headers, ['Authorization']);
});

test('only POST /login opts out of the authorizer', () => {
  const optedOut = httpApiEvents.filter((e) => e.props.Auth?.Authorizer === 'NONE');
  assert.equal(optedOut.length, 1);
  assert.equal(optedOut[0].name, 'Login');
  assert.equal(optedOut[0].props.Path, '/login');
  assert.equal(optedOut[0].props.Method, 'POST');
  for (const e of httpApiEvents) {
    if (e !== optedOut[0]) assert.ok(!('Auth' in e.props), `${e.name} ${e.eventName}`);
  }
  assert.ok(resources.HttpApi.Properties.DefinitionBody.paths['/login'].post);
});

test('the authorizer invoke permission exists', () => {
  const perm = resources.TokenAuthorizerInvokePermission;
  assert.equal(perm.Type, 'AWS::Lambda::Permission');
  assert.equal(perm.Properties.Action, 'lambda:InvokeFunction');
  assert.deepEqual(perm.Properties.FunctionName, { 'Fn::GetAtt': 'TokenAuthorizer.Arn' });
  assert.equal(perm.Properties.Principal, 'apigateway.amazonaws.com');
  assert.equal(
    perm.Properties.SourceArn['Fn::Sub'],
    'arn:${AWS::Partition}:execute-api:${AWS::Region}:${AWS::AccountId}:${HttpApi}/authorizers/*',
  );
});

test('every route, including POST /login, shares the default throttle', () => {
  const props = resources.HttpApi.Properties;
  assert.deepEqual(props.DefaultRouteSettings, { ThrottlingRateLimit: 5, ThrottlingBurstLimit: 10 });
  assert.equal(props.RouteSettings, undefined);
});

test('every HttpApi event uses ApiId Ref HttpApi', () => {
  assert.ok(httpApiEvents.length >= 5);
  for (const e of httpApiEvents) {
    assert.deepEqual(e.props.ApiId, { Ref: 'HttpApi' }, `${e.name} ${e.eventName}`);
  }
});

test('CORS still allows localhost and the CloudFront domain', () => {
  const origins = resources.HttpApi.Properties.CorsConfiguration.AllowOrigins;
  assert.ok(origins.includes('http://localhost:3000'));
  assert.ok(origins.some((o) => o['Fn::Sub'] === 'https://${Distribution.DomainName}'));
});

test('the mp3 cache behavior exists', () => {
  const behaviors = resources.Distribution.Properties.DistributionConfig.CacheBehaviors;
  assert.ok(behaviors.some((b) => b.PathPattern === '*.mp3'));
});

test('TokenTtlHours defaults to 168', () => {
  assert.equal(template.Parameters.TokenTtlHours.Default, 168);
  assert.equal(template.Parameters.TokenTtlHours.Type, 'Number');
  assert.equal(template.Parameters.TokenTtlHours.MinValue, 1);
});

test('background submission is bounded and the ordered index and status route are wired', () => {
  const create = resources.CreateNewFile.Properties;
  assert.equal(create.Timeout, 15);
  assert.equal(create.MemorySize, 256);
  const actions = secretStatements(resources.CreateNewFile).flatMap((s) => [].concat(s.Action));
  assert.ok(actions.includes('polly:StartSpeechSynthesisTask'));
  assert.ok(!actions.includes('polly:SynthesizeSpeech'));
  const index = resources.Table.Properties.GlobalSecondaryIndexes;
  assert.equal(index.length, 1);
  assert.equal(index[0].IndexName, 'RecordingsByCreatedAt');
  assert.deepEqual(index[0].KeySchema, [{ AttributeName: 'library', KeyType: 'HASH' }, { AttributeName: 'orderKey', KeyType: 'RANGE' }]);
  assert.equal(index[0].Projection.ProjectionType, 'ALL');
  const status = httpApiEvents.find((e) => e.props.Path === '/file/{id}' && e.props.Method === 'GET');
  assert.equal(status.name, 'ListFiles');
  assert.ok(resources.HttpApi.Properties.DefinitionBody.paths['/file/{id}'].get);
  assert.deepEqual(resources.ListFiles.Properties.Environment.Variables.BUCKET_NAME, { Ref: 'FileStore' });
  const policies = secretStatements(resources.ListFiles);
  const query = policies.find((s) => s.Action === 'dynamodb:Query');
  assert.deepEqual(query.Resource, { 'Fn::Sub': '${Table.Arn}/index/RecordingsByCreatedAt' });
  assert.ok(!policies.flatMap((s) => [].concat(s.Action)).includes('dynamodb:Scan'));
  for (const name of ['ListFiles', 'DeleteFile']) {
    const list = secretStatements(resources[name]).find((s) => s.Action === 's3:ListBucket');
    assert.deepEqual(list.Resource, { 'Fn::GetAtt': 'FileStore.Arn' });
    assert.ok(list.Condition.StringLike['s3:prefix'].startsWith('????????-'));
  }
});
