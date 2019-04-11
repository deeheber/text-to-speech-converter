const AWS = require('aws-sdk');
const polly = new AWS.Polly();
const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();
const fs = require('fs');
const promisify = require('util').promisify;
const writeFilePromise = promisify(fs.writeFile);

exports.handler = async message => {
  /*
    Get the file information from the message
    Divide the file text into sections of 1000 characters (store in an array)
    Loop through the array for each item
      Send to synthesize the speech in Polly with output format of mp3
      Save the synthesized speech to /tmp/fileId
    Upload the /tmp/fileId.mp3 to the FileStore bucket
    Update the item in dynamoDB Table to have the URL to the file in S3 and the status to COMPLETE
  */
  console.log(`ConvertToAudio invoked with message: ${JSON.stringify(message, null, 2)}`);

  let response;

  try {
    const pollyFile = await polly.synthesizeSpeech({
      OutputFormat: 'mp3',
      Text: `${message.text}`,
      TextType: 'text',
      VoiceId: `${message.voice}`
    }).promise();

    console.log('SUCCESS converting text to audio file: ', pollyFile);

    const writeFile = await writeFilePromise(`/tmp/${message.id}.mp3`, pollyFile.AudioStream);

    console.log('SUCCESS writing file: ', writeFile);

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
        ':url': `https://s3.amazonaws.com/${process.env.BUCKET_NAME}/${message.id}.mp3`
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
      headers: {},
      body: JSON.stringify(updateDynamo.Attributes)
    };
  } catch (err) {
    console.log('ERROR: ', err);

    response = {
      statusCode: 500,
      headers: {},
      body: JSON.stringify(err.message)
    };
  }

  return response;
};
