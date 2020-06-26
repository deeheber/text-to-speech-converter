const AWS = require('aws-sdk');
const polly = new AWS.Polly();

exports.handler = async message => {
  // Log the event argument for debugging and for use in local development.
  console.log(JSON.stringify(message, undefined, 2));
  let response;
  let statusCode;

  try {
    response = await polly.describeVoices({
      Engine: 'standard',
      LanguageCode: 'en-US'
    }).promise();
  } catch (err) {
    console.log(`AN ERROR OCURRED: ${JSON.stringify(err.message, undefined, 2)}`);
    statusCode = err.statusCode || 500;
    response = {
      statusCode,
      body: JSON.stringify(err.message)
    };
  }
  console.log(response.Voices.length);
  return response;
};
