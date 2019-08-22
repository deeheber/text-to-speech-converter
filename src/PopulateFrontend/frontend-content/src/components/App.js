import React, { Component } from 'react';
import { API } from 'aws-amplify';
import Form from './Form';
import Table from './Table';

import '../styles/App.css';

class App extends Component {
  constructor () {
    super();
    this.state = {
      rows: [],
      formData: {
        voice: '',
        text: ''
      }
    };

    this.handleSubmit = this.handleSubmit.bind(this);
    this.handleChange = this.handleChange.bind(this);
  }

  async componentDidMount () {
    try {
      const { Items } = await API.get('backend', '/file');
      this.setState({ rows: Items });
    } catch (err) {
      console.error(err);
    }
  }

  handleChange (event) {
    this.setState({
      formData: {
        ...this.state.formData,
        [event.target.name]: event.target.value
      }
    });
  }

  async handleSubmit (event) {
    event.preventDefault();
    // TODO: get rid of alert boxes
    if (this.state.formData.text === '') {
      alert('Please enter some text before submitting');
      return;
    }

    try {
      const result = await API.post('backend', '/file', { body: this.state.formData });

      this.setState({
        rows: [
          result,
          ...this.state.rows
        ],
        formData: {
          voice: '',
          text: ''
        }
      });

      alert(`Successfully submitted. Download the file at ${result.url}`);
    } catch (err) {
      alert(`An error occurred: ${err.message}`);
      console.error(err);
    }
  }

  render () {
    return (
      <div className='container'>
        <h1>Text to speech converter</h1>
        <Form
          onSubmit={this.handleSubmit}
          onChange={this.handleChange}
          formData={this.state.formData}
        />
        <Table rows={this.state.rows} />
      </div>
    );
  }
}

export default App;
