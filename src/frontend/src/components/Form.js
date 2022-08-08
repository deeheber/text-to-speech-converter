import { useEffect, useState } from 'react';
import '../styles/Form.css';

function Form ({ API, setIsLoading, setRows }) {
  const [formData, setFormData] = useState({ voice: '', text: '', message: '' });
  const [voiceList, setVoiceList] = useState([]);

  useEffect(() => {
    // Prevent setting data from happening more than once
    let isSubscribed = true;

    const loadVoiceList = async () => {
      const { Voices } = await API.get('backend', '/voices');
      return Voices;
    }

    if (isSubscribed === true) {
      // Should only on on initial page load
      loadVoiceList()
        .then(voiceRes => {
          setVoiceList(voiceRes);
          setIsLoading(false);
        })
        .catch(err => {
          console.error(err);
          setIsLoading(false);
        });
    }

    return () => isSubscribed = false;
  }, [API, setIsLoading]);

  function handleChange (event) {
    setFormData({
      ...formData,
      [event.target.name]: event.target.value
    });
  }

  async function handleSubmit (event) {
    event.preventDefault();
  
    if (formData.text.trim() === '') {
      // Render validation error message
      setFormData({ ...formData, message: 'Please enter some text before submitting'});
      return;
    }
  
    setFormData({ ...formData, message: 'Loading...' });
  
    try {
      const newRow = await API.post('backend', '/file', { body: formData });
      // Add result to the rows
      setRows({ type: 'add', payload: newRow });
      // Clear the form
      setFormData({ voice: '', text: '', message: '' });
    } catch (err) {
      setFormData({ ...formData, message: `An error occurred: ${err.message}` });
      console.error(err);
    }
  }

  return (
    <div className='formContainer'>
      <form onSubmit={handleSubmit}>
        <select name='voice' value={formData.voice} onChange={handleChange}>
          <option value=''>Select voice</option>
          {
            voiceList.map(voice => <option value={voice.Id} key={voice.Id}>{voice.Name}</option>)
          }
        </select>
        <textarea name='text' value={formData.text} onChange={handleChange} />
        <button type='submit' className='submitButton'>Submit</button>
        <span className='messageText'>{formData.message}</span>
      </form>
    </div>
  );
}

export default Form;
