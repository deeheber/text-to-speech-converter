const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async message => {
  console.log('Get file invoked with message: ', message);

  let response;
  let statusCode;

  // determine if we're getting a single  file or returning all of them
  if (message.queryStringParameters !== null && 'id' in message.queryStringParameters) {
    let params = {
      TableName: process.env.TABLE_NAME,
      Key: { id: message.queryStringParameters.id }
    };

    try {
      response = await dynamodb.query(params).promise();
      statusCode = 200;
    } catch (err) {
      console.log('An error occurred pulling from the table: ', err);
      response = err.message;
      statusCode = err.statusCode;
    }
  } else {
    let params = {
      TableName: process.env.TABLE_NAME,
      Select: 'ALL_ATTRIBUTES'
    };

    try {
      response = await dynamodb.scan(params).promise();
      statusCode = 200;
    } catch (err) {
      console.log('An error occurred scanning the table: ', err);
      response = err.message;
      statusCode = err.statusCode;
    }
  }

  return {
    statusCode,
    headers: {},
    body: JSON.stringify(response)
  };
};
