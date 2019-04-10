const fs = require('fs');
const AWS = require('aws-sdk');
const s3 = new AWS.S3();

exports.handler = async (message, context) => {
  // TODO: Add permission to polly:SynthesizeSpeech
  /*
    Get the file information from the Table
    Divide the file text into sections of 1000 characters (store in an array)
    Loop through the array for each item
      Send to synthesize the speech in Polly with output format of mp3
      Save the synthesized speech to /tmp/fileId
    Upload the /tmp/fileId to the FileStore bucket
    Update the item in dynamoDB Table to have the URL to the file in S3 and the status to COMPLETE
  */
  console.log(`ConvertToAudio invoked with message: ${JSON.stringify(message, null, 2)}`);
  console.log('ConvertToAudio context: ', context);

  fs.writeFile('/tmp/test.txt', 'This is only a test file', (err) => {
    if (err) {
      return console.log('Error writing file to tmp: ', err);
    }

    console.log('writing file succeess');

    fs.readFile('/tmp/test.txt', (err, fileBuffer) => {
      if (err) {
        return console.log('An error ocurred uploading to  s3: ', err);
      }

      const params = {
        Body: fileBuffer,
        Bucket: process.env.BUCKET_NAME,
        Key: 'test.txt'
      };

      s3.putObject(params, (err, data) => {
        if (err) {
          return console.log('Error occured while putting s3 object: ', err);
        }
        console.log('Object successfully put in s3: ', data);
        return {
          statusCode: 200,
          headers: {},
          body: 'File processing complete.'
        };
      });
    });
  });
};
