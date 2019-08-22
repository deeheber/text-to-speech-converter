# text-to-speech-converter

## Summary
This is an application that takes in text and outputs an audio file of that text.

### Technologies Used
- [Stackery](https://www.stackery.io/)
- [AWS](https://aws.amazon.com/)
  - [AWS SAM](https://aws.amazon.com/serverless/sam/)
  - CloudFormation
  - S3
  - API Gateway
  - Lambda
  - DynamoDB
  - Polly
- [Node](https://nodejs.org/en/)
- [ReactJS](https://reactjs.org/)

![Setup](https://user-images.githubusercontent.com/12616554/55670972-6445f100-583f-11e9-9e4e-4c62a7422884.png)

### Directions To Run
1. Clone this repo
2. Import and deploy the stack via Stackery. Getting started directions [here](https://docs.stackery.io/docs/using-stackery/introduction/). TL;DR sign up for free account > create a stack and an environment > deploy.
3. [Invoke the URLs from API Gateway](https://docs.aws.amazon.com/apigateway/latest/developerguide/how-to-call-api.html)...could also use something like [Postman](https://www.getpostman.com/) if you prefer. ([Frontend Coming Soon](https://github.com/deeheber/text-to-speech-converter/issues/5))

### Known Limitations For Larger Requests
- There's a [maximum item size](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Limits.html#limits-items) in DynamoDB (includes all keys/values), so this can't go beyond that. [Issue here](https://github.com/deeheber/text-to-speech-converter/issues/11)
- Lambda has [limits](https://docs.aws.amazon.com/lambda/latest/dg/limits.html) for the invocation payload and `/tmp` directory storage. [Issue here](https://github.com/deeheber/text-to-speech-converter/issues/12)
- Written with US-English in mind, so it might not convert as expected for other languages.

### Outstanding TODO Items / Open Bugs
See [open issues](https://github.com/deeheber/text-to-speech-converter/issues)

### Logging Issues
If you find a bug or have a question, feel free to open a new issue and our maintainers will reply as soon as they possibly can. Please describe the issue including steps to reproduce if there are any.

### Pull Request Process
1. Fork the respository
2. Make any changes you'd like
3. Open a new PR against `master` with a description of the proposed changes as well as any other information you find relevant.
4. If your PR fixes an open issue be sure to write `fixes #[ issue number here ]`

### Finding Help
Please send a direct message to [@deeheber on Twitter](https://twitter.com/deeheber) if any of your questions have not been addressed by the documentation in this repository.
