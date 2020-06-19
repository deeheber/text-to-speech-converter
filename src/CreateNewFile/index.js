const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const promisify = require('util').promisify;
const writeFilePromise = promisify(fs.writeFile);

const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const polly = new AWS.Polly();
const s3 = new AWS.S3();

const chunkText = require('./chunkText');

exports.handler = async message => {
  console.log('CreateNewFile invoked  with  message: ', message);

  let response;
  const id = uuidv4();
  const createdAt = Date.now();

  try {
    const data = JSON.parse(message.body);
    const text = data.text;
    const voice = data.voice || 'Matthew';

    const params = {
      TableName: process.env.TABLE_NAME,
      Item: {
        id,
        /* To account for DynamoDB limits: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Limits.html#limits-items */
        text: text.substring(0, 1500),
        voice,
        status: 'PROCESSING',
        createdAt
      }
    };

    console.log(`Adding file metadata to table ${process.env.TABLE_NAME}`);
    await dynamodb.put(params).promise();
    console.log('Item successfully added to the table  ', params);

    console.log('START convert to audio.');

    // Process text in chunks of 2500 characters
    // This is due to the polly limits for synthesizeSpeech
    // As of 04/13/2019 that limit is 3000 characters
    // https://docs.aws.amazon.com/polly/latest/dg/limits.html
    const textChunks = chunkText(text);

    for (let i = 0; i < textChunks.length; i++) {
      const pollyFile = await polly.synthesizeSpeech({
        OutputFormat: 'mp3',
        Text: `${textChunks[i]}`,
        TextType: 'text',
        VoiceId: `${voice}`
      }).promise();

      console.log('SUCCESS converting text chunk to audio: ', pollyFile);

      const flag = i === 0 ? 'w' : 'a';
      const writeFile = await writeFilePromise(`/tmp/${id}.mp3`, pollyFile.AudioStream, { flag });

      console.log('SUCCESS writing file chunk: ', writeFile);
    }

    console.log('SUCCESS writing all text chunk to /tmp');

    const uploadToS3 = await s3.putObject({
      ACL: 'public-read',
      Bucket: process.env.BUCKET_NAME,
      Key: `${id}.mp3`,
      Body: fs.createReadStream(`/tmp/${id}.mp3`)
    }).promise();

    console.log('SUCCESS uploading to S3: ', uploadToS3);

    const updateDynamo = await dynamodb.update({
      TableName: process.env.TABLE_NAME,
      Key: { id },
      UpdateExpression: 'SET #file_status = :status, #s3_url = :url',
      ExpressionAttributeValues: {
        ':status': 'COMPLETE',
        ':url': `https://${process.env.BUCKET_NAME}.s3.amazonaws.com/${id}.mp3`
      },
      ExpressionAttributeNames: {
        '#file_status': 'status',
        '#s3_url': 'url'
      },
      ReturnValues: 'ALL_NEW'
    }).promise();

    console.log('SUCCESS adding url to  DynamoDB: ', updateDynamo);

    response = JSON.stringify(updateDynamo.Attributes);
  } catch (err) {
    console.log('ERROR: ', err);
    console.log('Setting DynamoDB status to FAILED');

    const failDynamo = await dynamodb.update({
      TableName: process.env.TABLE_NAME,
      Key: { id },
      UpdateExpression: 'SET #file_status = :status',
      ExpressionAttributeValues: {
        ':status': 'FAILED'
      },
      ExpressionAttributeNames: {
        '#file_status': 'status'
      },
      ReturnValues: 'ALL_NEW'
    }).promise();

    console.log('Set DynamoDB to FAILED: ', failDynamo);

    response = JSON.stringify(err.message);
  }

  return response;
};
