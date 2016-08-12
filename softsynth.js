/* @flow */
(function() {
"use strict";

// Global synth constants
const SYNTH_MAX_VOICES = 4;
const SYNTH_OSC_TYPE = "sawtooth";

// Used for GainNodes
const MIN_GAIN_LEVEL = 0.0;
const MAX_GAIN_LEVEL = 0.999;

const DEFAULT_MASTER_VOLUME = 0.99;
const DEFAULT_WET_MIX = 1;

// Time-related constants
const MIN_ENVELOPE_DURATION = msToS(2);
const MAX_ATTACK_DURATION = msToS(1000);
const MAX_DECAY_DURATION = msToS(1000);
const MAX_RELEASE_DURATION = msToS(1000);
const DEFAULT_A = MIN_ENVELOPE_DURATION;
const DEFAULT_D = msToS(500);
const DEFAULT_R = msToS(500);

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

const SUSTAIN_VALUES = [0, 0.5, 1];
const SUSTAIN_DEFAULT_INDEX = 2;

const BITCRUSHER_VALUES = [1, 2, 4, 8, 16, 32, 64];
const BITCRUSHER_DEFAULT_INDEX = 0;

Object.resolve = function(path, obj) {
    return path.split('.').reduce(function(prev, curr) {
        return (prev ? prev[curr] : undefined)
    }, obj || self)
}

function readableNote(note) {
    let notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    let octave = parseInt(note / 12) - 1;
    return notes[note % 12] + octave.toString();
}


function _createSetter(objectName, parameterName) {
    return function(value) {
        objectName[parameterName] = value;
    }
}

// TODO: replace JS objects with Map in relevant cases

// -----------------
// -- CONTROLLERS --
// -----------------
function createMIDIInputController() {
    // MIDI constants
    const MIDI_KEY_PRESSED = 9;
    const MIDI_KEY_RELEASED = 8;
    const MIDI_CC_MESSAGE = 11;
    const MIDI_PC_MESSAGE = 12;

    let inputDeviceController =
        { setCCMessageCallback: function() {}
        , setPCMessageCallback: function() {}
        , setKeyCallback: function () {}
        , initializeMIDI: function() {}
        , CCMessageCallback: undefined
        , PCMessageCallback: undefined
        , KeyCallback: undefined

        , midi: undefined };

    function _onMIDIMessage(message) {
        let data = message.data;
        let cmd = data[0] >> 4;
        let channel = data[0] & 0xf;
        let note = data[1];
        let velocity = data[2];
        console.log("cmd, channel, note, velocity", cmd, channel, note, velocity);

        switch (cmd) {
            case MIDI_KEY_PRESSED:
                if (inputDeviceController.KeyCallback) {
                    inputDeviceController.KeyCallback("KeyPressed", note, velocity);
                }
                break;
            case MIDI_KEY_RELEASED:
                if (inputDeviceController.KeyCallback) {
                    inputDeviceController.KeyCallback("KeyReleased", note, velocity);
                }
                break;
            case MIDI_CC_MESSAGE:
                if (inputDeviceController.CCMessageCallback) {
                    inputDeviceController.CCMessageCallback(note, velocity);
                }
                break;
            case MIDI_PC_MESSAGE:
                if (inputDeviceController.PCMessageCallback) {
                   inputDeviceController.PCMessageCallback(note, velocity);
                }
                break;
        }
    }

    // -- METHODS --
    // -------------
    inputDeviceController.initializeMIDI = function() {
        // request MIDI access
        if (navigator.requestMIDIAccess) {
            navigator.requestMIDIAccess({
                sysex: false
            }).then(onMIDISuccess, onMIDIFailure);
        }

        // midi functions
        function onMIDISuccess(midiAccess) {
            // when we get a succesful response, run this code
            inputDeviceController.midi = midiAccess; // this is our raw MIDI rdata, inputs, outputs, and sysex status

            let inputs = inputDeviceController.midi.inputs.values();
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

    inputDeviceController.setCCMessageCallback = _createSetter(inputDeviceController, "CCMessageCallback");
    inputDeviceController.setPCMessageCallback = _createSetter(inputDeviceController, "PCMessageCallback");
    inputDeviceController.setKeyCallback = _createSetter(inputDeviceController, "KeyCallback");

    return inputDeviceController;
}

// -----------
// -- MODEL --
// -----------
function createSynthParamModel() {
    const MIDI_NUMBER_A = 5;
    const MIDI_NUMBER_D = 6;
    const MIDI_NUMBER_R = 7;
    const MIDI_NUMBER_S = 12;
    const MIDI_NUMBER_LOPASS_FREQ = 1;
    const MIDI_NUMBER_TREMOLO_FREQ = 2;
    const MIDI_NUMBER_REVERB_WET_MIX = 8;
    const MIDI_NUMBER_BITCRUSHER_NEXT = 15;
    const MIDI_NUMBER_MASTER_VOLUME = 4;

    let synthParamModel =
        { initializeSynthWithDefaultParams: function() {}
        , setSynth: function() {}
        , onCCMessage: function() {}
        , onKey: function() {}

        , synthObject: undefined

        , keysPressed: []

        , parameters : // All these parameters are stored in their respective units: GainValue, seconds, Hertz, ...
            { "volumeEnvelopeAttack": DEFAULT_A
            , "volumeEnvelopeDecay": DEFAULT_D
            , "volumeEnvelopeSustain": [SUSTAIN_DEFAULT_INDEX, SUSTAIN_VALUES]
            , "volumeEnvelopeRelease": DEFAULT_R

            , "loPassQ": DEFAULT_LOPASS_Q
            , "loPassFreq": DEFAULT_LOPASS_FREQ

            , "tremoloFreq": DEFAULT_LFO_FREQ

            , "reverbWetMix": DEFAULT_WET_MIX

            , "bitCrusherDownsamplingRate": [BITCRUSHER_DEFAULT_INDEX, BITCRUSHER_VALUES]

            , "masterVolume": DEFAULT_MASTER_VOLUME
            }
    };

    const inputMappings =
        { [MIDI_NUMBER_A]: "volumeEnvelopeAttack"
        , [MIDI_NUMBER_D]: "volumeEnvelopeDecay"
        , [MIDI_NUMBER_S]: "volumeEnvelopeSustain"
        , [MIDI_NUMBER_R]: "volumeEnvelopeRelease"

        , [MIDI_NUMBER_LOPASS_FREQ]: "loPassFreq"

        , [MIDI_NUMBER_TREMOLO_FREQ]: "tremoloFreq"

        , [MIDI_NUMBER_REVERB_WET_MIX]: "reverbWetMix"

        , [MIDI_NUMBER_BITCRUSHER_NEXT]: "bitCrusherDownsamplingRate"

        , [MIDI_NUMBER_MASTER_VOLUME]: "masterVolume"
    }

    // TODO: is toggle input always a list??
    // think really hard about whether this is always the case, and either way
    // refactor the code to avoid the duplication
    const inputTypes =
        { [MIDI_NUMBER_A]: "knob"
        , [MIDI_NUMBER_D]: "knob"
        , [MIDI_NUMBER_S]: "toggle"
        , [MIDI_NUMBER_R]: "knob"

        , [MIDI_NUMBER_LOPASS_FREQ]: "knob"

        , [MIDI_NUMBER_TREMOLO_FREQ]: "knob"

        , [MIDI_NUMBER_REVERB_WET_MIX]: "knob"

        , [MIDI_NUMBER_BITCRUSHER_NEXT]: "toggle"

        , [MIDI_NUMBER_MASTER_VOLUME]: "knob"
    }

    const lerpMappings =
        { "volumeEnvelopeAttack": [MIN_ENVELOPE_DURATION, MAX_ATTACK_DURATION]
        , "volumeEnvelopeDecay": [MIN_ENVELOPE_DURATION, MAX_DECAY_DURATION]
        , "volumeEnvelopeRelease": [MIN_ENVELOPE_DURATION, MAX_RELEASE_DURATION]

        , "loPassFreq": [MIN_LOPASS_FREQ, MAX_LOPASS_FREQ]
        , "tremoloFreq": [MIN_LFO_FREQ, MAX_LFO_FREQ]
    };

    function _lerp(a, b, t) {
        return (b - a) * t + a;
    }

    synthParamModel.initializeSynthWithDefaultParams = function() {
        Object.keys(synthParamModel.parameters).forEach(function(key) {
            if (synthParamModel.synthObject) {
                synthParamModel.synthObject.setParam(key, synthParamModel.parameters[key]);
            }
        });
    }

    synthParamModel.setSynth = _createSetter(synthParamModel, "synthObject");

    synthParamModel.onCCMessage = function(messageNumber, value) {
        let paramName = inputMappings[messageNumber];
        let normalizedValue = value / 127;

        if (paramName) {
            let paramLerpMapping = lerpMappings[paramName];

            let newParamValue = undefined;

            if (inputTypes[paramName] === "knob") {
                newParamValue = normalizedValue;
                if (paramLerpMapping) {
                    newParamValue = _lerp(paramLerpMapping[0], paramLerpMapping[1], normalizedValue);
                }


                synthParamModel.parameters[paramName] = newParamValue;
                synthParamModel.synthObject.setParam(paramName, newParamValue);

            } else if (inputTypes[messageNumber] === "toggle") {
                if (value > 0) {
                    let idx = synthParamModel.parameters[paramName][0];
                    let array = synthParamModel.parameters[paramName][1];
                    let newIndex = (idx + 1) % array.length;
                    newParamValue = [newIndex, array];

                    synthParamModel.parameters[paramName] = newParamValue;
                    synthParamModel.synthObject.setParam(paramName, newParamValue);
                }
            }


        } else {
            console.log("No bindings for CC Message #", messageNumber);
        }
    }

    synthParamModel.onKey = function(eventType, note, velocity) {
        // update model
        if (eventType == "KeyPressed") {
            synthParamModel.keysPressed.push(note);
        } else if (eventType === "KeyReleased") {
            let i = synthParamModel.keysPressed.indexOf(note);
            if (i > -1) {
                synthParamModel.keysPressed.splice(i, 1);
            }
        }

        if (synthParamModel.synthObject) {
            synthParamModel.synthObject.onKey(eventType, synthParamModel.keysPressed, note, velocity);
        }
    }

    return synthParamModel;
}

// -----------
// -- VIEW --
// -----------
function createSynth() {
    let synth =
        { onKey: function() {}
        , setParam: function() {}

        , audioContext: undefined
        , voices: {}
    };

    // -- UTILS --
    // -----------
    function _frequencyFromNote(note) {
        const A4_FREQ = 440;
        const A4_MIDI_NUMBER = 69;

        return A4_FREQ * Math.pow(2, (note - A4_MIDI_NUMBER) / 12);
    }

    function _getHighestPriorityNotes(notes) {
        let sorted = notes.slice().sort();
        return sorted.slice(0, SYNTH_MAX_VOICES); // TODO: is slice with end index past the lenght of the array legal????
    }

    function _msToS(milliseconds) {
        return milliseconds / 1000;
    }

    // -- SYNTH TOPOLOGY --
    // --------------------
    function _initialize() {
        // TODO use parameters instead of DEFAULT_* constants
        let audioContext = new AudioContext();
        synth.audioContext = audioContext;

        let masterGainNode = audioContext.createGain();
        masterGainNode.gain.value = DEFAULT_MASTER_VOLUME;
        masterGainNode.connect(audioContext.destination);
        synth.masterGainNode = masterGainNode;

        let reverbDryGainNode = audioContext.createGain();
        reverbDryGainNode.gain.value = 1 - DEFAULT_WET_MIX;
        reverbDryGainNode.connect(masterGainNode);
        synth.reverbDryGainNode = reverbDryGainNode;

        let reverbWetGainNode = audioContext.createGain();
        reverbWetGainNode.gain.value = DEFAULT_WET_MIX;
        reverbWetGainNode.connect(masterGainNode);
        synth.reverbWetGainNode = reverbWetGainNode;

        // $FlowIgnore
        // TODO move reverbData.. somewhere else ?
        let reverbBuffer = audioContext.createBuffer(2, window.reverbData.left.length, audioContext.sampleRate);
        reverbBuffer.copyToChannel(Float32Array.from(window.reverbData.left), 0, 0);
        reverbBuffer.copyToChannel(Float32Array.from(window.reverbData.right), 1, 0);
        synth.reverbBuffer = reverbBuffer;

        let convolverNode = audioContext.createConvolver();
        convolverNode.buffer = reverbBuffer;
        convolverNode.connect(reverbWetGainNode);
        synth.convolverNode = convolverNode;

        let loPassFilterNode = audioContext.createBiquadFilter();
        loPassFilterNode.type = "lowpass";
        loPassFilterNode.frequency.value = DEFAULT_LOPASS_FREQ;
        loPassFilterNode.Q.value = DEFAULT_LOPASS_Q;
        loPassFilterNode.gain.value = 0;
        synth.loPassFilterNode = loPassFilterNode;

        let oscConnectNode = audioContext.createGain();
        oscConnectNode.gain.value = DEFAULT_MASTER_VOLUME; // FIXME
        oscConnectNode.connect(loPassFilterNode);
        synth.oscConnectNode = oscConnectNode;

        let LFONode = audioContext.createOscillator();
        // $FlowIgnore: waiting for Flow to merge PR
        LFONode.type = "sine";
        LFONode.frequency.value = DEFAULT_LFO_FREQ;
        LFONode.start();
        LFONode.connect(synth.oscConnectNode.gain);
        synth.LFONode = LFONode;

        let bitCrusherNode = audioContext.createScriptProcessor(2048, 1, 1);
        synth.loPassFilterNode.connect(bitCrusherNode);

        bitCrusherNode.connect(convolverNode);
        bitCrusherNode.connect(reverbDryGainNode);
        synth.bitCrusherNode = bitCrusherNode;

        bitCrusherNode.onaudioprocess = function(audioProcessingEvent) {

            function _quantizeResolution(val, nbits) {
                let target = 1 << nbits;
                // if (Math.random() < 0.01) console.log(res);
                let res = Math.round(val * target)  / target;
                return res;
            }
            // The input buffer is the song we loaded earlier
            let inputBuffer = audioProcessingEvent.inputBuffer;

            // The output buffer contains the samples that will be modified and played
            let outputBuffer = audioProcessingEvent.outputBuffer;

            // Loop through the output channels (in this case there is only one)
            for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
                let inputData = inputBuffer.getChannelData(channel);
                let outputData = outputBuffer.getChannelData(channel);

                let reductionFactor = parameterStorage["bitCrusherDownsamplingRate"];
                for (let sample = 0; sample < inputBuffer.length; sample += reductionFactor) {
                    let sum = 0.0;
                    for (let i = 0; i < reductionFactor; ++i) {
                        sum += inputData[sample + i];
                    }

                    sum /= reductionFactor;
                    sum = _quantizeResolution(sum, 8);
                    for (let i = 0; i < reductionFactor; ++i) {
                        outputData[sample + i] = sum;
                    }
                }
            }
        }
    }

    // -- VOICE ALLOCATION / DEALLOCATION --
    // -------------------------------------
    function _createVoice(note) {
        let oscNode = synth.audioContext.createOscillator();
        // $FlowIgnore: waiting for Flow to merge PR
        oscNode.type = SYNTH_OSC_TYPE;
        oscNode.frequency.value = _frequencyFromNote(note);
        // console.log("Frequency for note: ", note, " is ", oscNode.frequency.valuxe);
        oscNode.start();

        let gainNode = synth.audioContext.createGain();
        gainNode.gain.value = MIN_GAIN_LEVEL;

        let durationA = parameterStorage["volumeEnvelopeAttack"];
        let durationD = parameterStorage["volumeEnvelopeDecay"];
        let sustainLevel = parameterStorage["volumeEnvelopeSustain"]; //Math.max(MIN_GAIN_LEVEL, userADSR[BINDING_S]);

        let rampA = new Float32Array([MIN_GAIN_LEVEL, MAX_GAIN_LEVEL]);
        gainNode.gain.setValueCurveAtTime(rampA, synth.audioContext.currentTime, durationA);

        let rampD = new Float32Array([MAX_GAIN_LEVEL, sustainLevel]);
        gainNode.gain.setValueCurveAtTime(rampD, synth.audioContext.currentTime + durationA, durationD);

        oscNode.connect(gainNode);
        gainNode.connect(synth.oscConnectNode);

        return  { "oscNode" : oscNode, "gainNode": gainNode };
    }

    function _allocateVoices(notes) {
        let highestPriorityNotes = _getHighestPriorityNotes(notes);
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
                _killNote(synth.voices, noteToStealFrom);
            }
            synth.voices[noteToAllocate] = _createVoice(noteToAllocate);
        }
    }

    function _reclaimVoices(voices, keysPressed) {
        for (let allocatedNote in voices) {
            if (keysPressed.indexOf(parseInt(allocatedNote)) === -1) {
                _killNote(voices, allocatedNote);
            }
        }
    }

    function _killNote(voices, note) {
        // TODO: enhance to kill properly the notes when we are out of voices (note stealing).

        let gainNode = voices[note]["gainNode"];

        let durationR = parameterStorage["volumeEnvelopeRelease"];
        gainNode.gain.cancelScheduledValues(synth.audioContext.currentTime);

        let rampR = new Float32Array([voices[note]["gainNode"].gain.value, MIN_GAIN_LEVEL]);
        gainNode.gain.setValueCurveAtTime(rampR, synth.audioContext.currentTime, durationR);

        delete voices[note];
    }

    // -- CALLBACKS --
    // ---------------
    const parameterBindings =
        { "volumeEnvelopeAttack": undefined // undefined because they're gonna be in storage
        , "volumeEnvelopeDecay": undefined
        , "volumeEnvelopeSustain": SUSTAIN_VALUES
        , "volumeEnvelopeRelease": undefined

        , "loPassFreq": "loPassFilterNode.frequency"
        , "tremoloFreq": "LFONode.frequency"
        , "reverbWetMix": ["reverbWetGainNode.gain", "reverbDryGainNode.gain"]
        , "bitCrusherDownsamplingRate": BITCRUSHER_VALUES // TODO CHANGE THIS
        , "masterVolume": "masterGainNode.gain"
    };

    const parameterTypes =
        { "volumeEnvelopeAttack": "stored"
        , "volumeEnvelopeDecay": "stored"
        , "volumeEnvelopeSustain": "listValueStored"
        , "volumeEnvelopeRelease": "stored"

        , "loPassFreq": "scalar"
        , "tremoloFreq": "scalar"
        , "reverbWetMix": "mix"
        , "bitCrusherDownsamplingRate": "listValueStored"
        , "masterVolume": "scalar"
    };

    let parameterStorage = {};

    synth.setParam = function(paramName, value) {
        console.log(paramName, ": ", value);
        let paramType = parameterTypes[paramName];
        let paramBindingName = parameterBindings[paramName];

        if (paramType == "scalar" && paramBindingName) {
            let paramObject = Object.resolve(paramBindingName, synth);
            paramObject.value = value;
        } else if (paramType == "mix" && paramBindingName) {
            let paramObjects = [Object.resolve(paramBindingName[0], synth),
                                Object.resolve(paramBindingName[1], synth)];
            paramObjects[0].value = value;
            paramObjects[1].value = 1 - value;
        } else if (paramType == "stored") {
            parameterStorage[paramName] = value;
        } else if (paramType == "listValueStored") {
            let idx = value[0];
            let array = value[1];
            if (idx < array.length) { // CHANGE THIS
                parameterStorage[paramName] = array[idx];
            }
        }
    }

    synth.onKey = function(eventType, keysPressed, note, velocity) {
        if (eventType === "KeyPressed") {

        } else if (eventType === "KeyReleased") {

        }

        _reclaimVoices(synth.voices, keysPressed);

        if (keysPressed.length > 0) {
            _allocateVoices(keysPressed);
        }
    }

    _initialize();
    return synth;
}

let synth = createSynth();
let synthParamModel = createSynthParamModel();
let MIDIInputController = createMIDIInputController();

synthParamModel.setSynth(synth);
synthParamModel.initializeSynthWithDefaultParams();

MIDIInputController.setCCMessageCallback(synthParamModel.onCCMessage);
// MIDIInputController.setPCMessageCallback(synthParamModel.onPCMessage);
MIDIInputController.setKeyCallback(synthParamModel.onKey);
MIDIInputController.initializeMIDI();

// Create audio context

function msToS(milliseconds) {
    return milliseconds / 1000;
}

})();
