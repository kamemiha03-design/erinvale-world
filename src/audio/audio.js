const SOURCES = {
  town: "https://sfxmint.com/dl/village-ambience-01.mp3",
  market: "https://sfxmint.com/dl/village-ambience-05.mp3",
  stream: "https://sfxmint.com/dl/village-ambience-08.mp3",
  steps: "https://sfxmint.com/dl/footsteps-stone-01.mp3",
  tavern: "https://sfxmint.com/dl/cafe-interior-ambience-01.mp3",
  fire: "https://sfxmint.com/dl/roaring-fireplace-sound-effect-01.mp3",
  birds: "https://sfxmint.com/dl/growth-a3585cc018b5ba7237b35d4f-part-1-v1.mp3",
  indoorSteps: "https://sfxmint.com/dl/footsteps-wood-05.mp3",
};

export function createWorldAudio() {
  const layers = Object.fromEntries(
    Object.entries(SOURCES).filter(([key]) => !["steps", "indoorSteps"].includes(key))
      .map(([key, src]) => {
        const audio = new Audio(src);
        audio.loop = true;
        audio.preload = "auto";
        audio.volume = 0;
        return [key, audio];
      })
  );
  let unlocked = false;
  let lastStep = 0;
  let lastFrame = performance.now();
  let audioContext = null;
  let windGain = null;
  let palacePadGain = null;

  function safePlay(audio) {
    const result = audio.play();
    if (result?.catch) result.catch(() => {});
  }

  function startWind() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass || audioContext) return;
      audioContext = new AudioContextClass();
      const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 3, audioContext.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * .22;
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const filter = audioContext.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 520;
      const gain = audioContext.createGain();
      gain.gain.value = 0;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(audioContext.destination);
      source.start();
      windGain = gain.gain;
      // Original soft harmonic tones distinguish the palace courtyard from the busy town.
      const padGain=audioContext.createGain();
      padGain.gain.value=0;
      const low=audioContext.createOscillator();
      const high=audioContext.createOscillator();
      const padFilter=audioContext.createBiquadFilter();
      low.type="sine";low.frequency.value=174.61;
      high.type="sine";high.frequency.value=261.63;
      padFilter.type="lowpass";padFilter.frequency.value=680;
      low.connect(padFilter);high.connect(padFilter);padFilter.connect(padGain);
      padGain.connect(audioContext.destination);
      low.start();high.start();
      palacePadGain=padGain.gain;
    } catch (error) {
      console.warn("Wind ambience unavailable", error);
    }
  }

  let musicGain = null;
  let musicStep = 0;
  let nextMusicTime = 0;
  let musicEnabled = true;
  const beat = 60 / 76;
  const chordProgression = [
    [146.83, 185.00, 220.00],
    [123.47, 146.83, 185.00],
    [98.00, 123.47, 146.83],
    [110.00, 138.59, 164.81],
  ];
  const melody = [
    587.33, null, 440.00, 493.88, 587.33, null, 659.25, 587.33,
    493.88, null, 369.99, 440.00, 493.88, null, 587.33, null,
    659.25, null, 587.33, 493.88, 440.00, null, 493.88, 587.33,
    440.00, null, 369.99, 329.63, 369.99, null, 440.00, null
  ];

  function pluck(frequency, time, duration, volume, type="sine") {
    if (!audioContext || !musicGain || !frequency) return;
    const osc=audioContext.createOscillator();
    const envelope=audioContext.createGain();
    const filter=audioContext.createBiquadFilter();
    osc.type=type;
    osc.frequency.setValueAtTime(frequency,time);
    filter.type="lowpass";
    filter.frequency.setValueAtTime(type==="triangle"?1900:2600,time);
    envelope.gain.setValueAtTime(.0001,time);
    envelope.gain.exponentialRampToValueAtTime(volume,time+.018);
    envelope.gain.exponentialRampToValueAtTime(.0001,time+duration);
    osc.connect(filter);filter.connect(envelope);envelope.connect(musicGain);
    osc.start(time);osc.stop(time+duration+.03);
  }

  function scheduleMusic() {
    if(!audioContext || !musicGain || !musicEnabled) return;
    const now=audioContext.currentTime;
    if(nextMusicTime<now-.12) {
      const skipped=Math.ceil((now-.12-nextMusicTime)/(beat/2));
      musicStep+=skipped;
      nextMusicTime+=skipped*beat/2;
    }
    while(nextMusicTime<audioContext.currentTime+.24) {
      const step=musicStep%32;
      const bar=Math.floor(step/8);
      const beatInBar=step%8;
      const chord=chordProgression[bar];
      if(beatInBar===0) chord.forEach(frequency=>{
        pluck(frequency/2,nextMusicTime,1.48,.008,"sine");
        pluck(frequency,nextMusicTime,1.18,.0045,"sine");
      });
      if(beatInBar%2===0) pluck(chord[0]/2,nextMusicTime,.62,.026,"sine");
      const note=melody[step];
      if(note) pluck(note,nextMusicTime,beat*.82,.024,"triangle");
      if(beatInBar===2||beatInBar===6) pluck(chord[beatInBar===2?1:2]*2,nextMusicTime,.5,.012,"sine");
      nextMusicTime+=beat/2;
      musicStep++;
    }
  }

  function startMusic() {
    if(!audioContext || musicGain) return;
    musicGain=audioContext.createGain();
    musicGain.gain.value=0;
    const filter=audioContext.createBiquadFilter();
    filter.type="lowpass";filter.frequency.value=3200;
    musicGain.connect(filter);filter.connect(audioContext.destination);
    musicGain.gain.setTargetAtTime(musicEnabled?.12:0,audioContext.currentTime,1.1);
    nextMusicTime=audioContext.currentTime+.12;
    scheduleMusic();
    window.setInterval(scheduleMusic,100);
  }

  function toggleMusic() {
    musicEnabled=!musicEnabled;
    if(musicEnabled) {
      if(!audioContext) startWind();
      audioContext?.resume?.();
      startMusic();
      if(musicGain&&audioContext)musicGain.gain.setTargetAtTime(.12,audioContext.currentTime,.35);
    } else if(musicGain&&audioContext) {
      musicGain.gain.setTargetAtTime(0,audioContext.currentTime,.35);
    }
    return musicEnabled;
  }

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    Object.values(layers).forEach(safePlay);
    startWind();
    audioContext?.resume?.();
    startMusic();
  }

  function setMovement(active, position, location) {
    const now = performance.now();
    const dt = Math.min(.12, Math.max(.008, (now - lastFrame) / 1000));
    lastFrame = now;
    if (!unlocked) return;

    // getLocation() returns Japanese labels; use those to activate the correct sound zones.
    const inMarket = (location || "").includes("市場");
    const inTavern = (location || "").includes("銅鹿亭");
    const inGuild = (location || "").includes("ギルド");
    const inPalace = location === "palace" || (location || "").includes("王宮");
    const indoors = inTavern || inGuild;
    const nearWater = Math.max(0, 1 - Math.hypot(position.x - 13, position.z - 5) / 25);

    const targets = {
      town: inPalace ? .045 : indoors ? .035 : inMarket ? .075 : .23,
      market: inMarket ? .36 : 0,
      stream: nearWater * (inPalace ? .035 : .25),
      tavern: inTavern ? .34 : inGuild ? .07 : 0,
      fire: inTavern ? .18 : 0,
      birds: inPalace ? .055 : indoors ? .012 : .14,
    };
    for (const [key, audio] of Object.entries(layers)) {
      audio.volume += ((targets[key] ?? 0) - audio.volume) * Math.min(1, dt * 1.8);
    }
    if (windGain && audioContext) {
      windGain.setTargetAtTime(inPalace ? .052 : indoors ? .006 : .025, audioContext.currentTime, .8);
    }
    if (palacePadGain && audioContext) {
      palacePadGain.setTargetAtTime(inPalace ? .012 : 0, audioContext.currentTime, 1.4);
    }

    if (active && now - lastStep > (indoors ? 610 : 480)) {
      lastStep = now;
      const step = new Audio(indoors ? SOURCES.indoorSteps : SOURCES.steps);
      step.volume = .3;
      step.playbackRate = .92 + Math.random() * .16;
      safePlay(step);
      step.addEventListener("ended", () => step.remove(), { once: true });
    }
  }

  function playDoor() {
    try {
      if(!audioContext) startWind();
      if(!audioContext)return;
      audioContext.resume?.();
      const now=audioContext.currentTime;
      const noiseBuffer=audioContext.createBuffer(1,audioContext.sampleRate*.42,audioContext.sampleRate);
      const data=noiseBuffer.getChannelData(0);
      for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/data.length,2);
      const noise=audioContext.createBufferSource();noise.buffer=noiseBuffer;
      const filter=audioContext.createBiquadFilter();filter.type="lowpass";filter.frequency.setValueAtTime(850,now);filter.frequency.exponentialRampToValueAtTime(180,now+.38);
      const gain=audioContext.createGain();gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.16,now+.035);gain.gain.exponentialRampToValueAtTime(.0001,now+.42);
      noise.connect(filter);filter.connect(gain);gain.connect(audioContext.destination);noise.start(now);noise.stop(now+.44);
      const creak=audioContext.createOscillator(),creakGain=audioContext.createGain();
      creak.type="sawtooth";creak.frequency.setValueAtTime(118,now);creak.frequency.linearRampToValueAtTime(74,now+.34);
      creakGain.gain.setValueAtTime(.0001,now);creakGain.gain.exponentialRampToValueAtTime(.045,now+.05);creakGain.gain.exponentialRampToValueAtTime(.0001,now+.36);
      creak.connect(creakGain);creakGain.connect(audioContext.destination);creak.start(now);creak.stop(now+.38);
    } catch(error) { console.warn("Door sound unavailable",error); }
  }

  return { unlock, setMovement, playDoor, toggleMusic };
}
