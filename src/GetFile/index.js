const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async message => {
  console.log(`Get file invoked with message: ${JSON.stringify(message, null, 2)}`);

  const queryStringParameters = JSON.parse(message.queryStringParameters);
  let id = false;

  if (queryStringParameters && 'id' in queryStringParameters) {
    id = message.queryStringParameters.id;
  }

  let response;

  // determine if we're getting a single  file or returning all of them
  if (id) {
    let params = {
      TableName: process.env.TABLE_NAME,
      Key: { id }
    };

    try {
      response = await dynamodb.query(params).promise();
    } catch (err) {
      console.log(`An error occurred pulling from the table: ${err.message}`);
    }
  } else {
    let params = {
      TableName: process.env.TABLE_NAME,
      Select: 'ALL_ATTRIBUTES'
    };

    try {
      response = await dynamodb.scan(params).promise();
    } catch (err) {
      console.log(`An error occurred scanning the table: ${err.message}`);
    }
  }

  return {
    statusCode: 200,
    headers: {},
    body: JSON.stringify(response)
  };
};
