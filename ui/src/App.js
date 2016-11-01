import React, { Component } from 'react';
import logo from './logo.svg';
import './App.css';

const App = React.createClass({
    getInitialState: function () {
        return {
            masterVolume: 0
        };
    },
    parameterChange: function (stateKey, value) {
        this.setState({
            [stateKey]: value 
        });
    },
    render: function() {
        return (
            <div>
               <Knob knobName='Master Volume' ccNumber={ 0 } initialValue={ 0 }/> 
            </div>
        );
    }
});

const Knob = React.createClass({
    getInitialState: function() {
        return {
            value: this.props.initialValue
        };
    },
    
    knobChange: function(event) {
        this.setState({
            value: parseInt(event.target.value)
        });
    },
    
    componentDidUpdate: function() {
        console.log(this.state.value);
    },

    render: function() {
        return (
            <div>
            <h2>{ this.props.knobName }</h2>
            <input type='range' onChange={ this.knobChange } value={ this.state.value }/>
            </div>
        );
    }
});

export default App;
