# Description
This function is a custom resource that is triggered by CloudFormation on every deploy where the properties change. It's primary job is to start the CodeBuild job that clones the git repo, builds the JavaScript files, and puts those built files into S3. It also receives CodeBuild events via EventBridge to notify CloudFormation if the build succeeded or not.

## Entry Points
- Custom resource triggered by CloudFormation
- EventBridge event from the CodeBuild job notifying if the build succeeded
