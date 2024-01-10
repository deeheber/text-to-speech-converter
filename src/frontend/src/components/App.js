import { useReducer, useState, useEffect } from 'react';
import { get } from 'aws-amplify/api';
import Form from './Form';
import Table from './Table';

import '../styles/App.css';

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

function App() {
  const [rows, setRows] = useReducer(rowsReducer, []);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Make sure the API is only called on initial page load
    let isSubscribed = true;

    const loadSpeechList = async () => {
      const getOperation = get({ apiName: 'backend', path: '/file' });
      return getOperation.response;
    };

    if (isSubscribed === true) {
      loadSpeechList()
        .then((rowsPromise) => rowsPromise.body.json())
        .then(({ Items }) => {
          setRows({ type: 'list', payload: Items });
          setIsLoading(false);
        })
        .catch((err) => {
          console.error(err);
          setIsLoading(false);
        });
    }

    return () => (isSubscribed = false);
  }, []);

  return (
    <div className="container">
      <h1>Text to speech converter</h1>
      <Form setIsLoading={setIsLoading} setRows={setRows} />
      <Table rows={rows} isLoading={isLoading} setRows={setRows} />
    </div>
  );
}

export default App;
