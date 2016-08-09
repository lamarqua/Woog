/* @flow */
(function() {
"use strict";

const BINDING_S = 9;
const BINDING_A = 5;
const BINDING_D = 6;
const BINDING_R = 7;
const BINDING_REVERB_WET_MIX = 8;
const BINDING_LOPASS_FREQ = 3;
const BINDING_LOPASS_Q = 4;
const BINDING_LFO_FREQ = 1;
const BINDING_BITCRUSHER = 2;
const BINDINGS_ADS = new Set([BINDING_A, BINDING_D, BINDING_R]);

// Global synth constants
const SYNTH_MAX_VOICES = 4;
const SYNTH_OSC_TYPE = "sawtooth";

// Used for GainNodes
const MIN_GAIN_LEVEL = 0.0;
const MAX_GAIN_LEVEL = 0.999;

const DEFAULT_SUSTAIN = MAX_GAIN_LEVEL;
const DEFAULT_MASTER_VOLUME = 0.99;
const DEFAULT_WET_MIX = 0;

// Time-related constants
const MIN_ENVELOP_TIME = 2;
const MAX_A = 1000;
const MAX_D = 1000;
const MAX_R = 1000;
const DEFAULT_A = MIN_ENVELOP_TIME;
const DEFAULT_D = 500;
const DEFAULT_R = 500;

// Filter-related
const MIN_LOPASS_FREQ = 80;
const MAX_LOPASS_FREQ = 10000;
const MIN_FILTER_Q = .0001;
const MAX_FILTER_Q = 1000;
const DEFAULT_LOPASS_FREQ = MAX_LOPASS_FREQ;
const DEFAULT_LOPASS_Q = 1;

// LFO-related
const DEFAULT_LFO_FREQ = 0.001; // FIXME
const MIN_LFO_FREQ = DEFAULT_LFO_FREQ;
const MAX_LFO_FREQ = 30;

const BITCRUSHER_VALUES = [1, 2, 4, 8, 16, 32, 64];

let bitcrusherCurrentValue = 0;

let userADSR = [], userHiPass = [], userLoPass = [], userLFO = [], userMasterVolume = DEFAULT_MASTER_VOLUME, userReverbWetMix = DEFAULT_WET_MIX;

userLoPass[BINDING_LOPASS_FREQ] = DEFAULT_LOPASS_FREQ;
userLoPass[BINDING_LOPASS_Q] = DEFAULT_LOPASS_Q;

userLFO[BINDING_LFO_FREQ] = DEFAULT_LFO_FREQ;

userADSR[BINDING_A] = msToS(DEFAULT_A);
userADSR[BINDING_D] = msToS(DEFAULT_D);
userADSR[BINDING_R] = msToS(DEFAULT_R);

userADSR[BINDING_S] = DEFAULT_SUSTAIN;

function createInputDevice() {
    const MIDI_KEY_PRESSED = 9;
    const MIDI_KEY_RELEASED = 8;
    const MIDI_CC_MESSAGE = 11;
    const MIDI_PC_MESSAGE = 12;

    // TODO: inputDevice should have a proper flow type
    let inputDevice = { keysPressed: [], setSynth: undefined, initializeMIDI: undefined,
        synth: undefined, midi: undefined };

    inputDevice.setSynth = function(synthObject) {
        inputDevice.synth = synthObject;
    }

    let _onMIDIMessage = function(message) {
        if (inputDevice.synth) {
            let data = message.data;
            let cmd = data[0] >> 4;
            let channel = data[0] & 0xf;
            let note = data[1];
            let velocity = data[2];
            console.log("cmd, channel, note, velocity", cmd, channel, note, velocity);

            switch (cmd) {
                case MIDI_KEY_PRESSED:
                    inputDevice.keysPressed.push(note);

                    // $FlowIgnore: TODO add proper type for inputDevice.synth
                    inputDevice.synth.onKey("KeyPressed", inputDevice.keysPressed, note, velocity);
                    break;
                case MIDI_KEY_RELEASED:
                    let i = inputDevice.keysPressed.indexOf(note);
                    if (i > -1) {
                        inputDevice.keysPressed.splice(i, 1);
                    }

                    // $FlowIgnore: TODO add proper type for inputDevice.synth
                    inputDevice.synth.onKey("KeyReleased", inputDevice.keysPressed, note, velocity);
                    break;
                case MIDI_CC_MESSAGE:
                    // $FlowIgnore: TODO add proper type for inputDevice.synth
                    inputDevice.synth.onMessage("CCMessage", note, velocity);
                    break;
                case MIDI_PC_MESSAGE:
                    // $FlowIgnore: TODO add proper type for inputDevice.synth
                    inputDevice.synth.onMessage("PCMessage", note, velocity);
                    break;
            }
        }
    }

    inputDevice.initializeMIDI = function() {
        if (!inputDevice.synth) {
            console.log("Initialize a synth before calling InitializeMIDI()");
        } else {
            // request MIDI access
            if (navigator.requestMIDIAccess) {
                navigator.requestMIDIAccess({
                    sysex: false
                }).then(onMIDISuccess, onMIDIFailure);
            }

            // midi functions
            function onMIDISuccess(midiAccess) {
                // when we get a succesful response, run this code
                inputDevice.midi = midiAccess; // this is our raw MIDI rdata, inputs, outputs, and sysex status

                let inputs = inputDevice.midi.inputs.values();
                // loop over all available inputs and listen for any MIDI input
                for (let input = inputs.next(); input && !input.done; input = inputs.next()) {
                    // each time there is a midi message call the onMIDIMessage function
                    input.value.onmidimessage = _onMIDIMessage;
                }
            }

            function onMIDIFailure(error) {
            // when we get a failed response, run this code
                console.log("No access to MIDI devices or your browser doesn't support WebMIDI API. Please use WebMIDIAPIShim " + error);
            }

        }
    }

    return inputDevice;
}

function createSynth() {
    function _frequencyFromNote(note) {
        const A4_FREQ = 440;
        const A4_MIDI_NUMBER = 69;

        return A4_FREQ * Math.pow(2, (note - A4_MIDI_NUMBER) / 12);
    }

    function _readableNote(note) {
        let notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
        let octave = parseInt(note / 12) - 1;
        return notes[note % 12] + octave.toString();
    }

    let synth = { voices: {}, onKey: undefined, onMessage: undefined, allocateVoices: undefined };


    synth.onKey = function(eventType, keysPressed, note, velocity) {
        if (eventType === "KeyPressed") {

        } else if (eventType === "KeyReleased") {

        }

        reclaimVoices(synth.voices, keysPressed);

        if (keysPressed.length > 0) {
            synth.allocateVoices(keysPressed);
        }
    }

    synth.allocateVoices = function(notes) {
        let highestPriorityNotes = getHighestPriorityNotes(notes);
        console.log("highestPriorityNotes", highestPriorityNotes);

        let allocatedNotes = Object.keys(synth.voices);
        allocatedNotes = allocatedNotes.map(function(x) { return +x; });

        let noteToStealFrom = undefined;
        for (let i = 0; i < allocatedNotes.length; ++i) {

            let idx = highestPriorityNotes.indexOf(allocatedNotes[i]);
            if (idx === -1) {
                noteToStealFrom = allocatedNotes[i];
                break;
            } else {
                console.log("Found allocatedNote", allocatedNotes[i], " at index i ", idx, " val =  ", highestPriorityNotes[idx]);
            }
        }

        let noteToAllocate = undefined;

        for (let i = 0; i < highestPriorityNotes.length; ++i) {
            if (!(highestPriorityNotes[i] in synth.voices)) {
                noteToAllocate = highestPriorityNotes[i];
                break;
            }
        }

        if (noteToAllocate) {
            console.log("noteToAllocate:", noteToAllocate);

            if (noteToStealFrom) {
                killNote(synth.voices, noteToStealFrom);
            }
            synth.voices[noteToAllocate] = createVoice(noteToAllocate);
        }
    }


    synth.onMessage = function(eventType, note, velocity) {
        if (eventType === "CCMessage") {
            let velocityDiv = velocity / 127;
            if (BINDINGS_ADS.has(note)) {
                userADSR[note] = velocityDiv;
            // } else if (note === BINDING_MASTER_VOLUME) {
            //     userMasterVolume = velocityDiv;
            //     console.log("userMasterVolume: ", userMasterVolume);
            //     masterGainNode.gain.value = userMasterVolume;
            } else if (note === BINDING_S) {
                if (velocity > 0) {
                    userADSR[BINDING_S] = (userADSR[BINDING_S] === MIN_GAIN_LEVEL) ?
                        MAX_GAIN_LEVEL : MIN_GAIN_LEVEL;
                }
            } else if (note === BINDING_REVERB_WET_MIX) {
                userReverbWetMix = velocityDiv;
                console.log("userReverbWetMix: ", userReverbWetMix);
                reverbDryGainNode.gain.value = 1 - userReverbWetMix;
                reverbWetGainNode.gain.value = userReverbWetMix;
            } else if (note === BINDING_BITCRUSHER) {
                if (velocity > 0) {
                    bitcrusherCurrentValue = (bitcrusherCurrentValue + 1) % BITCRUSHER_VALUES.length;
                    console.log(bitcrusherCurrentValue);
                }

            } else if (note === BINDING_LFO_FREQ) {
                userLFO[BINDING_LFO_FREQ] = (MAX_LFO_FREQ - MIN_LFO_FREQ) * velocityDiv + MIN_LFO_FREQ;
                LFONode.frequency.value = userLFO[BINDING_LFO_FREQ];
                console.log("userLFOFreq: ", userLFO[BINDING_LFO_FREQ]);

            } else if (note === BINDING_LOPASS_FREQ) {
                userLoPass[BINDING_LOPASS_FREQ] = (MAX_LOPASS_FREQ - MIN_LOPASS_FREQ) * velocityDiv + MIN_LOPASS_FREQ;
                loPassFilterNode.frequency.value = userLoPass[BINDING_LOPASS_FREQ];
                console.log("userLoPassFreq: ", userLoPass[BINDING_LOPASS_FREQ]);

            } else if (note === BINDING_LOPASS_Q) {
                userLoPass[BINDING_LOPASS_Q] = (MAX_FILTER_Q - MIN_FILTER_Q) * velocityDiv + MIN_FILTER_Q;
                // loPassFilterNode.Q.value = userLoPass[BINDING_LOPASS_Q];
                console.log("userLoPassQ: ", userLoPass[BINDING_LOPASS_Q]);
            }
        } else if (eventType === "PCMessage") {

        }
    }

    return synth;
}


//
let synth = createSynth();
let inputDevice = createInputDevice();

inputDevice.setSynth(synth);
inputDevice.initializeMIDI();

//

// Create audio context
let aCon = new AudioContext();

let masterGainNode = aCon.createGain();
masterGainNode.gain.value = userMasterVolume;
masterGainNode.connect(aCon.destination);

let reverbDryGainNode = aCon.createGain();
reverbDryGainNode.gain.value = 1 - DEFAULT_WET_MIX;
reverbDryGainNode.connect(masterGainNode);

let reverbWetGainNode = aCon.createGain();
reverbWetGainNode.gain.value = DEFAULT_WET_MIX;
reverbWetGainNode.connect(masterGainNode);

// $FlowIgnore
let reverbBuffer = aCon.createBuffer(2, reverbData.left.length, aCon.sampleRate);
reverbBuffer.copyToChannel(Float32Array.from(reverbData.left), 0, 0);
reverbBuffer.copyToChannel(Float32Array.from(reverbData.right), 1, 0);

let convolverNode = aCon.createConvolver();
convolverNode.buffer = reverbBuffer;
convolverNode.connect(reverbWetGainNode);

let loPassFilterNode = aCon.createBiquadFilter();
loPassFilterNode.type = "lowpass";
loPassFilterNode.frequency.value = DEFAULT_LOPASS_FREQ;
loPassFilterNode.Q.value = DEFAULT_LOPASS_Q;
loPassFilterNode.gain.value = 0;

let oscConnectNode = aCon.createGain();
oscConnectNode.gain.value = userMasterVolume;
oscConnectNode.connect(loPassFilterNode);


let LFONode = aCon.createOscillator();
// $FlowIgnore: waiting for Flow to merge PR
LFONode.type = "sine";
LFONode.frequency.value = DEFAULT_LFO_FREQ;
LFONode.start();
LFONode.connect(oscConnectNode.gain);

let bitCrusherNode = aCon.createScriptProcessor(2048, 1, 1);
loPassFilterNode.connect(bitCrusherNode);

bitCrusherNode.connect(convolverNode);
bitCrusherNode.connect(reverbDryGainNode);
bitCrusherNode.onaudioprocess = function(audioProcessingEvent) {
    // The input buffer is the song we loaded earlier
    let inputBuffer = audioProcessingEvent.inputBuffer;

    // The output buffer contains the samples that will be modified and played
    let outputBuffer = audioProcessingEvent.outputBuffer;

    // Loop through the output channels (in this case there is only one)
    for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
        let inputData = inputBuffer.getChannelData(channel);
        let outputData = outputBuffer.getChannelData(channel);

        let reductionFactor = BITCRUSHER_VALUES[bitcrusherCurrentValue];
        for (let sample = 0; sample < inputBuffer.length; sample += reductionFactor) {
            let sum = 0.0;
            for (let i = 0; i < reductionFactor; ++i) {
                sum += inputData[sample + i];
            }


            sum /= reductionFactor;
            // sum = quantizeResolution(sum, 8);
            for (let i = 0; i < reductionFactor; ++i) {
                outputData[sample + i] = sum;
            }
        }
    }
}

function quantizeResolution(val, nbits) {
    let target = 1 << nbits;
    // if (Math.random() < 0.01) console.log(res);
    let res = Math.round(val * target)  / target;
    return res;
}


function getHighestPriorityNotes(notes) {
    let sorted = notes.slice().sort();
    return sorted.slice(0, SYNTH_MAX_VOICES); // TODO: is slice with end index past the lenght of the array legal????
}

function getLowestPriorityNotes(notes) {
    let sorted = notes.slice().sort();
    sorted.reverse();
    return sorted.slice(0, SYNTH_MAX_VOICES);
}

function lerp(a, b, t) {
    return (b - a) * t + a;
}

function msToS(milliseconds) {
    return milliseconds / 1000;
}

function createVoice(note) {
    let oscNode = aCon.createOscillator();
    // $FlowIgnore: waiting for Flow to merge PR
    oscNode.type = SYNTH_OSC_TYPE;
    oscNode.frequency.value = frequencyFromNote(note);
    // console.log("Frequency for note: ", note, " is ", oscNode.frequency.valuxe);
    oscNode.start();

    let gainNode = aCon.createGain();
    gainNode.gain.value = MIN_GAIN_LEVEL;

    let durationA = msToS(lerp(MIN_ENVELOP_TIME, MAX_A, userADSR[BINDING_A]));
    let durationD = msToS(lerp(MIN_ENVELOP_TIME, MAX_D, userADSR[BINDING_D]));
    let sustainLevel = Math.max(MIN_GAIN_LEVEL, userADSR[BINDING_S]);

    console.log("durationA: ", durationA);
    console.log("durationD: ", durationD);
    console.log("sustainLevel: ", sustainLevel);

    let rampA = new Float32Array([MIN_GAIN_LEVEL, MAX_GAIN_LEVEL]);
    gainNode.gain.setValueCurveAtTime(rampA, aCon.currentTime, durationA);

    let rampD = new Float32Array([MAX_GAIN_LEVEL, sustainLevel]);
    gainNode.gain.setValueCurveAtTime(rampD, aCon.currentTime + durationA, durationD);

    // let now = aCon.currentTime;
    // gainNode.gain.linearRampToValueAtTime(1, now + durationA);
    // gainNode.gain.linearRampToValueAtTime(sustainLevel, now + durationA + durationD);

    oscNode.connect(gainNode);
    gainNode.connect(oscConnectNode);

    return  { "oscNode" : oscNode, "gainNode": gainNode };
}

function killNote(voices, note) {
    // TODO: enhance to kill properly the notes when we are out of voices (note stealing).


    let gainNode = voices[note]["gainNode"];

    let durationR = msToS(lerp(MIN_ENVELOP_TIME, MAX_R, userADSR[BINDING_R]));
    console.log("durationR", durationR);
    gainNode.gain.cancelScheduledValues(aCon.currentTime);
    let rampR = new Float32Array([voices[note]["gainNode"].gain.value, MIN_GAIN_LEVEL]);
    gainNode.gain.setValueCurveAtTime(rampR, aCon.currentTime, durationR);

    // gainNode.gain.exponentialRampToValueAtTime(MIN_GAIN_LEVEL, aCon.currentTime + 10);

    // voices[note]["gainNode"].gain.linearRampToValueAtTime(MIN_GAIN_LEVEL, aCon.currentTime + durationR);
    // voices[note]["gainNode"].gain.setTargetAtTime(MIN_GAIN_LEVEL, aCon.currentTime, durationR);

    delete voices[note];
}

function reclaimVoices(voices, keysPressed) {
    // let allocatedNotes = Object.keys(voices).map(parseInt);

    // for (let i = 0; i < allocatedNotes.length; ++i) {
    //     if (keysPressed.indexOf(+allocatedNotes[i]) === -1) {
    //         killNote(voices, allocatedNotes[i]);
    //     }
    // }

    for (let allocatedNote in voices) {
        if (keysPressed.indexOf(parseInt(allocatedNote)) === -1) {
            killNote(voices, allocatedNote);
        }
    }
}

function frequencyFromNote(note) {
    const A4_FREQ = 440;
    const A4_MIDI_NUMBER = 69;

    return A4_FREQ * Math.pow(2, (note - A4_MIDI_NUMBER) / 12);
}

function readableNote(note) {
    let notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    let octave = parseInt(note / 12) - 1;
    return notes[note % 12] + octave.toString();
}


})();