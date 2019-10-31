const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async message => {
  console.log('Get file invoked with message: ', message);

  let response;
  let statusCode;

  const listParams = {
    TableName: process.env.TABLE_NAME,
    Select: 'ALL_ATTRIBUTES'
  };

  try {
    // TODO add looping with `ExclusiveStartKey` and `LastEvaluatedKey` for larger tables
    response = await dynamodb.scan(listParams).promise();
    statusCode = 200;
  } catch (err) {
    console.log('An error occurred scanning the table: ', err);
    response = err.message;
    statusCode = err.statusCode || 500;
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
