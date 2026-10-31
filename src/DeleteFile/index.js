import { S3Client, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, DeleteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply = (statusCode, value) => ({ statusCode, body: JSON.stringify(value) });

export const handler = async (event) => {
  console.log('DeleteFile invoked', { requestId: event.requestContext?.requestId, routeKey: event.routeKey });
  if (!uuid.test(event.pathParameters?.id ?? '')) return reply(400, 'Invalid recording ID');
  const id = event.pathParameters.id.toLowerCase();
  const database = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));
  const storage = new S3Client({ region: process.env.AWS_REGION });
  const key = { TableName: process.env.TABLE_NAME, Key: { id } };
  try {
    const { Item: item } = await database.send(new GetCommand({ ...key, ConsistentRead: true }));
    if (!item) return reply(404, 'Recording not found');
    if (!['COMPLETE', 'FAILED', 'UNKNOWN'].includes(item.status)) return reply(409, 'An active conversion cannot be cancelled. Check status first.');
    if (item.status === 'UNKNOWN' && event.queryStringParameters?.allowUnknown !== 'true') {
      return reply(409, 'Confirm allowUnknown=true: Polly cannot be cancelled and late audio may need manual S3 cleanup.');
    }
    if (!item.deleting) {
      await database.send(new UpdateCommand({ ...key,
        UpdateExpression: 'SET deleting = :yes',
        ConditionExpression: 'attribute_exists(id) AND #revision = :revision AND createdAt = :createdAt AND #status = :status',
        ExpressionAttributeNames: { '#revision': 'revision', '#status': 'status' },
        ExpressionAttributeValues: { ':yes': true, ':revision': item.revision, ':createdAt': item.createdAt, ':status': item.status },
      }));
    }
    const validKey = (value) => typeof value === 'string' && new RegExp(`^${id}\\.[a-zA-Z0-9_-]+\\.mp3$`).test(value);
    if (item.status === 'UNKNOWN') {
      let token;
      do {
        const page = await storage.send(new ListObjectsV2Command({ Bucket: process.env.BUCKET_NAME, Prefix: `${id}.`, ...(token ? { ContinuationToken: token } : {}) }));
        for (const object of page.Contents ?? []) {
          if (validKey(object.Key)) await storage.send(new DeleteObjectCommand({ Bucket: process.env.BUCKET_NAME, Key: object.Key }));
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
        if (page.IsTruncated && !token) throw new Error('Missing S3 continuation token');
      } while (token);
    } else if (item.objectKey !== undefined) {
      if (!validKey(item.objectKey)) throw new Error('Unexpected recording key');
      await storage.send(new DeleteObjectCommand({ Bucket: process.env.BUCKET_NAME, Key: item.objectKey }));
    } else if (item.status === 'COMPLETE') throw new Error('Missing recording key');
    await database.send(new DeleteCommand({ ...key,
      ConditionExpression: 'attribute_exists(id) AND deleting = :yes AND createdAt = :createdAt AND #revision = :revision',
      ExpressionAttributeNames: { '#revision': 'revision' },
      ExpressionAttributeValues: { ':yes': true, ':createdAt': item.createdAt, ':revision': item.revision },
    }));
    return reply(200, 'Success deleting item');
  } catch (error) {
    console.error('Delete recording failed', error.name);
    return error.name === 'ConditionalCheckFailedException' ? reply(409, 'Recording changed; reload and try again.')
      : reply(503, 'Deletion could not be completed. Please try Delete again.');
  }
};
