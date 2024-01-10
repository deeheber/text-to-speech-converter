import { del } from 'aws-amplify/api';
import '../styles/Table.css';

function Table({ isLoading, setRows, rows }) {
  async function handleDelete(id) {
    const deleteConfirm = window.confirm('Do you really want to delete?');
    if (!deleteConfirm) {
      return;
    }

    try {
      const deleteResponse = del({ apiName: 'backend', path: `/file/${id}` });
      await deleteResponse.response;
      setRows({ type: 'remove', payload: { id } });
    } catch (err) {
      alert(`An error occurred: ${err.message}`);
      console.error(err);
    }
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Text</th>
          <th>Status</th>
          <th>Voice</th>
          <th>Date</th>
          <th>Download</th>
          <th>Delete</th>
        </tr>
      </thead>

      <tbody>
        {isLoading && (
          <tr>
            <td colSpan="6">Loading...</td>
          </tr>
        )}

        {rows.map((row) => (
          <tr key={row.id}>
            <td>{row.text}</td>
            <td>{row.status}</td>
            <td>{row.voice}</td>
            <td>
              {row.createdAt ? new Date(row.createdAt).toLocaleString() : ''}
            </td>
            <td>
              <a href={row.url} target="_blank" rel="noreferrer">
                Download
              </a>
            </td>
            <td>
              <button
                className="deleteButton"
                onClick={() => handleDelete(row.id)}
              >
                X
              </button>
            </td>
          </tr>
        ))}

        {!isLoading && rows.length < 1 && (
          <tr>
            <td colSpan="6">
              No converted text to speech records found. Start adding some using
              the form above.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export default Table;
