const uuid = require('uuid/v4');
const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async message => {
  console.log('CreateNewFile invoked  with  message: ', message);

  const id = uuid();
  const data = JSON.parse(message.body);
  const text = data.text;
  const voice = data.voice || 'Matthew';

  const params = {
    TableName: process.env.TABLE_NAME,
    Item: {
      id,
      text,
      voice,
      status: 'PROCESSING'
    }
  };

  console.log(`Adding file metadata to table ${process.env.TABLE_NAME}`);

  try {
    await dynamodb.put(params).promise();
    console.log('Item successfully added to the table  ', params);
  } catch (err) {
    console.log('An error occurred adding to the table: ', err);
  }

  const lambda = new AWS.Lambda();
  let response;

  try {
    response = await lambda.invoke({
      FunctionName: process.env.FUNCTION_NAME,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({ id, voice, text })
    }).promise();

    console.log('ConvertToAudio function invoke response: ', response);
  } catch (err) {
    console.log('An error occurred when invoking ConvertToAudio function: ', err);
  }

  return JSON.parse(response.Payload);
};
