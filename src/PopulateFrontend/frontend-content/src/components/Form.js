import React from 'react';

import '../styles/Form.css';

function Form (props) {
  return (
    <div className='formContainer'>
      <form onSubmit={props.onSubmit}>
        <select name='voice' value={props.formData.voice} onChange={props.onChange}>
          <option value=''>Select voice</option>
          {
            props.voiceList.map(voice => <option value={voice.Id} key={voice.Id}>{voice.Name}</option>)
          }
        </select>
        <textarea name='text' value={props.formData.text} onChange={props.onChange} />
        <button type='submit' className='submitButton'>Submit</button>
        <span className='messageText'>{props.message}</span>
      </form>
    </div>
  );
}

export default Form;
