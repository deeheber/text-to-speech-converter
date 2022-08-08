# text-to-speech-converter

## Summary
This is an application that takes in text and outputs an audio file of that text. Written with US-English in mind, so it might not convert as expected for other languages.

My deployed version [here](http://text-to-speech-frontend.s3-website-us-west-2.amazonaws.com/). Feel free to add your own things to convert to audio, download files, and delete files.

### Technologies Used
- [Node](https://nodejs.org/)
- [ReactJS](https://reactjs.org/)
- [AWS](https://aws.amazon.com/)
  - [AWS SAM](https://aws.amazon.com/serverless/sam/)
  - CloudFormation
  - S3
  - API Gateway (HTTP API)
  - Lambda
  - DynamoDB
  - Polly
  - CodeBuild

### Architecture Diagram

![text-to-speech-architecture](https://user-images.githubusercontent.com/12616554/156626768-d509d604-b52f-42e5-9600-e8b2fe588ca7.png)


### Directions To Run
1. Clone this repo (note: this script is designed to work with public Github repos, it might possibly also work with public Bitbucket and public Gitlab repos, but it hasn't been tested)
2. Deploy the stack via the AWS SAM CLI. Getting started directions [here](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html). TL;DR run [`sam build`](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-cli-command-reference-sam-build.html) and [`sam deploy --guided`](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-cli-command-reference-sam-deploy.html).
3. Navigate to the url for your frontend. It'll be in the CloudFormation stack Outputs...should be something like: `http://{your stack name}-frontend.s3-website-{your region}.amazonaws.com/`

### Backend API Endpoints
#### GET /voices
Populates the voices dropdown list

#### GET /file
Gets all files and fills the table with existing text to speech conversations

#### DELETE /file/{id}
Deletes a file

#### POST /file
Creates a new text to speech conversion

### Running the Frontend Locally against a Deployed Backend
1. Deploy the app
2. `cd src/frontend` && `npm install`
3. create a new file under `src/frontend/src` and name it `config.js`. Find you ApiURL from the CloudFormation stack Outputs...should look something like `https://6wpbpyxfgf.execute-api.us-east-1.amazonaws.com`. Add the following to the file
  ```
  const apiRef =  {
    backendAPI: 'Add your backend API URL here'
  };

  export default apiRef;
  ```
4. `npm start`

### Known Limitations For Larger Requests
- Lambda has [limits](https://docs.aws.amazon.com/lambda/latest/dg/limits.html) for the `/tmp` directory storage. Currently the template is set to the default value which is 512mb. For an extra cost, you can up this value by adding the [EphemeralStorage](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-resource-function.html#sam-function-ephemeralstorage) property with the storage value that you want to the `CreateNewFile` function.
- Pagination is not in place for `ListFiles`, but you probably don't want to scan a very very large dynamoDB table and return all the results anyway bc it can get very $$$.

### Outstanding TODO Items / Open Bugs
See [open issues](https://github.com/deeheber/text-to-speech-converter/issues)

### Logging Issues
If you find a bug or have a question, feel free to open a new issue and our maintainers will reply as soon as they possibly can. Please describe the issue including steps to reproduce if there are any.

### Pull Request Process
1. Fork the respository
2. Make any changes you'd like
3. Open a new PR against `main` with a description of the proposed changes as well as any other information you find relevant.
4. If your PR fixes an open issue be sure to write `fixes #[ issue number here ]`

### Finding Help
Please send a direct message to [@deeheber on Twitter](https://twitter.com/deeheber) if any of your questions have not been addressed by the documentation in this repository.
