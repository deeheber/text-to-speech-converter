const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const fs = require('fs');
const promisify = require('util').promisify;
const writeFilePromise = promisify(fs.writeFile);
// const AWS = require('aws-sdk');
// const s3 = new AWS.S3();

exports.handler = async message => {
  /*
    Get the file information from the message
    Divide the file text into sections of 1000 characters (store in an array)
    Loop through the array for each item
      Send to synthesize the speech in Polly with output format of mp3
      Save the synthesized speech to /tmp/fileId
    Upload the /tmp/fileId to the FileStore bucket
    Update the item in dynamoDB Table to have the URL to the file in S3 and the status to COMPLETE
  */
  console.log(`ConvertToAudio invoked with message: ${JSON.stringify(message, null, 2)}`);

  let response;

  try {
    const writeFile = await writeFilePromise(`/tmp/${message.id}.txt`, `${message.text}`);

    console.log('SUCCESS writing file: ', writeFile);

    const uploadToS3 = await s3.putObject({
      ACL: 'public-read',
      Bucket: process.env.BUCKET_NAME,
      Key: `${message.id}.txt`,
      Body: fs.createReadStream(`/tmp/${message.id}.txt`),
      ContentType: 'application/zip'
    }).promise();

    console.log('SUCCESS uploading to S3: ', uploadToS3);

    response = {
      statusCode: 200,
      headers: {},
      body: `https://s3.amazonaws.com/${process.env.BUCKET_NAME}/${message.id}.txt`
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
