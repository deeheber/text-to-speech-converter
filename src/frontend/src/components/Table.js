import '../styles/Table.css';

function Table ({ isLoading, rows, onDelete }) {
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
        {isLoading &&
          <tr><td colSpan='6'>Loading...</td></tr>
        }

        {rows.map(row => (
          <tr key={row.id}>
            <td>{row.text}</td>
            <td>{row.status}</td>
            <td>{row.voice}</td>
            <td>{row.createdAt ? new Date(row.createdAt).toLocaleString() : ''}</td>
            <td><a href={row.url} target='_blank' rel="noreferrer">Download</a></td>
            <td><button className='deleteButton' onClick={() => onDelete(row.id)}>X</button></td>
          </tr>
        ))}

        {!isLoading && rows.length < 1 &&
          <tr>
            <td colSpan='6'>No converted text to speech records found. Start adding some using the form above.</td>
          </tr>
        }
      </tbody>
    </table>
  );
}

export default Table;
