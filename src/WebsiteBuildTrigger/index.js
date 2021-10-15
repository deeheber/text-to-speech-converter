const AWS = require('aws-sdk');
const { sendSuccess, sendFailure } = require('cfn-response');

exports.handler = async event => {
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

    switch (message.RequestType) {
      case 'Create':
      case 'Update':
        return startCodeBuild(event);
  
      case 'Delete':
        return sendSuccess('WebsiteBuildTrigger', {}, event);
  
      default:
        return sendFailure(`Invalid CloudFormation custom resource RequestType '${message.RequestType}'`, event);
    }
  } else if (event.source === 'aws.codebuild') {
    // EventBridge CodeBuild Events
    return handleCodeBuildEvent(event);
  } else {
    // Unhandled Lambda invoke event (should not happen, but here just in case)
    return sendFailure(`Invalid event type '${JSON.stringify(event, undefined, 2)}'`, event);
  }
};

const startCodeBuild = async message => {
  const codebuild = new AWS.CodeBuild();

  try {
    await codebuild.startBuild({
      projectName: message.ResourceProperties.ProjectName,
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
    }).promise();
  } catch (err) {
    return sendFailure(`Failed to start CodeBuild project: ${err.message}`, message);
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
      throw new Error(`Missing Cloudformation params: ${JSON.stringify(body, null, 2)}`);
    }

    switch (detail['build-status']) {
      case 'SUCCEEDED':
        return sendSuccess('WebsiteBuildTrigger', {}, message);

      case 'FAULT':
      case 'TIMED_OUT':
      case 'FAILED':
      case 'STOPPED':
        return sendFailure(`Failed to publish site, see ${consoleLink}`, message);
      default:
        throw new Error(`Unrecognized build status: ${detail['build-status']}`);
    }
  } catch (error) {
    console.log(`Failed to handle CodeBuild event: ${error.message}`);

    if (missingCFParams) {
      // CFParams are missing, so we can't talk to CloudFormation anyway. Ignore.
      return;
    } else {
      return sendFailure(error.message, message);
    }
  }
};
