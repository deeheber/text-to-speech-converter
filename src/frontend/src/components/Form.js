import '../styles/Form.css';

function Form ({ formData, onChange, onSubmit, voiceList }) {
  return (
    <div className='formContainer'>
      <form onSubmit={onSubmit}>
        <select name='voice' value={formData.voice} onChange={onChange}>
          <option value=''>Select voice</option>
          {
            voiceList.map(voice => <option value={voice.Id} key={voice.Id}>{voice.Name}</option>)
          }
        </select>
        <textarea name='text' value={formData.text} onChange={onChange} />
        <button type='submit' className='submitButton'>Submit</button>
        <span className='messageText'>{formData.message}</span>
      </form>
    </div>
  );
}

export default Form;
