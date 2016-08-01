/* @flow */
"use strict";

const KEY_PRESSED = 9;
const KEY_RELEASED = 8;
const CC_MESSAGE = 11;
const PC_MESSAGE = 12;

const A4_FREQ = 440;
const A4_MIDI_NUMBER = 69;

const MAX_VOICES = 4;
const OSC_TYPE = "triangle";

const MIN_GAIN_LEVEL = 0.0;
const MAX_GAIN_LEVEL = 0.999;

// const SETTING_MASTER_VOLUME = 4;
const SETTING_S = 9;

const SETTING_A = 5;
const SETTING_D = 6;
const SETTING_R = 7;
const SETTING_REVERB_WET_MIX = 8;
const SETTING_HIPASS_FREQ = 1;
const SETTING_HIPASS_Q = 2;
const SETTING_LOPASS_FREQ = 3;
const SETTING_LOPASS_Q = 4;

const ADSR_ASSIGNED_KNOBS = new Set([SETTING_A, SETTING_D, SETTING_R]);

const MIN_ENVELOP_TIME = 2;

const MAX_A = 1000;
const MAX_D = 1000;
const MAX_R = 1000;
const DEFAULT_A = MIN_ENVELOP_TIME;
const DEFAULT_D = 500;
const DEFAULT_R = 500;

const MIN_HIPASS_FREQ = 1000;
const MAX_HIPASS_FREQ = 14000;

const MIN_LOPASS_FREQ = 80;
const MAX_LOPASS_FREQ = 10000;

const MIN_FILTER_Q = .0001;
const MAX_FILTER_Q = 1000;

const DEFAULT_HIPASS_FREQ = MIN_HIPASS_FREQ;
const DEFAULT_HIPASS_Q = 1;

const DEFAULT_LOPASS_FREQ = MAX_LOPASS_FREQ;
const DEFAULT_LOPASS_Q = 1;

const DEFAULT_SUSTAIN = MAX_GAIN_LEVEL;

const DEFAULT_MASTER_VOLUME = 0.99;

const DEFAULT_WET_MIX = 1;

var midi, reverbData, gKeysPressed = [], gVoices = {};
var userADSR = [], userHiPass = [], userLoPass = [], userMasterVolume = DEFAULT_MASTER_VOLUME, userReverbWetMix = DEFAULT_WET_MIX;

userHiPass[SETTING_HIPASS_FREQ] = DEFAULT_HIPASS_FREQ;
userHiPass[SETTING_HIPASS_Q] = DEFAULT_HIPASS_Q;
userLoPass[SETTING_LOPASS_FREQ] = DEFAULT_LOPASS_FREQ;
userLoPass[SETTING_LOPASS_Q] = DEFAULT_LOPASS_Q;

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

var masterGainNode = aCon.createGain();
masterGainNode.gain.value = userMasterVolume;
masterGainNode.connect(aCon.destination);

var reverbDryGainNode = aCon.createGain();
reverbDryGainNode.gain.value = 1 - DEFAULT_WET_MIX;
reverbDryGainNode.connect(masterGainNode);

var reverbWetGainNode = aCon.createGain();
reverbWetGainNode.gain.value = DEFAULT_WET_MIX;
reverbWetGainNode.connect(masterGainNode);

var reverbBuffer = aCon.createBuffer(2, reverbData.left.length, aCon.sampleRate);
reverbBuffer.copyToChannel(Float32Array.from(reverbData.left), 0, 0);
reverbBuffer.copyToChannel(Float32Array.from(reverbData.right), 1, 0);

var convolverNode = aCon.createConvolver();
convolverNode.buffer = reverbBuffer;
convolverNode.connect(reverbWetGainNode);

var loPassFilterNode = aCon.createBiquadFilter();
loPassFilterNode.type = "lowpass";
loPassFilterNode.frequency.value = DEFAULT_LOPASS_FREQ;
loPassFilterNode.Q.value = DEFAULT_LOPASS_Q;
loPassFilterNode.gain.value = 0;
loPassFilterNode.connect(convolverNode);
loPassFilterNode.connect(reverbDryGainNode);

var hiPassFilterNode = aCon.createBiquadFilter();
hiPassFilterNode.type = "highpass";
hiPassFilterNode.frequency.value = DEFAULT_HIPASS_FREQ;
hiPassFilterNode.Q.value = DEFAULT_HIPASS_Q;
hiPassFilterNode.gain.value = 0;
hiPassFilterNode.connect(loPassFilterNode);

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
    gainNode.connect(hiPassFilterNode);

    return  { "oscNode" : oscNode, "gainNode": gainNode };
}

function killNote(voices, note) {
    // TODO: enhance to kill properly the notes when we are out of voices (note stealing).


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
            var velocityDiv = velocity / 127;
            if (ADSR_ASSIGNED_KNOBS.has(note)) {
                userADSR[note] = velocityDiv;
            // } else if (note === SETTING_MASTER_VOLUME) {
            //     userMasterVolume = velocityDiv;
            //     console.log("userMasterVolume: ", userMasterVolume);
            //     masterGainNode.gain.value = userMasterVolume;
            } else if (note === SETTING_S) {
                if (velocity > 0) {
                    userADSR[SETTING_S] = (userADSR[SETTING_S] === MIN_GAIN_LEVEL) ?
                        MAX_GAIN_LEVEL : MIN_GAIN_LEVEL;
                }
            } else if (note === SETTING_REVERB_WET_MIX) {
                userReverbWetMix = velocityDiv;
                console.log("userReverbWetMix: ", userReverbWetMix);
                reverbDryGainNode.gain.value = 1 - userReverbWetMix;
                reverbWetGainNode.gain.value = userReverbWetMix;

            } else if (note === SETTING_HIPASS_FREQ) {
                userHiPass[SETTING_HIPASS_FREQ] = (MAX_HIPASS_FREQ - MIN_HIPASS_FREQ) * velocityDiv + MIN_HIPASS_FREQ;
                hiPassFilterNode.frequency.value = userHiPass[SETTING_HIPASS_FREQ];
                console.log("userHiPassFreq: ", userHiPass[SETTING_HIPASS_FREQ]);

            } else if (note === SETTING_HIPASS_Q) {
                userHiPass[SETTING_HIPASS_Q] = (MAX_FILTER_Q - MIN_FILTER_Q) * velocityDiv + MIN_FILTER_Q;
                // hiPassFilterNode.Q.value = userHiPass[SETTING_HIPASS_Q];
                console.log("userHiPassQ: ", userHiPass[SETTING_HIPASS_Q]);

            } else if (note === SETTING_LOPASS_FREQ) {
                userLoPass[SETTING_LOPASS_FREQ] = (MAX_LOPASS_FREQ - MIN_LOPASS_FREQ) * velocityDiv + MIN_LOPASS_FREQ;
                loPassFilterNode.frequency.value = userLoPass[SETTING_LOPASS_FREQ];
                console.log("userLoPassFreq: ", userLoPass[SETTING_LOPASS_FREQ]);

            } else if (note === SETTING_LOPASS_Q) {
                userLoPass[SETTING_LOPASS_Q] = (MAX_FILTER_Q - MIN_FILTER_Q) * velocityDiv + MIN_FILTER_Q;
                // loPassFilterNode.Q.value = userLoPass[SETTING_LOPASS_Q];
                console.log("userLoPassQ: ", userLoPass[SETTING_LOPASS_Q]);

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



