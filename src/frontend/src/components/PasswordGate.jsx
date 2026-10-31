import { useCallback, useState } from 'react';
import App from './App';
import PasswordForm from './PasswordForm';
import { clearSession, getSession } from '../session';

function PasswordGate() {
  const [unlocked, setUnlocked] = useState(() => getSession() !== null);
  const [notice, setNotice] = useState('');

  const lock = useCallback((message) => {
    clearSession();
    setNotice(message || '');
    setUnlocked(false);
  }, []);

  const handleUnlocked = useCallback(() => {
    setNotice('');
    setUnlocked(true);
  }, []);

  if (unlocked) {
    return <App onLocked={lock} />;
  }

  return <PasswordForm onUnlocked={handleUnlocked} notice={notice} />;
}

export default PasswordGate;
