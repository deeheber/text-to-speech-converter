import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { PollyClient } from '@aws-sdk/client-polly';
import { S3Client } from '@aws-sdk/client-s3';
import { publicRecord, refresh, unfinished, uuid } from './recordings.mjs';

const reply = (statusCode, body) => ({ statusCode, body: JSON.stringify(body) });

function parameters(query = {}) {
  const rawLimit = query.limit ?? '10';
  if (!/^(?:[1-9]|[1-4][0-9]|50)$/.test(rawLimit)) throw new Error('limit must be an integer from 1 to 50');
  let key;
  if (query.cursor !== undefined) {
    if (query.cursor.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(query.cursor)) throw new Error('Invalid cursor');
    key = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8'));
    if (!key || Object.keys(key).sort().join(',') !== 'id,library,orderKey' || key.library !== 'ALL'
      || !uuid.test(key.id) || typeof key.orderKey !== 'string'
      || !/^\d{13}#/.test(key.orderKey) || key.orderKey !== `${key.orderKey.slice(0, 13)}#${key.id}`) throw new Error('Invalid cursor');
  }
  return { limit: Number(rawLimit), key };
}

export const handler = async (event) => {
  console.log('ListFiles invoked', { requestId: event.requestContext?.requestId, routeKey: event.routeKey });
  let params;
  const id = event.pathParameters?.id;
  if (id !== undefined && !uuid.test(id)) return reply(400, 'Invalid recording ID');
  try { params = parameters(event.queryStringParameters ?? {}); } catch { return reply(400, 'Invalid limit or cursor'); }
  const deadline = Date.now() + 8000;
  const config = { region: process.env.AWS_REGION, maxAttempts: 1,
    requestHandler: { connectionTimeout: 1000, requestTimeout: 2000 } };
  const database = DynamoDBDocumentClient.from(new DynamoDBClient(config));
  const services = { database, polly: new PollyClient(config), storage: new S3Client(config), deadline, clock: { nextPollyAt: 0 } };
  try {
    if (id !== undefined) {
      const { Item } = await database.send(new GetCommand({ TableName: process.env.TABLE_NAME, Key: { id: id.toLowerCase() }, ConsistentRead: true }),
        { abortSignal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) });
      if (!Item) return reply(404, 'Recording not found');
      const item = await refresh(Item, services);
      return item ? reply(200, publicRecord(item)) : reply(404, 'Recording not found');
    }
    const { Items = [], LastEvaluatedKey } = await database.send(new QueryCommand({
      TableName: process.env.TABLE_NAME, IndexName: 'RecordingsByCreatedAt',
      KeyConditionExpression: '#library = :library', ExpressionAttributeNames: { '#library': 'library' },
      ExpressionAttributeValues: { ':library': 'ALL' }, ScanIndexForward: false, Limit: params.limit,
      ...(params.key ? { ExclusiveStartKey: params.key } : {}),
    }), { abortSignal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) });
    const updates = new Map();
    const pending = Items.filter(unfinished).sort((a, b) => (a.lastCheckedAt ?? 0) - (b.lastCheckedAt ?? 0) || a.createdAt - b.createdAt).slice(0, 5);
    for (const item of pending) updates.set(item.id, await refresh(item, services));
    return reply(200, {
      Items: Items.map((item) => updates.has(item.id) ? updates.get(item.id) : item).filter(Boolean).map(publicRecord),
      nextCursor: LastEvaluatedKey ? Buffer.from(JSON.stringify(LastEvaluatedKey)).toString('base64url') : null,
    });
  } catch (error) {
    console.error('List recordings failed', error.name);
    return reply(503, 'Recordings could not be loaded. Please try again.');
  }
};
