import { useState } from 'react';
import { login } from '../api';
import { saveSession } from '../session';

import '../styles/PasswordForm.css';

function messageFor(err) {
  const status = err?.response?.statusCode;
  if (status === 401) return 'Incorrect password.';
  if (status === 429) return 'Too many attempts. Wait a minute and try again.';
  return "Couldn't reach the server. Try again.";
}

function PasswordForm({ onUnlocked, notice }) {
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState(notice || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const given = password;
    setPassword('');
    setMessage('');
    setIsSubmitting(true);
    try {
      const { token, expiresAt } = await login(given);
      saveSession({ token, expiresAt });
      setIsSubmitting(false);
      onUnlocked();
    } catch (err) {
      setMessage(messageFor(err));
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container passwordForm">
      <h1>Text to speech converter</h1>
      <form onSubmit={handleSubmit}>
        <label htmlFor="site-password">Password</label>
        <input
          id="site-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button type="submit" disabled={isSubmitting}>
          Unlock
        </button>
        {message && <p role="alert">{message}</p>}
      </form>
    </div>
  );
}

export default PasswordForm;
