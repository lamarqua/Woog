"use strict";

const KEY_PRESSED = 9;
const KEY_RELEASE = 8;
const CC_MESSAGE = 11;
const PC_MESSAGE = 12;

const A4_FREQ = 440;
const A4_MIDI_NUMBER = 69;

const MAX_VOICES = 4;
const OSC_TYPE = "sine";

const ADS_LENGTH = 0.5;
const R_LENGTH = 1.0;

var midi, reverbData, keysPressed = [], voices = {};

// Initialization code
// request MIDI access
if (navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess({
        sysex: false
    }).then(onMIDISuccess, onMIDIFailure);
} else {
    alert("No MIDI support in your browser.");
}

// midi functions
function onMIDISuccess(midiAccess) {
    // when we get a succesful response, run this code
    midi = midiAccess; // this is our raw MIDI rdata, inputs, outputs, and sysex status

    var inputs = midi.inputs.values();
    // loop over all available inputs and listen for any MIDI input
    for (var input = inputs.next(); input && !input.done; input = inputs.next()) {
        // each time there is a midi message call the onMIDIMessage function
        input.value.onmidimessage = onMIDIMessage;
    }
}

function onMIDIFailure(error) {
    // when we get a failed response, run this code
    console.log("No access to MIDI devices or your browser doesn't support WebMIDI API. Please use WebMIDIAPIShim " + error);
}

function onMIDIMessage(message) {
    var data = message.data; // this gives us our [command/channel, note, velocity] data.
    // console.log('MIDI data', data); // MIDI data [144, 63, 73]
    var cmd = data[0] >> 4;
    var channel = data[0] & 0xf;
    // var type = data[0] & 0xf0;
    var note = data[1];
    var velocity = data[2];
    console.log("cmd, channel, note, velocity", cmd, channel, readableNote(note), velocity);

    switch (cmd) {
        case KEY_PRESSED:
            keysPressed.push(note);
            console.log(keysPressed.map(readableNote));

            if (Object.keys(voices).length < MAX_VOICES) {
                var osc = aCon.createOscillator();
                osc.frequency.value = frequencyFromNote(note);
                osc.type = OSC_TYPE;
                osc.start();

                var gain = aCon.createGain();
                gain.gain.setValueCurveAtTime(ADS, aCon.currentTime, ADS_LENGTH);

                osc.connect(gain);
                gain.connect(aCon.destination);

                voices[note] = { "osc" : osc, "gain": gain };
                console.log("KEY_PRESSED: voices = ", voices);
            }
            break;
        case KEY_RELEASE:
            var i = keysPressed.indexOf(note);
            if (i > -1) {
                keysPressed.splice(i, 1);
            }
            console.log("KEY_RELEASED: voices = ", voices);

            if (voices[note]) {
                voices[note]["gain"].gain.setValueCurveAtTime(R, aCon.currentTime, R_LENGTH);

                setTimeout(function () {
                    var osc = voices[note]["osc"];
                    var gain = voices[note]["gain"];

                    osc.stop();
                    osc.disconnect();
                    gain.disconnect();
                    delete voices[note];
                }, R_LENGTH * 1000 /* milliseconds */);
            }
            break;
    }

    // switch (cmd) {
    //     case KEY_PRESSED:
    //         var curNote = keysPressed[keysPressed.length - 1];
    //         oscillator.frequency.value = frequencyFromNote(curNote);
    //         gainNode.gain.setValueCurveAtTime(ADS, aCon.currentTime, 0.5);
    //         break;
    //     case KEY_RELEASE:
    //         if (keysPressed.length === 0) {
    //             gainNode.gain.setValueCurveAtTime(R, aCon.currentTime, 1.0);
    //         }
    //         break;
    // }
    // if (cmd == KEY_PRESSED) {
    //     oscillator.frequency.value = frequencyFromNote(note);
    //     console.log(frequency);
    //     gainNode.gain.setValueCurveAtTime(ADS, aCon.currentTime, 0.5);
    // } else if (cmd == KEY_RELEASE) {
    //     gainNode.gain.setValueCurveAtTime(R, aCon.currentTime, 1.0);
    // }
}

function frequencyFromNote(note) {
    return A4_FREQ * Math.pow(2, (note - A4_MIDI_NUMBER) / 12);
}

function readableNote(note) {
    var notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    var octave = parseInt(note / 12) - 1;
    return notes[note % 12] + octave.toString();
}

// Create audio context
var aCon = new AudioContext();

// var oscillator = aCon.createOscillator();
// var gainNode = aCon.createGain();

// var reverbBuffer = aCon.createBuffer(2, reverbData.left.length, aCon.sampleRate);
// reverbBuffer.copyToChannel(Float32Array.from(reverbData.left), 0, 0);
// reverbBuffer.copyToChannel(Float32Array.from(reverbData.right), 1, 0);

// var convolution = aCon.createConvolver();
// convolution.buffer = reverbBuffer;

// var frequency = 1000;

// oscillator.type = "sine";
// oscillator.frequency.value = frequency;
// oscillator.connect(gainNode);
// gainNode.connect(convolution);
// oscillator.start();
// convolution.connect(aCon.destination);
// gainNode.gain.value = 0;


var ADS = new Float32Array(3);
ADS[0] = 0.7;
ADS[1] = 1.0;
ADS[2] = 0.7;

var R = new Float32Array(2);
R[0] = 0.7;
R[1] = 0.0;



