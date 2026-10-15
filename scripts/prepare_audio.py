"""Extract audible clicks from fully decoded PCM, avoiding inaccurate MP3 seeks.
Requires ffmpeg; output is committed, so deployment needs no audio tooling.
"""
from array import array
import json
import math
from pathlib import Path
import subprocess
import tempfile
import wave

ROOT = Path(__file__).resolve().parents[1] / 'assets' / 'audio'
RATE = 44100
ORIGINAL_CUES = [(0.970, .075), (1.070, .075), (1.169, .075), (1.270, .085),
                 (1.405, .085), (1.544, .085), (1.758, .085), (2.295, .085)]

def write(path, samples):
    with wave.open(str(path), 'wb') as output:
        output.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
        output.writeframes(samples.tobytes())

def main():
    with tempfile.TemporaryDirectory() as temporary:
        pcm = Path(temporary) / 'source.wav'
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
                        '-i', str(ROOT / 'revolver-spin.mp3'), '-ac', '1', '-ar', str(RATE), str(pcm)], check=True)
        with wave.open(str(pcm)) as source:
            samples = array('h', source.readframes(source.getnframes()))
    sprite = array('h', [0]) * round(RATE * 2.4)
    cues = []
    for index, (offset, duration) in enumerate(ORIGINAL_CUES):
        clip = samples[round(offset * RATE):round((offset + duration) * RATE)]
        for i in range(len(clip)):
            envelope = min(1, i / (RATE * .001), (len(clip) - 1 - i) / (RATE * .006))
            clip[i] = round(clip[i] * envelope)
        rms = math.sqrt(sum(value * value for value in clip) / len(clip))
        gain = min(.1 * 32768 / rms, .85 * 32767 / max(map(abs, clip)))
        clip = array('h', (round(value * gain) for value in clip))
        write(ROOT / f'tap-{index + 1}.wav', clip)
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
                        '-i', str(ROOT / f'tap-{index+1}.wav'), '-af', 'apad=pad_dur=0.35',
                        '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart',
                        str(ROOT / f'tap-{index+1}.m4a')], check=True)
        start = round(index * .3 * RATE)
        sprite[start:start + len(clip)] = clip
        cues.append([round(index * .3, 1), duration])
        print(f'tap-{index+1}: peak={max(map(abs,clip))/32768:.3f}, RMS={20*math.log10(math.sqrt(sum(v*v for v in clip)/len(clip))/32768):.1f} dBFS')
    write(ROOT / 'feedback-sprite.wav', sprite)
    (ROOT / 'cues.json').write_text(json.dumps(cues) + '\n')
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
                    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '1',
                    '-c:a', 'aac', '-b:a', '32k', '-movflags', '+faststart',
                    str(ROOT / 'session-silence.m4a')], check=True)

if __name__ == '__main__':
    main()
