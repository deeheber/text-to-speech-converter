exports.handler = async message => {
  // TODO: Add permission to polly:SynthesizeSpeech
  /*
    Get the file information from the Table
    Divide the file text into sections of 1000 characters (store in an array)
    Loop through the array for each item
      Send to synthesize the speech in Polly with output format of mp3
      Save the synthesized speech to /tmp/fileId
    Upload the /tmp/fileId to the FileStore bucket
    Update the item in dynamoDB Table to have the URL to the file in S3 and the status to COMPLETE
  */
  console.log(`ConvertToAudio invoked with message: ${JSON.stringify(message, null, 2)}`);

  return {
    statusCode: 200,
    headers: {},
    body: 'File processing complete.'
  };
};
