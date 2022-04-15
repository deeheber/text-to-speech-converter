import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export const handler = async message => {
  // Log the event argument for debugging and for use in local development.
  console.log(JSON.stringify(message, undefined, 2));

  const id = message.pathParameters.id;
  let statusCode;
  let response;

  try {
    const dyanmodbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
    const ddbDocClient = DynamoDBDocumentClient.from(dyanmodbClient);

    const dynamoParams = {
      TableName: process.env.TABLE_NAME,
      Key: { id }
    };

    const { Item } = await ddbDocClient.send(
      new GetCommand(dynamoParams)
    );
    // Item does not exist in the dynamoDB table
    if (!Item) {
      throw new Error('An item with that id does not exist');
    }
    console.log(`Item ${Item.id} exists in the system`);

    const s3Client = new S3Client({ region: process.env.AWS_REGION });
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: process.env.BUCKET_NAME,
        Key: `${Item.id}.mp3`
      })
    );
    console.log(`SUCCESS DELETING ${Item.id}.mp3 OBJECT IN S3`);

    await ddbDocClient.send(new DeleteCommand(dynamoParams));
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
