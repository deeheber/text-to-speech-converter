const uuid = require('uuid/v4');
const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async message => {
  console.log(`CreateNewFile invoked  with  message: ${message}`);

  const id = uuid();

  const params = {
    TableName: process.env.TABLE_NAME,
    Item: {
      id,
      text: JSON.parse(message.text),
      voice: JSON.parse(message.voice),
      status: 'PROCESSING'
    }
  };

  console.log(`Adding file metadata to table ${process.env.TABLE_NAME}`);
  await dynamodb.put(params).promise();
  console.log(`Metadata added to table, done`);

  const lambda = new AWS.Lambda();

  lambda.invoke({
    FunctionName: process.env.FUNCTION_NAME,
    Payload: JSON.stringify({ id })
  });
};
