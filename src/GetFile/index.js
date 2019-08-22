const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async message => {
  console.log('Get file invoked with message: ', message);

  let response;
  let statusCode;

  // determine if we're getting a single  file or returning all of them
  if (message.queryStringParameters !== null && 'id' in message.queryStringParameters) {
    const listParams = {
      TableName: process.env.TABLE_NAME,
      Key: { id: message.queryStringParameters.id }
    };

    try {
      response = await dynamodb.get(listParams).promise();
      statusCode = 200;
    } catch (err) {
      console.log('An error occurred pulling from the table: ', err);
      response = err.message;
      statusCode = err.statusCode;
    }
  } else {
    const getParams = {
      TableName: process.env.TABLE_NAME,
      Select: 'ALL_ATTRIBUTES'
    };

    try {
      response = await dynamodb.scan(getParams).promise();
      statusCode = 200;
    } catch (err) {
      console.log('An error occurred scanning the table: ', err);
      response = err.message;
      statusCode = err.statusCode;
    }
  }

  return {
    statusCode,
    headers: {
      'Access-Control-Allow-Credentials': true,
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify(response)
  };
};
