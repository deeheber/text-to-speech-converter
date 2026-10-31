import { useCallback, useEffect, useRef, useState } from 'react';
import { get, post } from 'aws-amplify/api';
import { isAuthError } from '../api';
import { getSession } from '../session';
import '../styles/Form.css';

function statusMessage(row) {
  if (row.status === 'UNKNOWN' || row.status === 'STARTING') {
    return (
      row.message ||
      'Start outcome is uncertain. Check status before submitting another attempt.'
    );
  }

  if (row.status === 'FAILED') {
    return row.message || 'Conversion failed. You can submit a new attempt.';
  }

  return `Recording ${row.status.toLowerCase()}. You can close this page and check later.`;
}

function Form({ onAccepted, onChecked, onLocked, recordings = [] }) {
  const [formData, setFormData] = useState({ voice: '', text: '' });
  const [voiceList, setVoiceList] = useState([]);
  const [voicesLoading, setVoicesLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [submission, setSubmission] = useState(null);
  const request = useRef(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const uncertain =
    submission?.status === 'UNKNOWN' || submission?.status === 'STARTING';

  const receive = useCallback((row) => {
    setSubmission(row);
    setMessage(statusMessage(row));

    if (row.status === 'FAILED') {
      request.current = null;
    } else if (row.status !== 'UNKNOWN' && row.status !== 'STARTING') {
      if (request.current) {
        setFormData({ text: '', voice: '' });
      }

      request.current = null;
    }
  }, []);

  useEffect(() => {
    if (
      busy ||
      !['STARTING', 'UNKNOWN', 'QUEUED', 'PROCESSING'].includes(
        submission?.status,
      )
    ) {
      return;
    }

    const latest = recordings.find((row) => row.id === submission.id);

    if (latest && latest.status !== submission.status) {
      receive(latest);
    }
  }, [recordings, submission, busy, receive]);

  useEffect(() => {
    mounted.current = true;

    let subscribed = true;

    async function voices() {
      try {
        const response = await get({ apiName: 'backend', path: '/voices' })
          .response;
        const { Voices } = await response.body.json();

        if (subscribed) {
          setVoiceList(Voices);
        }
      } catch (err) {
        if (!subscribed) {
          return;
        }

        if (isAuthError(err) || getSession() === null) {
          onLocked('Your session expired. Enter the password again.');
        } else {
          console.error(err.name);
          setMessage(
            'Voices could not be loaded. Matthew is available by default.',
          );
        }
      } finally {
        if (subscribed) {
          setVoicesLoading(false);
        }
      }
    }

    void voices();

    return () => {
      subscribed = false;
      mounted.current = false;
    };
  }, [onLocked]);

  async function submit(newAttempt = false) {
    if (inFlight.current) {
      return;
    }

    if (!formData.text.trim() || formData.text.length > 100000) {
      setMessage('Enter text up to 100,000 characters before submitting.');

      return;
    }

    if (
      newAttempt &&
      !window.confirm(
        'The earlier conversion may still complete. Submit another attempt and risk duplicate audio?',
      )
    ) {
      return;
    }

    if (newAttempt || !request.current) {
      request.current = { requestId: crypto.randomUUID(), ...formData };
    }

    inFlight.current = true;
    setBusy(true);
    setMessage('Submitting...');

    try {
      const response = await post({
        apiName: 'backend',
        path: '/file',
        options: { body: request.current },
      }).response;
      const row = await response.body.json();

      if (mounted.current) {
        receive(row);
        onAccepted(row);
      }
    } catch (err) {
      if (!mounted.current) {
        return;
      }

      if (isAuthError(err) || getSession() === null) {
        onLocked('Your session expired. Enter the password again.');

        return;
      }

      let row;

      try {
        row = JSON.parse(err.response?.body ?? 'null');
      } catch {
        /* Transport errors have no JSON response. */
      }

      if (row?.id && row.status === 'FAILED') {
        receive(row);
        onAccepted(row);
      } else if (
        err.response?.statusCode === 400 ||
        err.response?.statusCode === 409
      ) {
        request.current = null;
        setSubmission(null);
        setMessage(
          typeof row === 'string'
            ? row
            : 'Submission rejected. Check the text and try again.',
        );
      } else {
        setSubmission({ id: request.current.requestId, status: 'UNKNOWN' });
        setMessage(
          'Submission could not be confirmed. Check status or retry the same submission before starting another attempt.',
        );
      }

      console.error(err.name);
    } finally {
      inFlight.current = false;

      if (mounted.current) {
        setBusy(false);
      }
    }
  }

  async function checkStatus() {
    if (inFlight.current || !submission) {
      return;
    }

    inFlight.current = true;
    setBusy(true);

    try {
      const response = await get({
        apiName: 'backend',
        path: `/file/${submission.id}`,
      }).response;
      const row = await response.body.json();

      if (mounted.current) {
        receive(row);
        onChecked(row);
      }
    } catch (err) {
      if (!mounted.current) {
        return;
      }

      if (isAuthError(err) || getSession() === null) {
        onLocked('Your session expired. Enter the password again.');
      } else {
        setMessage(
          'Status could not be confirmed. Retry the same submission rather than creating a new one.',
        );
      }
    } finally {
      inFlight.current = false;

      if (mounted.current) {
        setBusy(false);
      }
    }
  }

  return (
    <div className="formContainer">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <select
          aria-label="Voice"
          name="voice"
          value={formData.voice}
          disabled={busy || uncertain || voicesLoading}
          onChange={(event) =>
            setFormData({ ...formData, voice: event.target.value })
          }
        >
          <option value="">Matthew (default)</option>
          {voiceList.map((voice) => (
            <option value={voice.Id} key={voice.Id}>
              {voice.Name}
            </option>
          ))}
        </select>
        <textarea
          aria-label="Text to convert"
          name="text"
          value={formData.text}
          maxLength={100000}
          disabled={busy || uncertain}
          onChange={(event) =>
            setFormData({ ...formData, text: event.target.value })
          }
        />
        <button type="submit" className="submitButton" disabled={busy}>
          {uncertain ? 'Retry same submission' : 'Submit'}
        </button>
        {submission && (
          <button type="button" disabled={busy} onClick={checkStatus}>
            Check status
          </button>
        )}
        {uncertain && (
          <button type="button" disabled={busy} onClick={() => submit(true)}>
            Submit new attempt
          </button>
        )}
        <span className="messageText" role="status">
          {message}
        </span>
      </form>
    </div>
  );
}

export default Form;
