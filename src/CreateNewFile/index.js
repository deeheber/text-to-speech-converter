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
    // Pretty unlikely, but stop the program and return an error if there's a dynamo issue
    return {
      statusCode: 500,
      headers: {},
      body: JSON.stringify(err.message)
    };
  }

  const lambda = new AWS.Lambda();
  let response;

  try {
    const lambdaResponse = await lambda.invoke({
      // FunctionName: process.env.FUNCTION_NAME,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({ id, voice, text })
    }).promise();

    console.log('ConvertToAudio function invoke response: ', response);
    response = JSON.parse(lambdaResponse.Payload);
  } catch (err) {
    console.log('An error occurred when invoking ConvertToAudio function: ', err);
    response = {
      statusCode: 500,
      headers: {},
      body: JSON.stringify(err.message)
    };
  }

  return response;
};
