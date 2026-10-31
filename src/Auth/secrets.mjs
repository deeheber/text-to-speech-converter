import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';

const CACHE_TTL_MS = 300_000;

const client = new SecretsManagerClient({});
const cache = new Map();
let now = Date.now;

export const getSecret = async (arn) => {
  const hit = cache.get(arn);
  if (hit && now() - hit.fetchedAt < CACHE_TTL_MS) return hit.value;
  const fetchedAt = now();
  const { SecretString } = await client.send(
    new GetSecretValueCommand({ SecretId: arn }),
  );
  cache.set(arn, { value: SecretString, fetchedAt });
  return SecretString;
};

export const _resetCache = () => {
  cache.clear();
};

export const _setNow = (fn) => {
  now = fn ?? Date.now;
};
