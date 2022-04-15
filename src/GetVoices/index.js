import { PollyClient, DescribeVoicesCommand } from "@aws-sdk/client-polly";

export const handler = async message => {
  // Log the event argument for debugging and for use in local development.
  console.log(JSON.stringify(message, undefined, 2));
  let response;
  let statusCode;

  try {
    const client = new PollyClient({ region: process.env.AWS_REGION });
    const command = new DescribeVoicesCommand({
      Engine: 'standard',
      LanguageCode: 'en-US'
    });
    response = await client.send(command);
  } catch (err) {
    console.log(`AN ERROR OCURRED: ${JSON.stringify(err.message, undefined, 2)}`);
    statusCode = err.statusCode || 500;
    response = {
      statusCode,
      body: JSON.stringify(err.message)
    };
  }
  console.log(response.Voices.length);
  return response;
};
