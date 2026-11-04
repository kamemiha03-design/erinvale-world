const SOURCES = {
  town: "https://sfxmint.com/dl/village-ambience-01.mp3",
  market: "https://sfxmint.com/dl/village-ambience-05.mp3",
  stream: "https://sfxmint.com/dl/village-ambience-08.mp3",
  steps: "https://sfxmint.com/dl/footsteps-concrete-03.mp3",
};

export function createWorldAudio() {
  const town = new Audio(SOURCES.town);
  const market = new Audio(SOURCES.market);
  const stream = new Audio(SOURCES.stream);
  for (const audio of [town, market, stream]) {
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0;
  }
  let unlocked = false;
  let walking = false;
  let lastStep = 0;
  let lastPosition = { x: 0, z: 0 };
  let currentLocation = "town";

  function safePlay(audio) {
    const result = audio.play();
    if (result?.catch) result.catch(() => {});
  }
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    safePlay(town);
    safePlay(market);
    safePlay(stream);
  }
  function setMovement(active, position, location) {
    walking = active;
    currentLocation = location || "town";
    if (!unlocked) return;
    const now = performance.now();
    const inMarket = currentLocation === "market";
    const nearWater = Math.hypot(position.x - 13, position.z - 5) < 15;
    town.volume = inMarket ? 0.11 : 0.27;
    market.volume = inMarket ? 0.34 : 0;
    stream.volume = nearWater ? 0.19 : 0;
    if (walking && now - lastStep > 510) {
      lastStep = now;
      const step = new Audio(SOURCES.steps);
      step.volume = 0.32;
      step.playbackRate = 0.94 + Math.random() * 0.13;
      safePlay(step);
      step.addEventListener("ended", () => step.remove(), { once: true });
    }
    lastPosition = { x: position.x, z: position.z };
  }
  return { unlock, setMovement };
}
