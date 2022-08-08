import { useReducer, useState, useEffect } from 'react';
import API from '@aws-amplify/api';
import Form from './Form';
import Table from './Table';

import '../styles/App.css';

import config from '../config';
API.configure({
  endpoints: [
    {
      name: 'backend',
      endpoint: config.backendAPI
    }
  ]
});

function rowsReducer(state, action) {
  switch (action.type) {
    case 'list':
      return action.payload;
    case 'add':
      return [action.payload, ...state];
    case 'remove':
      const rowIndex = state.findIndex((row) => row.id === action.payload.id);
      if (rowIndex < 0) {
        throw new Error(`Row with id ${action.payload.id} does not exist!`);
      }

      return [...state.slice(0, rowIndex), ...state.slice(rowIndex + 1)];
    default:
      throw new Error();
  }
}

function App () {
  const [rows, setRows] = useReducer(rowsReducer, []);
  const [isLoading, setIsLoading] = useState(true);
  const [voiceList, setVoiceList] = useState([]);
  const [formData, setFormData] = useState({ voice: '', text: '', message: '' });

  useEffect(() => {
    // Prevent setting data from happening more than once
    let isSubscribed = true;

    const loadSpeechList = async () => {
      const { Items } = await API.get('backend', '/file');
      return Items;
    };
    const loadVoiceList = async () => {
      const { Voices } = await API.get('backend', '/voices');
      return Voices;
    }

    if (isSubscribed === true) {
      // Should only on on initial page load
      Promise.all([loadSpeechList(), loadVoiceList()])
        .then(([rowsRes, voiceRes]) => {
          setRows({ type: 'list', payload: rowsRes });
          setVoiceList(voiceRes);
          setIsLoading(false);
        })
        .catch(err => {
          console.error(err);
          setIsLoading(false);
        });
    }

    return () => isSubscribed = false;
  }, []);

  async function handleDelete (id) {
    const deleteConfirm = window.confirm('Do you really want to delete?');
    if (!deleteConfirm) {
      return;
    }
  
    try {
      await API.del('backend', `/file/${id}`);
      setRows({ type: 'remove', payload: { id }})
    } catch (err) {
      alert(`An error occurred: ${err.message}`);
      console.error(err);
    }
  }

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
      <div className='container'>
        <h1>Text to speech converter</h1>
        <Form
          onSubmit={handleSubmit}
          onChange={handleChange}
          formData={formData}
          voiceList={voiceList}
        />
        <Table
          rows={rows}
          onDelete={handleDelete}
          isLoading={isLoading}
        />
      </div>
    );
}

export default App;
