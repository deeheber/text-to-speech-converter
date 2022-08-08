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

  useEffect(() => {
    // Make sure the API is only called on initial page load
    let isSubscribed = true;

    const loadSpeechList = async () => {
      const { Items } = await API.get('backend', '/file');
      return Items;
    };

    if (isSubscribed === true) {
      loadSpeechList()
        .then(rowsRes => {
          setRows({ type: 'list', payload: rowsRes });
          setIsLoading(false);
        })
        .catch(err => {
          console.error(err);
          setIsLoading(false);
        });
    }

    return () => isSubscribed = false;
  }, []);

    return (
      <div className='container'>
        <h1>Text to speech converter</h1>
        <Form
          API={API}
          setIsLoading={setIsLoading}
          setRows={setRows}
        />
        <Table
          API={API}
          rows={rows}
          isLoading={isLoading}
          setRows={setRows}
        />
      </div>
    );
}

export default App;
