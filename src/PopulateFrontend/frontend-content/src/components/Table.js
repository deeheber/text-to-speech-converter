import React from 'react';

import '../styles/Table.css';

function Table (props) {
  return (
    <table>
      <thead>
        <tr>
          <th>Text</th>
          <th>Status</th>
          <th>Voice</th>
          <th>Download</th>
        </tr>
      </thead>
      <tbody>
        {/* TODO: don't show download link if no url */}
        {/* TODO: add delete option */}
        {props.rows.map(row => (
          <tr key={row.id}>
            <td>{row.text.substring(0, 200)}</td>
            <td>{row.status}</td>
            <td>{row.voice}</td>
            <td><a href={row.url}>Download</a></td>
          </tr>

        ))}
      </tbody>
    </table>
  );
}

export default Table;
