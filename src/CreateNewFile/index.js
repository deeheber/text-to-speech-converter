const uuid = require('uuid/v4');
const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async message => {
  console.log(`CreateNewFile invoked  with  message: ${message}`);

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
    console.log(`An error occurred: ${err.message}`);
  }

  console.log(`Metadata added to table, done`);

  const lambda = new AWS.Lambda();
  const payload = JSON.stringify({ id });

  lambda.invoke({
    FunctionName: process.env.FUNCTION_NAME,
    Payload: payload
  });
};
