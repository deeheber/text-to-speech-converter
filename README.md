# text-to-speech-converter

## Summary
This is an application that takes in text and outputs an audio file of that text.

### Technologies Used
- [Stackery](https://www.stackery.io/)
- [AWS](https://aws.amazon.com/)
  - S3
  - API Gateway
  - Lambda
  - DynamoDB
  - Polly
- [Node](https://nodejs.org/en/)

### Directions To Run
1. Fork this repo
2. Login to Stackery > create a new stack > Use existing repo > Plug in the url for your forked version of the code
3. Deploy the stack (will need to add an evironment first if you haven't prior)
4. [Invoke the URLs from API Gateway](https://docs.aws.amazon.com/apigateway/latest/developerguide/how-to-call-api.html)
(Polly isn't supported by CloudFormation...might need to login to create something via the console, but doubtful...leaving this here as a note to myself)

### Outstanding TODO Items
- [ ] Add Polly permission to `ConvertToAudio` function
- [ ] Write function code
- [ ] More granular permissions on functions, the table, and S3 buckets
- [ ] Write frontend code
- [ ] Lockdown the API gateway calls to just be invoked from the Frontend S3 bucket
- [ ] Might need to enable cors on either the API gateway and/or on the bucket(s) (unsure)
- [ ] Add directions on how to upload the frontend code to S3 to this README

### Logging Issues
If you find a bug or have a question, feel free to open a new issue and our maintainers will reply as soon as they possibly can. Please describe the issue including steps to reproduce if there are any.

### Pull Request Process
1. Fork the respository
2. Make any changes you'd like
3. Open a new PR against `master` with a description of the proposed changes as well as any other information you find relevant.
4. If your PR fixes an open issue be sure to write `fixes #[ issue number here ]`

### Finding Help
Please send a direct message to [@deeheber on Twitter](https://twitter.com/deeheber) if any of your questions have not been addressed by the documentation in this repository.
