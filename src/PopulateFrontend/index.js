const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const { sendSuccess, sendFailure } = require('cfn-custom-resource');
const fs = require('fs');
const mime = require('mime-types');
const path = require('path');
const recursiveReaddir = require('recursive-readdir');

exports.handler = async message => {
  // Log the event argument for debugging and for use in local development.
  console.log(JSON.stringify(message, undefined, 2));

  try {
    await sendSuccess('PopulateFrontend', {}, message);

    // TODO:
    // - Grab the api url and create a config file
    // - npm install and npm build
    // - Upload the built files with the config to s3

    await uploadContent();
  } catch (err) {
    console.error('Failed to upload site content:');
    console.error(err);

    await sendFailure(err.message, message);
    throw err;
  }

  async function uploadContent () {
    // TODO ignore config file
    const files = await recursiveReaddir('frontend-content/build');

    const promises = files.map(file => s3.putObject({
      Bucket: process.env.BUCKET_NAME,
      Key: path.relative('frontend-content/build', file),
      Body: fs.createReadStream(file),
      ContentType: mime.lookup(file) || 'application/octet-stream',
      ACL: 'public-read'
    }).promise());

    await Promise.all(promises);
  }
};
