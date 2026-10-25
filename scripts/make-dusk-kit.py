"""Deterministic original synthesis. No recordings, downloaded samples, or dependencies.
Run: python3 scripts/make-dusk-kit.py
Writes 16 mono PCM WAV one-shots in public/samples/dusk, rooted in D minor.
"""
from pathlib import Path
import math, random, struct, wave
RATE = 32000
OUT = Path(__file__).resolve().parents[1] / 'public/samples/dusk'
OUT.mkdir(parents=True, exist_ok=True)
rng = random.Random(1701)
TAU = math.tau

def hz(midi): return 440 * 2 ** ((midi - 69) / 12)
def sine(f, t): return math.sin(TAU * f * t)
def env(t, duration, attack=.004, decay=2):
    return min(1, t / attack) * math.exp(-decay * t) * min(1, max(0, duration - t) / .04)
def write(name, values, peak=.8):
    # Remove DC, smooth boundaries, soft-limit, then normalize below full scale.
    mean = sum(values) / len(values)
    values = [math.tanh((v - mean) * 1.3) for v in values]
    for i in range(min(160, len(values) // 2)):
        values[i] *= i / 160
        values[-1-i] *= i / 160
    scale = peak / max(.00001, max(abs(v) for v in values))
    with wave.open(str(OUT / (name + '.wav')), 'wb') as f:
        f.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
        f.writeframes(struct.pack('<' + 'h' * len(values), *(round(v * scale * 32767) for v in values)))

def chord(notes, dur=2, reverse=False):
    data=[]
    for i in range(int(RATE * dur)):
        t=i/RATE
        sound=0
        for n in notes:
            f=hz(n)
            wobble=.0008 * sine(.7, t)
            sound += (sine(f * (1+wobble), t) + .18*sine(f*2.002,t)*math.exp(-2*t)
                      + .1*sine(f*.998,t) + .06*sine(f*3,t)*math.exp(-4*t)) / len(notes)
        data.append(sound * env(t,dur,.012,1.7))
    return list(reversed(data)) if reverse else data

write('dusk-chord', chord([50,57,60,64,65],2.2), .68)
write('velvet-chord', chord([46,53,57,62],1.8), .66)
write('sun-chord', chord([43,50,53,57],2), .68)
# Bell/pluck: a wooden fundamental with soft, slightly inharmonic overtones.
dur=1.25
write('glass-pluck', [sum(a*sine(hz(74)*h,i/RATE)*math.exp(-d*i/RATE)
    for h,a,d in [(1,1,4),(2.002,.25,7),(3.99,.12,11),(6.01,.04,16)])
    *env(i/RATE,dur,.002,.3) for i in range(int(dur*RATE))],.7)
# Acoustic-like, individually synthesized colors, not emulations of recordings.
dur=1.1
write('nylon-pluck', [sum(sine(hz(62)*h,i/RATE)*math.exp(-(3+h*.9)*i/RATE)/(h*h*.6)
    for h in range(1,9))*env(i/RATE,dur,.002,.2) for i in range(int(dur*RATE))],.72)
dur=1.65
def flute(t):
    notes=[62,65,69,67]; lengths=[.0,.25,.5,.83,1.65]
    step=next(j for j in range(4) if lengths[j]<=t<lengths[j+1])
    local=t-lengths[step]; f=hz(notes[step])*(1+.0018*sine(5.2,t))
    return (sine(f,t)+.12*sine(f*2,t)+rng.uniform(-.012,.012))*env(local,lengths[step+1]-lengths[step],.025,2.4)
write('air-phrase',[flute(i/RATE) for i in range(int(dur*RATE))],.58)
write('reverse-glow',chord([50,57,60,65],1.7,True),.52)
dur=1.25
noise=[rng.uniform(-1,1) for _ in range(int(dur*RATE))]
prev=0; shimmer=[]
for i,n in enumerate(noise):
    t=i/RATE; prev += .08*(n-prev)
    shimmer.append((.16*prev+sum(sine(hz(74)*r,t)*math.exp(-t*d)*a for r,a,d in [(1,.2,2),(1.5,.1,3),(2.99,.05,5)]))*env(t,dur,.08,2))
write('grain-shimmer',shimmer,.48)
for name,midi,kind,dur in [('deep-sub',38,0,.85),('rubber-bass',41,1,.65),('muted-bass',33,2,.55),('fall-bass',38,3,.8)]:
    data=[];phase=0
    for i in range(int(dur*RATE)):
        t=i/RATE; f=hz(midi)*(1 + (1.1*math.exp(-t*40) if kind==1 else 0))
        if kind==3: f*=2**(-min(1,t/.5))
        phase+=TAU*f/RATE
        v=math.sin(phase)+(.18 if kind==2 else .07)*math.sin(phase*2)*math.exp(-t*9)
        if kind==1: v+=.1*math.sin(phase*3)*math.exp(-t*6)
        data.append(v*env(t,dur,.004,3.5 if kind==2 else 2.5))
    write(name,data,.8)
dur=.5;phase=0;data=[]
for i in range(int(dur*RATE)):
    t=i/RATE;phase+=TAU*(47+105*math.exp(-t*38))/RATE
    data.append((math.sin(phase)*math.exp(-t*10)+.15*rng.uniform(-1,1)*math.exp(-t*160))*env(t,dur,.001,.1))
write('round-kick',data,.9)
dur=.32;data=[];low=0
for i in range(int(dur*RATE)):
    t=i/RATE;n=rng.uniform(-1,1);low+=.25*(n-low)
    data.append((.6*(n-low)*math.exp(-t*22)+.35*sine(185,t)*math.exp(-t*33)+.15*sine(330,t)*math.exp(-t*28))*env(t,dur,.001,.1))
write('dust-snare',data,.76)
for name,dur,decay in [('soft-hat',.16,52),('hand-shaker',.3,18)]:
    data=[];low=0
    for i in range(int(dur*RATE)):
        t=i/RATE;n=rng.uniform(-1,1);low+=.45*(n-low)
        pulse=1 if name=='soft-hat' else .35+.65*abs(sine(19,t))
        data.append((n-low)*pulse*env(t,dur,.002,decay))
    write(name,data,.48)
print('Generated 16 original one-shots:',sum(p.stat().st_size for p in OUT.glob('*.wav')),'bytes')
