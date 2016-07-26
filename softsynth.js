/* @flow */
"use strict";

const KEY_PRESSED = 9;
const KEY_RELEASED = 8;
const CC_MESSAGE = 11;
const PC_MESSAGE = 12;

const A4_FREQ = 440;
const A4_MIDI_NUMBER = 69;

const MAX_VOICES = 4;
const OSC_TYPE = "square";

// const ADS_LENGTH = 0.5;
// const R_LENGTH = 1.0;

const MIN_GAIN_LEVEL = 0.0;
const MAX_GAIN_LEVEL = 0.999;

const SETTING_A = 5;
const SETTING_D = 6;
const SETTING_S = 7;
const SETTING_R = 8;
const ASSIGNED_KNOBS = new Set([SETTING_A, SETTING_D, SETTING_S, SETTING_R]);

const MAX_A = 2000;
const MAX_D = 2000;
const MAX_R = 2000;
const DEFAULT_A = 1000;
const DEFAULT_D = 1000;
const DEFAULT_R = 1000;

const DEFAULT_SUSTAIN = MAX_GAIN_LEVEL;

const MIN_ENVELOP_TIME = 2;

var midi, reverbData, gKeysPressed = [], gVoices = {}, userADSR = [];

userADSR[SETTING_A] = msToS(DEFAULT_A);
userADSR[SETTING_D] = msToS(DEFAULT_D);
userADSR[SETTING_R] = msToS(DEFAULT_R);

userADSR[SETTING_S] = DEFAULT_SUSTAIN;

// Initialization code
// request MIDI access
if (navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess({
        sysex: false
    }).then(onMIDISuccess, onMIDIFailure);
} else {
    alert("No MIDI support in your browser.");
}

// Create audio context
var aCon = new AudioContext();

// var ADS = new Float32Array(7);
// ADS[0] = 0.5;
// ADS[1] = 0.7;
// ADS[2] = 1.0;
// ADS[3] = 0.9;
// ADS[4] = 0.8;
// ADS[5] = 0.7;
// ADS[6] = 0.7;

// var R = new Float32Array(2);
// R[0] = 0.7;
// R[1] = 0.0;

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

function getHighestPriorityNotes(notes) {
    var sorted = notes.slice().sort();
    return sorted.slice(0, MAX_VOICES); // TODO: is slice with end index past the lenght of the array legal????
}

function getLowestPriorityNotes(notes) {
    var sorted = notes.slice().sort();
    sorted.reverse();
    return sorted.slice(0, MAX_VOICES);
}

function lerp(a, b, t) {
    return (b - a) * t + a;
}

function msToS(milliseconds) {
    return milliseconds / 1000;
}



function createVoice(note) {
    var oscNode = aCon.createOscillator();
    oscNode.type = OSC_TYPE;
    oscNode.frequency.value = frequencyFromNote(note);
    // console.log("Frequency for note: ", note, " is ", oscNode.frequency.valuxe);
    oscNode.start();

    var gainNode = aCon.createGain();
    gainNode.gain.value = MIN_GAIN_LEVEL;

    var durationA = msToS(lerp(MIN_ENVELOP_TIME, MAX_A, userADSR[SETTING_A]));
    var durationD = msToS(lerp(MIN_ENVELOP_TIME, MAX_D, userADSR[SETTING_D]));
    var sustainLevel = Math.max(MIN_GAIN_LEVEL, userADSR[SETTING_S]);

    console.log("durationA: ", durationA);
    console.log("durationD: ", durationD);
    console.log("sustainLevel: ", sustainLevel);

    var rampA = new Float32Array([MIN_GAIN_LEVEL, MAX_GAIN_LEVEL]);
    gainNode.gain.setValueCurveAtTime(rampA, aCon.currentTime, durationA);

    var rampD = new Float32Array([MAX_GAIN_LEVEL, sustainLevel]);
    gainNode.gain.setValueCurveAtTime(rampD, aCon.currentTime + durationA, durationD);

    // var now = aCon.currentTime;
    // gainNode.gain.linearRampToValueAtTime(1, now + durationA);
    // gainNode.gain.linearRampToValueAtTime(sustainLevel, now + durationA + durationD);

    oscNode.connect(gainNode);
    gainNode.connect(aCon.destination);

    return  { "oscNode" : oscNode, "gainNode": gainNode };
}

function killNote(voices, note) {
    var gainNode = voices[note]["gainNode"];

    var durationR = msToS(lerp(MIN_ENVELOP_TIME, MAX_R, userADSR[SETTING_R]));
    console.log("durationR", durationR);
    gainNode.gain.cancelScheduledValues(aCon.currentTime);
    var rampR = new Float32Array([voices[note]["gainNode"].gain.value, MIN_GAIN_LEVEL]);
    gainNode.gain.setValueCurveAtTime(rampR, aCon.currentTime, durationR);

    // gainNode.gain.exponentialRampToValueAtTime(MIN_GAIN_LEVEL, aCon.currentTime + 10);

    // voices[note]["gainNode"].gain.linearRampToValueAtTime(MIN_GAIN_LEVEL, aCon.currentTime + durationR);
    // voices[note]["gainNode"].gain.setTargetAtTime(MIN_GAIN_LEVEL, aCon.currentTime, durationR);

    delete voices[note];
}

function reclaimVoices(voices, keysPressed) {
    // var allocatedNotes = Object.keys(voices).map(parseInt);

    // for (var i = 0; i < allocatedNotes.length; ++i) {
    //     if (keysPressed.indexOf(+allocatedNotes[i]) === -1) {
    //         killNote(voices, allocatedNotes[i]);
    //     }
    // }

    for (var allocatedNote in voices) {
        if (keysPressed.indexOf(parseInt(allocatedNote)) === -1) {
            killNote(voices, allocatedNote);
        }
    }
}

function allocateVoices(voices, notes) {
    let highestPriorityNotes = getHighestPriorityNotes(notes);
    console.log("highestPriorityNotes", highestPriorityNotes);
    // console.log("###########", Object.keys(voices));
    var allocatedNotes = Object.keys(voices);
    allocatedNotes = allocatedNotes.map(function(x) { return +x; });

    var noteToStealFrom = undefined;
    for (var i = 0; i < allocatedNotes.length; ++i) {

        var idx = highestPriorityNotes.indexOf(allocatedNotes[i]);
        if (idx === -1) {
            noteToStealFrom = allocatedNotes[i];
            break;
        } else {
            console.log("Found allocatedNote", allocatedNotes[i], " at index i ", idx, " val =  ", highestPriorityNotes[idx]);
        }
    }

    var noteToAllocate = undefined;

    for (var i = 0; i < highestPriorityNotes.length; ++i) {
        if (!(highestPriorityNotes[i] in voices)) {
            noteToAllocate = highestPriorityNotes[i];
            break;
        }
    }

    if (noteToAllocate) {
        console.log("noteToAllocate:", noteToAllocate);

        if (noteToStealFrom) {
            killNote(voices, noteToStealFrom);
        }
        voices[noteToAllocate] = createVoice(noteToAllocate);
    }
}

function onMIDIMessage(message) {
    var data = message.data; // this gives us our [command/channel, note, velocity] data.
    // console.log('MIDI data', data); // MIDI data [144, 63, 73]
    var cmd = data[0] >> 4;
    var channel = data[0] & 0xf;
    // var type = data[0] & 0xf0;
    var note = data[1];
    var velocity = data[2];
    console.log("cmd, channel, note, velocity", cmd, channel, note, velocity);

    var releasedKey = undefined;

    switch (cmd) {
        case KEY_PRESSED:
            gKeysPressed.push(note);
            console.log("KEY_PRESSED: gKeysPressed = ", gKeysPressed.map(readableNote));
            break;
        case KEY_RELEASED:
            var i = gKeysPressed.indexOf(note);
            if (i > -1) {
                gKeysPressed.splice(i, 1);
            }
            releasedKey = note;
            console.log("KEY_RELEASED: gKeysPressed = ", gKeysPressed.map(readableNote));
            break;
        case CC_MESSAGE:
            if (ASSIGNED_KNOBS.has(note)) {
                userADSR[note] = velocity / 127;
            }

    }

    if (cmd === KEY_PRESSED || cmd === KEY_RELEASED) {
        reclaimVoices(gVoices, gKeysPressed);

        if (gKeysPressed.length > 0) {
            allocateVoices(gVoices, gKeysPressed);
        }
    }
}

function frequencyFromNote(note) {
    return A4_FREQ * Math.pow(2, (note - A4_MIDI_NUMBER) / 12);
}

function readableNote(note) {
    var notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    var octave = parseInt(note / 12) - 1;
    return notes[note % 12] + octave.toString();
}

// var reverbBuffer = aCon.createBuffer(2, reverbData.left.length, aCon.sampleRate);
// reverbBuffer.copyToChannel(Float32Array.from(reverbData.left), 0, 0);
// reverbBuffer.copyToChannel(Float32Array.from(reverbData.right), 1, 0);

// var convolution = aCon.createConvolver();
// convolution.buffer = reverbBuffer;





