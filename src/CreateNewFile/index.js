const uuid = require('uuid/v4');
const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async message => {
  console.log(`CreateNewFile invoked  with  message: ${JSON.stringify(message, null, 2)}`);

  const id = uuid();
  const data = JSON.parse(message.body);

  const params = {
    TableName: process.env.TABLE_NAME,
    Item: {
      id,
      text: data.text,
      voice: data.voice,
      status: 'PROCESSING'
    }
  };

  console.log(`Adding file metadata to table ${process.env.TABLE_NAME}`);

  try {
    await dynamodb.put(params).promise();
  } catch (err) {
    console.log(`An error occurred adding to the table: ${err.message}`);
  }

  console.log(`Metadata added to table, done`);

  const lambda = new AWS.Lambda();
  const payload = JSON.stringify({ id });

  try {
    await lambda.invoke({
      FunctionName: process.env.FUNCTION_NAME,
      InvocationType: 'Event',
      Payload: payload
    }).promise();
  } catch (err) {
    console.log(`An error occurred when invoking the second function: ${err.message}`);
  }

  return {
    statusCode: 200,
    headers: {},
    body: 'File processing.'
  };
};
