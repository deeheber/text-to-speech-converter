# Description
This function is a custom resource that is triggered by CloudFormation on every deploy where the properties change. It's primary job is to start the CodeBuild job that clones the git repo, builds the JavaScript files, and puts those built files into S3. It also receives CodeBuild events via EventBridge to notify CloudFormation if the build succeeded or not.

## Entry Points
- Custom resource triggered by CloudFormation
- EventBridge event from the CodeBuild job notifying if the build succeeded

## Notes
The [recommended cfn-response module](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/cfn-lambda-function-code-cfnresponsemodule.html) up on npm wasn't working for me, so I created my own `sendProvisionResponse.js` file that does what the module should be doing. Sigh, #awswishlist for a working module.
