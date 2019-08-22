import React, { Component } from 'react';
import { API } from 'aws-amplify';
import Form from './Form';
import Table from './Table';

import '../styles/App.css';

class App extends Component {
  constructor () {
    super();
    this.state = {
      rows: []
    };
  }

  async componentDidMount () {
    try {
      const { Items } = await API.get('backend', '/file');
      this.setState({ rows: Items });
    } catch (err) {
      console.error(err);
    }
  }

  render () {
    return (
      <div className='container'>
        <Form />
        <Table rows={this.state.rows} />
      </div>
    );
  }
}

export default App;
