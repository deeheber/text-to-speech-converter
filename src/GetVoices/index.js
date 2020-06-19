const AWS = require('aws-sdk');
const polly = new AWS.Polly();

exports.handler = async message => {
  // Log the event argument for debugging and for use in local development.
  console.log(JSON.stringify(message, undefined, 2));
  let response;
  let statusCode;

  try {
    response = await polly.describeVoices({
      LanguageCode: 'en-US'
    }).promise();
    statusCode = 200;
  } catch (err) {
    console.log(`AN ERROR OCURRED: ${JSON.stringify(err.message, undefined, 2)}`);
    response = err.message;
    statusCode = err.statusCode || 500;
  }

  return {
    statusCode,
    body: JSON.stringify(response)
  };
};
