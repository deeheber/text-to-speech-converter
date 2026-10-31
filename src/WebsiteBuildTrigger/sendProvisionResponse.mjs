import { request } from 'node:https';

export const sendProvisionResponse = async (
  physicalResourceId,
  attributes,
  status,
  message,
  reason,
) => {
  let deadline;

  return new Promise((resolve, reject) => {
    const responseUrl = new URL(message.ResponseURL);
    const response = {
      Status: status,
      Reason: reason,
      PhysicalResourceId: physicalResourceId,
      StackId: message.StackId,
      RequestId: message.RequestId,
      LogicalResourceId: message.LogicalResourceId,
      Data: attributes || {},
    };

    console.log(
      `Sending response back to CloudFormation: ${JSON.stringify(response, null, 2)}`,
    );

    const req = request(responseUrl, { method: 'PUT' }, (res) => {
      res.resume();

      if (res.statusCode === 200) {
        resolve();
      } else {
        reject(
          new Error(
            `Bad response from CloudFormation Response URL: ${res.statusCode}`,
          ),
        );
      }
    });

    req.on('error', (err) => {
      reject(
        new Error(
          `Error while sending response to CloudFormation: ${err.message}`,
        ),
      );
    });

    deadline = setTimeout(() => {
      reject(
        new Error('Timed out sending response to CloudFormation after 10000ms'),
      );
      req.destroy();
    }, 10000);

    req.end(JSON.stringify(response));
  }).finally(() => clearTimeout(deadline));
};
