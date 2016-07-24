"use strict";

const KEY_PRESSED = 9;
const KEY_RELEASED = 8;
const CC_MESSAGE = 11;
const PC_MESSAGE = 12;

const A4_FREQ = 440;
const A4_MIDI_NUMBER = 69;

const MAX_VOICES = 2;
const OSC_TYPE = "sine";

const ADS_LENGTH = 0.5;
const R_LENGTH = 1.0;

var midi, reverbData, gKeysPressed = [], gVoices = {};

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

var ADS = new Float32Array(7);
ADS[0] = 0.5;
ADS[1] = 0.7;
ADS[2] = 1.0;
ADS[3] = 0.9;
ADS[4] = 0.8;
ADS[5] = 0.7;
ADS[6] = 0.7;

var R = new Float32Array(2);
R[0] = 0.7;
R[1] = 0.0;

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

function createVoice(note) {
    var osc = aCon.createOscillator();
    osc.type = OSC_TYPE;
    osc.frequency.value = frequencyFromNote(note);
    // console.log("Frequency for note: ", note, " is ", osc.frequency.valuxe);
    osc.start();

    var gain = aCon.createGain();
    gain.gain.value = 1;

    osc.connect(gain);
    gain.connect(aCon.destination);

    return  { "osc" : osc, "gain": gain };
}

function killNote(voices, note) {
    voices[note].gain.disconnect(aCon.destination);
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
    console.log("###########", Object.keys(voices));
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
    console.log("cmd, channel, note, velocity", cmd, channel, readableNote(note), velocity);

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
    }

    reclaimVoices(gVoices, gKeysPressed);

    if (gKeysPressed.length > 0) {
        allocateVoices(gVoices, gKeysPressed);
    }

    // if (releasedKey) {
    //     for (var i in voices) {
    //         var current_voice = voices[i];
    //         if (current_voice.note === releasedKey) {
    //             current_voice.gain.gain.setValueCurveAtTime(R, aCon.currentTime, R_LENGTH);
    //             current_voice.status = "dying";
    //             current_voice.death_time = aCon.currentTime;
    //             break;
    //         }
    //     }
    // }


    // for (var k in gKeysPressed.slice(0, MAX_VOICES)) {
    //     var note = gKeysPressed[k];

    //     if (!voices[note]) {

    //     }
    // }
    // switch (cmd) {
    //     case KEY_PRESSED:

    //         if (gKeysPressed.indexOf(note) === -1) {
    //             gKeysPressed.push(note);

    //             if (Object.keys(voices).length < MAX_VOICES) {
    //                 var osc = aCon.createOscillator();
    //                 osc.frequency.value = frequencyFromNote(note);
    //                 osc.type = OSC_TYPE;
    //                 osc.start();

    //                 var gain = aCon.createGain();
    //                 gain.gain.setValueCurveAtTime(ADS, aCon.currentTime, ADS_LENGTH);

    //                 osc.connect(gain);
    //                 gain.connect(aCon.destination);

    //                 voices[note] = { "osc" : osc, "gain": gain };
    //                 // console.log("KEY_PRESSED: voices = ", voices);
    //             }
    //         }
    //         console.log("KEY_PRESSED: gKeysPressed = ", gKeysPressed.map(readableNote));
    //         break;
    //     case KEY_RELEASED:
    //         // console.log("KEY_RELEASED: voices = ", voices);

    //         var i = gKeysPressed.indexOf(note);
    //         if (i > -1) {
    //             gKeysPressed.splice(i, 1);
    //         }

    //         if (voices[note]) {
    //             voices[note]["gain"].gain.setValueCurveAtTime(R, aCon.currentTime, R_LENGTH);

    //             setTimeout(function () {
    //                 var osc = voices[note]["osc"];
    //                 var gain = voices[note]["gain"];

    //                 osc.stop();
    //                 osc.disconnect();
    //                 gain.disconnect();
    //                 delete voices[note];
    //             }, R_LENGTH * 1000 /* milliseconds */);

    //         }
    //         console.log("KEY_RELEASED: gKeysPressed = ", gKeysPressed.map(readableNote));
    //         break;
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

// var reverbBuffer = aCon.createBuffer(2, reverbData.left.length, aCon.sampleRate);
// reverbBuffer.copyToChannel(Float32Array.from(reverbData.left), 0, 0);
// reverbBuffer.copyToChannel(Float32Array.from(reverbData.right), 1, 0);

// var convolution = aCon.createConvolver();
// convolution.buffer = reverbBuffer;





