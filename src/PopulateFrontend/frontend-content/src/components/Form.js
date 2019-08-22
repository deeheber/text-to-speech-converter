import React from 'react';

import '../styles/Form.css';

function Form (props) {
  return (
    <div className='formContainer'>
      <form onSubmit={props.onSubmit}>
        {/* TODO: dynamically generate these */}
        <select name='voice' value={props.formData.voice} onChange={props.onChange}>
          <option value=''>Select voice</option>
          <option value='Matthew'>Matthew</option>
          <option value='Ivy'>Ivy</option>
          <option value='Joanna'>Joanna</option>
          <option value='Kendra'>Kendra</option>
          <option value='Kimberly'>Kimberly</option>
          <option value='Salli'>Salli</option>
          <option value='Joey'>Joey</option>
          <option value='Justin'>Justin</option>
        </select>
        <textarea name='text' value={props.formData.text} onChange={props.onChange} />
        <button type='submit' className='submitButton'>Submit</button>
        <span className='messageText'>{props.message}</span>
      </form>
    </div>
  );
}

export default Form;
