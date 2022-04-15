import AWS from 'aws-sdk';
const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

export const handler = async message => {
  // Log the event argument for debugging and for use in local development.
  console.log(JSON.stringify(message, undefined, 2));

  const id = message.pathParameters.id;
  let statusCode;
  let response;

  try {
    const dynamoParams = {
      TableName: process.env.TABLE_NAME,
      Key: { id }
    };

    const { Item } = await dynamodb.get(dynamoParams).promise();
    // Item does not exist in the dynamoDB table
    if (!Item) {
      throw new Error('An item with that id does not exist');
    }
    console.log(`Item ${Item.id} exists in the system`);

    const bucketParams = {
      Bucket: process.env.BUCKET_NAME,
      Key: `${Item.id}.mp3`
    };

    await s3.deleteObject(bucketParams).promise();
    console.log(`SUCCESS DELETING ${Item.id}.mp3 OBJECT IN S3`);

    await dynamodb.delete(dynamoParams).promise();
    console.log(`SUCCESS DELETING ${Item.id} FROM DYNAMODB`);

    response = JSON.stringify('Success deleting item');
  } catch (err) {
    console.log(`AN ERROR OCURRED: ${JSON.stringify(err.message, undefined, 2)}`);
    statusCode = err.statusCode || 500;

    if (err.message === 'An item with that id does not exist') {
      statusCode = 404;
    }
    response = {
      statusCode,
      body: JSON.stringify(err.message)
    };
  }

  return response;
};
