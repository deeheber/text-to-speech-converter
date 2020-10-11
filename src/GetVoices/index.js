const AWS = require('aws-sdk');
const polly = new AWS.Polly();

const Libhoney = require('libhoney');
const hny = new Libhoney({
  writeKey: process.env.HONEYCOMB_KEY,
  dataset: 'text-to-speech-converter'
});

exports.handler = async (message, context) => {
  // Log the event argument for debugging and for use in local development.
  console.log(JSON.stringify(message, undefined, 2));

  const startTime = Date.now();
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

  const ev = hny.newEvent();
  ev.add({
    message: 'Hello from GetVoices',
    functionName: context.functionName,
    functionVersion: context.functionVersion,
    requestId: context.awsRequestId,
    latencyMs: Date.now() - startTime,
    didError: response.statusCode >= 400
  });
  ev.send();

  return response;
};
