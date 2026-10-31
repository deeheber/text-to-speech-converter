import { randomUUID } from 'crypto';
import * as fs from 'fs';
import { writeFile } from 'fs/promises';

import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

import { chunkText } from './chunkText.mjs';

export const handler = async (message) => {
  console.log('CreateNewFile invoked', { requestId: message.requestContext?.requestId, routeKey: message.routeKey });

  let data;
  try {
    data = JSON.parse(message.body);
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify('Request body must be valid JSON'),
    };
  }

  if (typeof data?.text !== 'string' || data.text.trim() === '') {
    return {
      statusCode: 400,
      body: JSON.stringify('Text must be a non-empty string'),
    };
  }
  if (data.voice !== undefined && typeof data.voice !== 'string') {
    return { statusCode: 400, body: JSON.stringify('Voice must be a string') };
  }

  const text = data.text;
  const voice = data.voice || 'Matthew';
  let response;
  let metadataCreated = false;
  const id = randomUUID();
  const createdAt = Date.now();

  const dyanmodbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
  const ddbDocClient = DynamoDBDocumentClient.from(dyanmodbClient);

  try {
    const params = {
      TableName: process.env.TABLE_NAME,
      Item: {
        id,
        /* To account for DynamoDB limits: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Limits.html#limits-items */
        text: text.substring(0, 1500),
        voice,
        status: 'PROCESSING',
        createdAt,
      },
    };

    console.log(`Adding file metadata to table ${process.env.TABLE_NAME}`);
    await ddbDocClient.send(new PutCommand(params));
    metadataCreated = true;
    console.log('Item successfully added to the table  ', params);

    console.log('START convert to audio.');

    const textChunks = chunkText(text);
    const pollyClient = new PollyClient({ region: process.env.AWS_REGION });

    for (let i = 0; i < textChunks.length; i++) {
      const pollyFile = await pollyClient.send(
        new SynthesizeSpeechCommand({
          OutputFormat: 'mp3',
          Text: `${textChunks[i]}`,
          TextType: 'text',
          VoiceId: `${voice}`,
        }),
      );

      console.log('SUCCESS converting text chunk to audio: ', pollyFile);

      const flag = i === 0 ? 'w' : 'a';
      await writeFile(`/tmp/${id}.mp3`, pollyFile.AudioStream, { flag });

      console.log('SUCCESS writing file chunk. ');
    }

    console.log('SUCCESS writing all text chunk to /tmp');

    const s3Client = new S3Client({ region: process.env.AWS_REGION });
    const s3Command = new PutObjectCommand({
      Bucket: process.env.BUCKET_NAME,
      Key: `${id}.mp3`,
      ContentType: 'audio/mpeg',
      CacheControl: 'no-store',
      Body: fs.createReadStream(`/tmp/${id}.mp3`),
    });
    const uploadToS3 = await s3Client.send(s3Command);

    console.log('SUCCESS uploading to S3: ', uploadToS3);

    const updateDynamo = await ddbDocClient.send(
      new UpdateCommand({
        TableName: process.env.TABLE_NAME,
        Key: { id },
        UpdateExpression: 'SET #file_status = :status, #s3_url = :url',
        ExpressionAttributeValues: {
          ':status': 'COMPLETE',
          ':url': `${process.env.AUDIO_BASE_URL}/${encodeURIComponent(`${id}.mp3`)}`,
        },
        ExpressionAttributeNames: {
          '#file_status': 'status',
          '#s3_url': 'url',
        },
        ReturnValues: 'ALL_NEW',
      }),
    );
    console.log('SUCCESS adding url to  DynamoDB: ', updateDynamo);

    response = JSON.stringify(updateDynamo.Attributes);
  } catch (err) {
    console.log('ERROR: ', err);
    if (metadataCreated) {
      try {
        console.log('Setting DynamoDB status to FAILED');
        const failDynamo = await ddbDocClient.send(
          new UpdateCommand({
            TableName: process.env.TABLE_NAME,
            Key: { id },
            UpdateExpression: 'SET #file_status = :status',
            ExpressionAttributeValues: {
              ':status': 'FAILED',
            },
            ExpressionAttributeNames: {
              '#file_status': 'status',
            },
            ReturnValues: 'ALL_NEW',
          }),
        );
        console.log('Set DynamoDB to FAILED: ', failDynamo);
      } catch (statusError) {
        console.log('Failed to set DynamoDB status to FAILED: ', statusError);
      }
    }

    response = {
      statusCode: err.statusCode || 500,
      body: JSON.stringify(err.message),
    };
  }

  return response;
};
