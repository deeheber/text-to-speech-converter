import { useCallback, useEffect, useRef, useState } from 'react';
import { get } from 'aws-amplify/api';
import { isAuthError } from '../api';
import { getSession } from '../session';
import Form from './Form';
import Table from './Table';
import '../styles/App.css';

const active = (row) =>
  ['STARTING', 'QUEUED', 'PROCESSING'].includes(row.status);

function App({ onLocked }) {
  const [page, setPage] = useState({
    rows: [],
    cursor: null,
    nextCursor: null,
    history: [],
  });
  const [target, setTarget] = useState({ cursor: null, history: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const pendingIds = useRef(new Set());

  useEffect(() => {
    let subscribed = true;
    let timer;
    let inFlight = false;
    let delay = 10000;
    const schedule = () => {
      if (subscribed && !document.hidden) {
        timer = setTimeout(load, delay);
      }
    };

    async function load() {
      if (!subscribed || document.hidden || inFlight) {
        return;
      }

      clearTimeout(timer);

      if (getSession() === null) {
        onLocked('Your session expired. Enter the password again.');

        return;
      }

      inFlight = true;
      setIsLoading(true);

      let again = false;

      try {
        const operation = get({
          apiName: 'backend',
          path: '/file',
          options: {
            queryParams: {
              limit: '10',
              ...(target.cursor ? { cursor: target.cursor } : {}),
            },
          },
        });
        const response = await operation.response;
        const { Items, nextCursor = null } = await response.body.json();

        if (!subscribed) {
          return;
        }

        Items.forEach((row) => pendingIds.current.delete(row.id));
        setPage({
          rows: Items,
          cursor: target.cursor,
          nextCursor,
          history: target.history,
        });
        setError('');
        delay = 10000;
        again =
          Items.some(active) ||
          (target.cursor === null && pendingIds.current.size > 0);
      } catch (err) {
        if (!subscribed) {
          return;
        }

        if (isAuthError(err) || getSession() === null) {
          subscribed = false;
          onLocked('Your session expired. Enter the password again.');

          return;
        }

        console.error(err.name);
        setError(
          'Recordings could not be loaded. Your current page is unchanged.',
        );
        delay = Math.min(delay * 2, 60000);
        again = true;
      } finally {
        inFlight = false;

        if (subscribed) {
          setIsLoading(false);
        }

        if (again) {
          schedule();
        }
      }
    }

    const visibility = () => {
      clearTimeout(timer);

      if (!document.hidden) {
        void load();
      }
    };

    void load();
    document.addEventListener('visibilitychange', visibility);

    return () => {
      subscribed = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [target, onLocked]);

  const accepted = useCallback((row) => {
    pendingIds.current.add(row.id);
    setTarget({ cursor: null, history: [] });
  }, []);
  const deleted = useCallback((id) => {
    pendingIds.current.delete(id);
    setTarget({ cursor: null, history: [] });
  }, []);
  const checked = useCallback((row) => {
    setPage((current) => ({
      ...current,
      rows: current.rows.map((old) => (old.id === row.id ? row : old)),
    }));
    setTarget((current) => ({ ...current }));
  }, []);

  return (
    <div className="container">
      <div className="header">
        <h1>Text to speech converter</h1>
        <button type="button" onClick={() => onLocked()}>
          Lock
        </button>
      </div>
      <Form onAccepted={accepted} onChecked={checked} onLocked={onLocked} />
      {error && (
        <div role="alert">
          {error}{' '}
          <button
            type="button"
            disabled={isLoading}
            onClick={() => setTarget((current) => ({ ...current }))}
          >
            Retry
          </button>
        </div>
      )}
      <Table
        rows={page.rows}
        isLoading={isLoading}
        onDeleted={deleted}
        onChecked={checked}
        onLocked={onLocked}
      />
      <nav aria-label="Recording pages" className="pagination">
        <button
          type="button"
          disabled={isLoading || page.history.length === 0}
          onClick={() => {
            setTarget({
              cursor: page.history.at(-1),
              history: page.history.slice(0, -1),
            });
          }}
        >
          Previous
        </button>
        <span>Page {page.history.length + 1}</span>
        <button
          type="button"
          disabled={isLoading || !page.nextCursor}
          onClick={() => {
            setTarget({
              cursor: page.nextCursor,
              history: [...page.history, page.cursor],
            });
          }}
        >
          Next
        </button>
        <button
          type="button"
          disabled={isLoading}
          onClick={() =>
            setTarget({ cursor: page.cursor, history: page.history })
          }
        >
          Refresh
        </button>
      </nav>
    </div>
  );
}

export default App;
