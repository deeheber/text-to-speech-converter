exports.handler = async message => {
  /*
    Generate a file ID
    Insert a new record into Table
    { id, text, voice, status: 'PROCESSING' }
    Invoke ConvertToAudioLambda (send the file ID
  */
  console.log(message);

  return {};
}
