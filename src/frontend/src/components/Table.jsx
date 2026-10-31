import { useState } from 'react';
import { del, get } from 'aws-amplify/api';
import { isAuthError } from '../api';
import { getSession } from '../session';
import '../styles/Table.css';

function Table({ isLoading, rows, onDeleted, onChecked, onLocked }) {
  const [busy, setBusy] = useState(null);
  async function operation(row, remove) {
    const unknown = row.status === 'UNKNOWN';
    if (remove && !window.confirm(unknown
      ? 'Polly cannot be cancelled. Late audio may need manual S3 cleanup. Remove this uncertain recording?'
      : 'Do you really want to delete?')) return;
    setBusy(row.id);
    try {
      if (remove) {
        await del({ apiName: 'backend', path: `/file/${row.id}`, options: {
          queryParams: unknown ? { allowUnknown: 'true' } : {},
        } }).response;
        onDeleted(row.id);
      } else {
        const response = await get({ apiName: 'backend', path: `/file/${row.id}` }).response;
        onChecked(await response.body.json());
      }
    } catch (err) {
      if (isAuthError(err) || getSession() === null) onLocked('Your session expired. Enter the password again.');
      else { alert(`An error occurred: ${err.message}`); console.error(err.name); }
    } finally { setBusy(null); }
  }
  return (
    <table>
      <thead><tr><th>Text</th><th>Status</th><th>Voice</th><th>Date</th><th>Download</th><th>Delete</th></tr></thead>
      <tbody>
        {isLoading && <tr><td colSpan="6">Loading...</td></tr>}
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{row.text}</td>
            <td>{row.status}{row.message && <p>{row.message}</p>}{row.status === 'UNKNOWN' && <>
              <p>Another attempt may produce duplicate audio. Use the form to submit it explicitly.</p>
              <button type="button" disabled={busy !== null} onClick={() => operation(row, false)}>Check status</button>
            </>}</td>
            <td>{row.voice}</td>
            <td>{row.createdAt ? new Date(row.createdAt).toLocaleString() : ''}</td>
            <td>{row.status === 'COMPLETE' && row.url && <a href={row.url} target="_blank" rel="noreferrer">Download</a>}</td>
            <td><button className="deleteButton" disabled={busy !== null || ['STARTING', 'QUEUED', 'PROCESSING'].includes(row.status)} onClick={() => operation(row, true)}>X</button></td>
          </tr>
        ))}
        {!isLoading && rows.length < 1 && <tr><td colSpan="6">No converted text to speech records found. Start adding some using the form above.</td></tr>}
      </tbody>
    </table>
  );
}
export default Table;
