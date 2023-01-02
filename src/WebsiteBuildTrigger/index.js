import { CodeBuildClient, StartBuildCommand } from "@aws-sdk/client-codebuild";

import { sendProvisionResponse } from './sendProvisionResponse.mjs';

export const handler = async event => {
  console.log(JSON.stringify(event, undefined, 2));

  if (event.RequestType) {
    // Custom resource trigger
    const failureResponse = {
      Status: 'FAILED',
      Reason: 'Manually cancelled',
      PhysicalResourceId: event.PhysicalResourceId || 'resource',
      StackId: event.StackId,
      RequestId: event.RequestId,
      LogicalResourceId: event.LogicalResourceId
    };

    console.log('To forcibly fail this provision, execute this cURL command:');
    console.log(`curl -X PUT '${event.ResponseURL}' -H 'Content-Type:' -d '${JSON.stringify(failureResponse)}'`);

    switch (event.RequestType) {
      case 'Create':
      case 'Update':
        return startCodeBuild(event);
  
      case 'Delete':
        return sendProvisionResponse(event.PhysicalResourceId, null, 'SUCCESS', event);
  
      default:
        console.log(`Unhandled event.RequestType: ${event.RequestType}, manually cancel using curl command above`);
        return;
    }
  } else if (event.source === 'aws.codebuild') {
    // EventBridge CodeBuild Events
    return handleCodeBuildEvent(event);
  } else {
    // Unhandled Lambda invoke event (should not happen, but here just in case)
    console.log(`Invalid event type '${JSON.stringify(event, undefined, 2)}'`);
  }
};

const startCodeBuild = async message => {
  try {
    const input = {
      projectName: message.ResourceProperties.ProjectName,
      timeoutInMinutesOverride: 15,
      environmentVariablesOverride: [
        {
          name: 'CFN_STACK_ID',
          value: message.StackId
        },
        {
          name: 'CFN_REQUEST_ID',
          value: message.RequestId
        },
        {
          name: 'CFN_LOGICAL_ID',
          value: message.LogicalResourceId
        },
        {
          name: 'CFN_RESPONSE_URL',
          value: message.ResponseURL
        },
        {
          name: 'SOURCE_VERSION',
          value: message.ResourceProperties.SourceVersion
        }
      ]
    };

    const client = new CodeBuildClient({ region: process.env.AWS_REGION });
    const command = new StartBuildCommand(input);

    await client.send(command);
  } catch (err) {
    const msg = `Failed to start CodeBuild project: ${err.message}`;
    console.log(msg);
    return sendProvisionResponse(message.PhysicalResourceId || 'resource', null, 'FAILED', message, msg);
  }
};

const handleCodeBuildEvent = async message => {
  const detail = message.detail;
  const projectName = detail['project-name'];
  const buildId = detail['build-id'].split('/')[1];
  const consoleLink = `https://${process.env.AWS_REGION}.console.aws.amazon.com/codesuite/codebuild/projects/${projectName}/build/${buildId}/log?region=${process.env.AWS_REGION}`;

  // Organize env vars in a more consumable format
  const environmentVariables = detail['additional-information'].environment['environment-variables'];
  const map = {};
  for (let i = 0; i < environmentVariables.length; i++) {
    const item = environmentVariables[i];
    const name = item.name;
    const value = item.value;
    map[name] = value;
  }

  const body = {
    ResponseURL: map.CFN_RESPONSE_URL,
    StackId: map.CFN_STACK_ID,
    LogicalResourceId: map.CFN_LOGICAL_ID,
    RequestId: map.CFN_REQUEST_ID
  };

  let missingCFParams = false;

  try {
    if (!map.CFN_RESPONSE_URL || !map.CFN_STACK_ID || !map.CFN_LOGICAL_ID || !map.CFN_REQUEST_ID) {
      missingCFParams = true;
      throw new Error('Missing Cloudformation params, can\'t send response to CF.');
    }

    switch (detail['build-status']) {
      case 'SUCCEEDED':
        return sendProvisionResponse(map.SOURCE_VERSION, null, 'SUCCESS', body);

      case 'FAULT':
      case 'TIMED_OUT':
      case 'FAILED':
      case 'STOPPED':
        return sendProvisionResponse(map.SOURCE_VERSION, null, 'FAILED', body, `Failed to publish site, see ${consoleLink}`);
      default:
        throw new Error(`Unrecognized build status: ${detail['build-status']}`);
    }
  } catch (error) {
    console.log(`Failed to handle CodeBuild event: ${error.message}`);

    if (missingCFParams) {
      // CFParams are missing, so we can't talk to CloudFormation anyway. Ignore.
      return;
    } else {
      return sendProvisionResponse(
        map.SOURCE_VERSION || 'resource',
        null,
        'FAILED',
        body,
        error.message
      );
    }
  }
};
