const AWS = require('aws-sdk');
const polly = new AWS.Polly();
const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();
const fs = require('fs');
const promisify = require('util').promisify;
const writeFilePromise = promisify(fs.writeFile);
const { chunkText } = require('utils');

exports.handler = async message => {
  console.log(`ConvertToAudio invoked with message: ${JSON.stringify(message, null, 2)}`);

  // Process text in chunks of 2500 characters
  // This is due to the polly limits for synthesizeSpeech
  // As of 04/13/2019 that limit is 3000 characters
  // https://docs.aws.amazon.com/polly/latest/dg/limits.html
  const textChunks = chunkText(message.text);
  let response;

  try {
    for (let i = 0; i < textChunks.length; i++) {
      const pollyFile = await polly.synthesizeSpeech({
        OutputFormat: 'mp3',
        Text: `${textChunks[i]}`,
        TextType: 'text',
        VoiceId: `${message.voice}`
      }).promise();

      console.log('SUCCESS converting text chunk to audio: ', pollyFile);

      const flag = i === 0 ? 'w' : 'a';
      const writeFile = await writeFilePromise(`/tmp/${message.id}.mp3`, pollyFile.AudioStream, { flag });

      console.log('SUCCESS writing file chunk: ', writeFile);
    }

    console.log('SUCCESS writing all text chunk to /tmp');

    const uploadToS3 = await s3.putObject({
      ACL: 'public-read',
      Bucket: process.env.BUCKET_NAME,
      Key: `${message.id}.mp3`,
      Body: fs.createReadStream(`/tmp/${message.id}.mp3`)
    }).promise();

    console.log('SUCCESS uploading to S3: ', uploadToS3);

    const updateDynamo = await dynamodb.update({
      TableName: process.env.TABLE_NAME,
      Key: { id: message.id },
      UpdateExpression: 'SET #file_status = :status, #s3_url = :url',
      ExpressionAttributeValues: {
        ':status': 'COMPLETE',
        ':url': `https://${process.env.BUCKET_NAME}.s3-${process.env.AWS_REGION}.amazonaws.com/${message.id}.mp3`
      },
      ExpressionAttributeNames: {
        '#file_status': 'status',
        '#s3_url': 'url'
      },
      ReturnValues: 'ALL_NEW'
    }).promise();

    console.log('SUCCESS adding url to  DynamoDB: ', updateDynamo);

    response = {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Credentials': true,
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(updateDynamo.Attributes)
    };
  } catch (err) {
    console.log('ERROR: ', err);

    response = {
      statusCode: err.statusCode || 500,
      headers: {},
      body: JSON.stringify(err.message)
    };
  }

  return response;
};
