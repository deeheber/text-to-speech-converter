import { PollyClient, DescribeVoicesCommand } from '@aws-sdk/client-polly';

export const handler = async (message) => {
  console.log('GetVoices invoked', {
    requestId: message.requestContext?.requestId,
    routeKey: message.routeKey,
  });

  let response;
  let statusCode;

  try {
    const client = new PollyClient({ region: process.env.AWS_REGION });
    const command = new DescribeVoicesCommand({
      Engine: 'standard',
      LanguageCode: 'en-US',
    });

    response = await client.send(command);
    console.log(response.Voices.length);
  } catch (err) {
    console.log(
      `AN ERROR OCURRED: ${JSON.stringify(err.message, undefined, 2)}`,
    );
    statusCode = err.statusCode || 500;
    response = {
      statusCode,
      body: JSON.stringify(err.message),
    };
  }

  return response;
};
