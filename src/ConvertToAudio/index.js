exports.handler = async message => {
  /*
    Get the file information from the Table
    Divide the file text into sections of 1000 characters (store in an array)
    Loop through the array for each item
      Send to synthesize the speech in Polly with output format of mp3
      Save the synthesized speech to /tmp/fileId
    Upload the /tmp/fileId to the FileStore bucket
    Update the item in dynamoDB Table to have the URL to the file in S3
  */
  console.log(message);

  return {};
}
