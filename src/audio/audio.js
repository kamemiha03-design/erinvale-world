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

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    Object.values(layers).forEach(safePlay);
    startWind();
    audioContext?.resume?.();
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

  return { unlock, setMovement };
}
