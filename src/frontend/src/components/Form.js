import { useEffect, useState } from 'react';
import { get, post } from 'aws-amplify/api';
import '../styles/Form.css';

function Form({ setIsLoading, setRows }) {
  const [formData, setFormData] = useState({
    voice: '',
    text: '',
    message: '',
  });
  const [voiceList, setVoiceList] = useState([]);

  useEffect(() => {
    // Prevent setting data from happening more than once
    let isSubscribed = true;

    const loadVoiceList = async () => {
      const getOperation = get({ apiName: 'backend', path: '/voices' });
      return getOperation.response;
    };

    if (isSubscribed === true) {
      // Should only on on initial page load
      loadVoiceList()
        .then((voiceListPromise) => voiceListPromise.body.json())
        .then(({ Voices }) => {
          setVoiceList(Voices);
          setIsLoading(false);
        })
        .catch((err) => {
          console.error(err);
          setIsLoading(false);
        });
    }

    return () => (isSubscribed = false);
  }, [setIsLoading]);

  function handleChange(event) {
    setFormData({
      ...formData,
      [event.target.name]: event.target.value,
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (formData.text.trim() === '') {
      // Render validation error message
      setFormData({
        ...formData,
        message: 'Please enter some text before submitting',
      });
      return;
    }

    setFormData({ ...formData, message: 'Loading...' });

    try {
      const newRowRequest = post({
        apiName: 'backend',
        path: '/file',
        options: { body: formData },
      });
      const newRowResponse = await newRowRequest.response;
      const newRow = await newRowResponse.body.json();
      // Add result to the rows
      setRows({ type: 'add', payload: newRow });
      // Clear the form
      setFormData({ voice: '', text: '', message: '' });
    } catch (err) {
      setFormData({
        ...formData,
        message: `An error occurred: ${err.message}`,
      });
      console.error(err);
    }
  }

  return (
    <div className="formContainer">
      <form onSubmit={handleSubmit}>
        <select name="voice" value={formData.voice} onChange={handleChange}>
          <option value="">Select voice</option>
          {voiceList.map((voice) => (
            <option value={voice.Id} key={voice.Id}>
              {voice.Name}
            </option>
          ))}
        </select>
        <textarea name="text" value={formData.text} onChange={handleChange} />
        <button type="submit" className="submitButton">
          Submit
        </button>
        <span className="messageText">{formData.message}</span>
      </form>
    </div>
  );
}

export default Form;
