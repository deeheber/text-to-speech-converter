import { createRoot } from 'react-dom/client';

import PasswordGate from './components/PasswordGate';
import { configureAmplify } from './amplifyConfig';
import * as serviceWorker from './serviceWorker';

import config from './config';

configureAmplify(config);

const container = document.getElementById('root');
const root = createRoot(container);
root.render(<PasswordGate />);

serviceWorker.unregister();
