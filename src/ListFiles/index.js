import AWS from 'aws-sdk';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

export const handler = async message => {
  console.log('Get file invoked with message: ', message);

  let response;
  let statusCode;

  const listParams = {
    TableName: process.env.TABLE_NAME,
    Select: 'ALL_ATTRIBUTES'
  };

  try {
    const dyanmodbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
    const ddbDocClient = DynamoDBDocumentClient.from(dyanmodbClient);
    /* TODO: add looping with `ExclusiveStartKey` and `LastEvaluatedKey` for larger tables */
    const { Items } = await ddbDocClient.send(new ScanCommand(listParams));
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

  return response;
};
