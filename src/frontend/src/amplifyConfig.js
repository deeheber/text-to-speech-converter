import { Amplify } from 'aws-amplify';
import { getSession } from './session.js';

export function configureAmplify(config) {
  Amplify.configure(
    { API: { REST: { backend: { endpoint: config.backendAPI } } } },
    {
      API: {
        REST: {
          headers: async () => {
            const s = getSession();
            return s ? { Authorization: s.token } : {};
          },
        },
      },
    },
  );
}
