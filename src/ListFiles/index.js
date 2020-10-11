const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

const Libhoney = require('libhoney');
const hny = new Libhoney({
  writeKey: process.env.HONEYCOMB_KEY,
  dataset: 'text-to-speech-converter'
});

exports.handler = async (message, context) => {
  console.log('Get file invoked with message: ', message);
  const startTime = Date.now();

  let response;
  let statusCode;

  const listParams = {
    TableName: process.env.TABLE_NAME,
    Select: 'ALL_ATTRIBUTES'
  };

  try {
    /* TODO: add looping with `ExclusiveStartKey` and `LastEvaluatedKey` for larger tables */
    const { Items } = await dynamodb.scan(listParams).promise();
    console.log('ORIGINAL RESULTS FROM DB ', Items);
    /* TODO: Figure out if there's a way to sort scan results from dynamo
    * Initial search showed this may not be an option and/or is hard to implement
    */
    const sortedItems = Items.sort((a, b) => b.createdAt - a.createdAt);
    console.log('SORTED RESULTS FROM DB ', sortedItems);
    response = JSON.stringify({ Items: sortedItems });
  } catch (err) {
    console.log('An error occurred scanning the table: ', err);
    statusCode = err.statusCode || 500;
    response = {
      statusCode,
      body: JSON.stringify(err.message)
    };
  }

  const ev = hny.newEvent();
  ev.add({
    message: 'Hello from ListFiles',
    functionName: context.functionName,
    functionVersion: context.functionVersion,
    requestId: context.awsRequestId,
    latencyMs: Date.now() - startTime,
    didError: response.statusCode >= 400
  });
  ev.send();

  return response;
};
