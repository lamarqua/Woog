#!/usr/local/bin/python3

import sys
import wave
import json
import struct

def grouped(l, n):
	return zip(*[iter(l)] * n)

MAX_WAV_SIGNED16 = 32760
def convert_data_to_float(data, bytes_per_sample):
	max_value = float(MAX_WAV_SIGNED16 if bytes_per_sample == 2 else 127)
	format_string = "<h" if bytes_per_sample == 2 else "<b"
	res = []
	for i in range(0, len(data), bytes_per_sample):
		data_bytes = data[i:i+bytes_per_sample]
		(sample_int, ) = struct.unpack(format_string, data_bytes)
		res.append(float(sample_int) / max_value)
	return res

if __name__ == "__main__":
	with wave.open(sys.argv[1], "rb") as f:
		data = f.readframes(f.getnframes())

		bytes_per_sample = f.getsampwidth()
		data_L = bytes([v for (i, v) in enumerate(data) if i % 4 <= 1])
		data_R = bytes([v for (i, v) in enumerate(data) if i % 4 >= 2])
		# data_L = bytes(data)
		# data_R = bytes(data)

		json_data = { "left" : convert_data_to_float(data_L, bytes_per_sample), "right" : convert_data_to_float(data_R, bytes_per_sample) }

		print("var reverbData = ", json.dumps(json_data, indent=4))

		# print("var myArrayBuffer = audioCtx.createBuffer(%d, %d, audioCtx.sampleRate);"
		# 	% (f.getnchannels(), f.getnframes()))

