/* @flow */
(function() {
"use strict";

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
const BITCRUSHER_DEFAULT = 0;


function readableNote(note) {
    let notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    let octave = parseInt(note / 12) - 1;
    return notes[note % 12] + octave.toString();
}

function createInputDevice() {
    // MIDI constants
    const MIDI_KEY_PRESSED = 9;
    const MIDI_KEY_RELEASED = 8;
    const MIDI_CC_MESSAGE = 11;
    const MIDI_PC_MESSAGE = 12;

    // TODO: inputDevice should have a proper flow type
    let inputDevice = { keysPressed: [], setSynth: undefined, initializeMIDI: undefined,
        synthParamModel: undefined, midi: undefined };

    let _onMIDIMessage = function(message) {
        if (inputDevice.synthParamModel) {
            let data = message.data;
            let cmd = data[0] >> 4;
            let channel = data[0] & 0xf;
            let note = data[1];
            let velocity = data[2];
            console.log("cmd, channel, note, velocity", cmd, channel, note, velocity);

            switch (cmd) {
                case MIDI_KEY_PRESSED:
                    inputDevice.keysPressed.push(note);

                    // $FlowIgnore: TODO add proper type for inputDevice.synthParamModel
                    inputDevice.synthParamModel.onKey("KeyPressed", inputDevice.keysPressed, note, velocity);
                    break;
                case MIDI_KEY_RELEASED:
                    let i = inputDevice.keysPressed.indexOf(note);
                    if (i > -1) {
                        inputDevice.keysPressed.splice(i, 1);
                    }

                    // $FlowIgnore: TODO add proper type for inputDevice.synthParamModel
                    inputDevice.synthParamModel.onKey("KeyReleased", inputDevice.keysPressed, note, velocity);
                    break;
                case MIDI_CC_MESSAGE:
                    // $FlowIgnore: TODO add proper type for inputDevice.synthParamModel
                    inputDevice.synthParamModel.onMessage("CCMessage", note, velocity);
                    break;
                case MIDI_PC_MESSAGE:
                    // $FlowIgnore: TODO add proper type for inputDevice.synthParamModel
                    inputDevice.synthParamModel.onMessage("PCMessage", note, velocity);
                    break;
            }
        }
    }

    inputDevice.initializeMIDI = function() {
        if (!inputDevice.synthParamModel) {
            console.log("Initialize a synthParamModel before calling InitializeMIDI()");
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

function createSynthParamModel() {
    const MIDI_NUMBER_A = 5;
    const MIDI_NUMBER_D = 6;
    const MIDI_NUMBER_R = 7;
    const MIDI_NUMBER_S = 12;
    const MIDI_NUMBER_LOPASS_FREQ = 1;
    const MIDI_NUMBER_TREMOLO_FREQ = 2;
    const MIDI_NUMBER_REVERB_WET_MIX = 7;
    const MIDI_NUMBER_BITCRUSHER = 15;
    const MIDI_NUMBER_MASTER_VOLUME = 4;

    let synthParamModel =
        { synthObject: undefined

        , keysPressed: []

        , parameters :
            { attack: msToS(DEFAULT_A)
            , decay: msToS(DEFAULT_D)
            , sustain: DEFAULT_SUSTAIN
            , release: msToS(DEFAULT_R)

            , loPassQ: DEFAULT_LOPASS_Q
            , loPassFreq: DEFAULT_LOPASS_FREQ

            , tremoloFreq: DEFAULT_LFO_FREQ

            , reverbWetMix: DEFAULT_WET_MIX

            , bitCrusherDownsamplingRate: BITCRUSHER_DEFAULT

            , masterVolume: DEFAULT_MASTER_VOLUME }

    };

    const inputMappings =
        { MIDI_NUMBER_A: "volumeEnvelopeAttack"
        , MIDI_NUMBER_D: "volumeEnvelopeDecay"
        , MIDI_NUMBER_S: "volumeEnvelopeSustain"
        , MIDI_NUMBER_R: "volumeEnvelopeRelease"

        , MIDI_NUMBER_LOPASS_FREQ: "loPassFreq"

        , MIDI_NUMBER_TREMOLO_FREQ: "tremoloFreq"

        , MIDI_NUMBER_REVERB_WET_MIX: "reverbWetMix"

        , MIDI_NUMBER_BITCRUSHER: "bitCrusherDownsamplingRateNext"

        , MIDI_NUMBER_MASTER_VOLUME: "masterVolume"
    }

    synthParamModel.initializeSynthWithDefaultParams = function() {
        // TODO call setParam for all synthParamModel.parameters
    }

    synthParamModel.setSynth = function(synthObject) {
        synthParamModel.synthObject = synthObject;
    }

    synthParamModel.CCMessageCallback = function(messageNumber, value) {
        let paramName = inputMappings[messageNumber];
        let valueNormalized = value / 127;

        if (paramName) {
            synthObject.setParam(paramName, valueNormalized);
        } else {
            console.log("No bindings for CC Message #", messageNumber);
        }
        // if (BINDINGS_ADS.has(messageNumber)) {
        //     userADSR[messageNumber] = valueNormalized;
        //     // } else if (messageNumber === MIDI_NUMBER_MASTER_VOLUME) {
        //     //     userMasterVolume = valueNormalized;
        //     //     console.log("userMasterVolume: ", userMasterVolume);
        //     //     masterGainNode.gain.value = userMasterVolume;
        // } else if (messageNumber === BINDING_S) {
        //     if (value > 0) {
        //         userADSR[BINDING_S] = (userADSR[BINDING_S] === MIN_GAIN_LEVEL) ?
        //         MAX_GAIN_LEVEL : MIN_GAIN_LEVEL;
        //     }
        // } else if (messageNumber === BINDING_REVERB_WET_MIX) {
        //     userReverbWetMix = valueNormalized;
        //     console.log("userReverbWetMix: ", userReverbWetMix);
        //     synth.reverbDryGainNode.gain.value = 1 - userReverbWetMix;
        //     synth.reverbWetGainNode.gain.value = userReverbWetMix;
        // } else if (messageNumber === BINDING_BITCRUSHER) {
        //     if (value > 0) {
        //         bitcrusherCurrentValue = (bitcrusherCurrentValue + 1) % BITCRUSHER_VALUES.length;
        //         console.log(bitcrusherCurrentValue);
        //     }

        // } else if (messageNumber === BINDING_LFO_FREQ) {
        //     userLFO[BINDING_LFO_FREQ] = (MAX_LFO_FREQ - MIN_LFO_FREQ) * valueNormalized + MIN_LFO_FREQ;
        //     synth.LFONode.frequency.value = userLFO[BINDING_LFO_FREQ];
        //     console.log("usertremoloFreq: ", userLFO[BINDING_LFO_FREQ]);

        // } else if (messageNumber === BINDING_LOPASS_FREQ) {
        //     userLoPass[BINDING_LOPASS_FREQ] = (MAX_LOPASS_FREQ - MIN_LOPASS_FREQ) * valueNormalized + MIN_LOPASS_FREQ;
        //     synth.loPassFilterNode.frequency.value = userLoPass[BINDING_LOPASS_FREQ];
        //     console.log("userLoPassFreq: ", userLoPass[BINDING_LOPASS_FREQ]);

        // } else if (messageNumber === BINDING_LOPASS_Q) {
        //     userLoPass[BINDING_LOPASS_Q] = (MAX_FILTER_Q - MIN_FILTER_Q) * valueNormalized + MIN_FILTER_Q;
        //         // loPassFilterNode.Q.value = userLoPass[BINDING_LOPASS_Q];
        //         console.log("userLoPassQ: ", userLoPass[BINDING_LOPASS_Q]);
        // }
    }

    return synthParamModel;
}

function createSynth() {
    let synth = { voices: {}, onKey: undefined, onMessage: undefined };

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

    function _lerp(a, b, t) {
        return (b - a) * t + a;
    }

    function _msToS(milliseconds) {
        return milliseconds / 1000;
    }

    // -- SYNTH TOPOLOGY --
    // --------------------
    function _initialize() {
        let audioContext = new AudioContext();
        synth.audioContext = audioContext;

        let masterGainNode = audioContext.createGain();
        masterGainNode.gain.value = userMasterVolume;
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
        oscConnectNode.gain.value = userMasterVolume;
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

                let reductionFactor = BITCRUSHER_VALUES[bitcrusherCurrentValue];
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

        let durationA = _msToS(_lerp(MIN_ENVELOP_TIME, MAX_A, userADSR[BINDING_A]));
        let durationD = _msToS(_lerp(MIN_ENVELOP_TIME, MAX_D, userADSR[BINDING_D]));
        let sustainLevel = Math.max(MIN_GAIN_LEVEL, userADSR[BINDING_S]);

        // console.log("durationA: ", durationA);
        // console.log("durationD: ", durationD);
        // console.log("sustainLevel: ", sustainLevel);

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

        let durationR = _msToS(_lerp(MIN_ENVELOP_TIME, MAX_R, userADSR[BINDING_R]));
        console.log("durationR", durationR);
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
        , "volumeEnvelopeSustain": undefined
        , "volumeEnvelopeRelease": undefined

        , "loPassFreq": synth.loPassFilterNode.frequency.value
        , "tremoloFreq": synth.LFONode.frequency.value
        , "reverbWetMix": [synth.reverbWetGainNode.gain.value, synth.reverbDryGainNode.gain.value]
        , "bitCrusherDownsamplingRate": BITCRUSHER_VALUES
        , "masterVolume": synth.masterGainNode.gain.value
    };

    const parameterTypes =
        { "volumeEnvelopeAttack": "stored"
        , "volumeEnvelopeDecay": "stored"
        , "volumeEnvelopeSustain": "stored"
        , "volumeEnvelopeRelease": "stored"

        , "loPassFreq": "scalar"
        , "tremoloFreq": "scalar"
        , "reverbWetMix": "mix"
        , "bitCrusherDownsamplingRate": "listValueStored"
        , "masterVolume": "scalar"
    };

    let parameterStorage = {};

    synth.setParam = function(paramName, value) {
        let paramType = parameterTypes[paramName];
        let paramBinding = parameterBindings[paramName];

        if (paramBinding) {
            if (paramType == "scalar") {
                paramBinding = value;
            } else if (paramType == "mix") {
                paramBinding[0] = value;
                paramBinding[1] = 1 - value;
            } else if (paramType == "stored") {
                parameterStorage[paramName] = value;
            } else if (paramType == "listValueStored") {
                if (value < paramBinding.length) {
                    parameterStorage[paramName] = value;
                }
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
let synthParamModel = createMappingInterface();
let MIDIInputDevice = createMIDIInputDevice();

synthParamModel.setSynth(synth);
synthParamModel.initializeSynthWithDefaultParams();

MIDIInputDevice.setCCMessageCallback(synth.CCMessageCallback);
MIDIInputDevice.initializeMIDI();

// Create audio context

function msToS(milliseconds) {
    return milliseconds / 1000;
}

})();
