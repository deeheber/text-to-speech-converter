import { createRoot } from 'react-dom/client';

import App from './components/App';
import * as serviceWorker from './serviceWorker';

import { Amplify } from 'aws-amplify';
import config from './config';
Amplify.configure({
  API: {
    REST: {
      backend: {
        endpoint: config.backendAPI,
      },
    },
  },
});

const container = document.getElementById('root');
const root = createRoot(container);
root.render(<App tab="home" />);

serviceWorker.unregister();
