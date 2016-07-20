"use strict";

const WIDTH = 400;
const HEIGHT = 400;

var audioCtx = new AudioContext();
var analyser = audioCtx.createAnalyser();
var canvas = document.querySelector('canvas');
var canvasCtx = canvas.getContext("2d");

analyser.fftSize = 2048;

var bufferLength = analyser.frequencyBinCount;
var dataArray = new Uint8Array(bufferLength);

var source;

navigator.getUserMedia (
  // constraints - only audio needed for this app
  {
    audio: true
  },

  // Success callback
  function(stream) {
    source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);
    analyser.connect(audioCtx.destination);

  },

  // Error callback
  function(err) {
    console.log('The following gUM error occured: ' + err);
  }
);


function draw() {

	var drawVisual = requestAnimationFrame(draw);

	analyser.getByteTimeDomainData(dataArray);

	canvasCtx.fillStyle = 'rgb(200, 200, 200)';
	canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);

	canvasCtx.lineWidth = 2;
	canvasCtx.strokeStyle = 'rgb(0, 0, 0)';

	canvasCtx.beginPath();

	var sliceWidth = WIDTH * 1.0 / bufferLength;
	var x = 0;

	for(var i = 0; i < bufferLength; i++) {

		var v = dataArray[i] / 128.0;
		var y = v * HEIGHT/2;

		if(i === 0) {
			canvasCtx.moveTo(x, y);
		} else {
			canvasCtx.lineTo(x, y);
		}

		x += sliceWidth;
	}

	canvasCtx.lineTo(canvas.width, canvas.height/2);
	canvasCtx.stroke();
};

draw();

// var audioCtx = new AudioContext();
// var scriptNode = audioCtx.createScriptProcessor(4096, 1, 1);

// var prev_value = -1.0;

// scriptNode.onaudioprocess = function(audioProcessingEvent) {
//   // var inputBuffer = audioProcessingEvent.inputBuffer;

//   var outputBuffer = audioProcessingEvent.outputBuffer;

//   for (var channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
//     // var inputData = inputBuffer.getChannelData(channel);
//     var outputData = outputBuffer.getChannelData(channel);

//     // Loop through the 4096 samples
//     for (var sample = 0; sample < outputBuffer.length; sample++) {
//       // make output equal to the same as the input
//       // outputData[sample] = inputData[sample];

//       // add noise to each output sample
//       outputData[sample] = prev_value;
//       prev_value += 2 / 100;
//       if (prev_value >= 1.0) {
//       	prev_value = -1.0;
//       }
//     }
//   }
// }

// var playButton = document.querySelector("button");

// playButton.onclick = function() {
//   console.log("CLICKED LULZ");
//   scriptNode.connect(audioCtx.destination);
//   playButton.onclick = function() { scriptNode.disconnect(); }
// }