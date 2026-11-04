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
  const town = new Audio(SOURCES.town);
  const market = new Audio(SOURCES.market);
  const stream = new Audio(SOURCES.stream);
  const tavern = new Audio(SOURCES.tavern);
  const fire = new Audio(SOURCES.fire);
  const birds = new Audio(SOURCES.birds);
  for (const audio of [town, market, stream, tavern, fire, birds]) {
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0;
  }
  let unlocked = false;
  let walking = false;
  let lastStep = 0;
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
    safePlay(tavern);
    safePlay(fire);
    safePlay(birds);
  }
  function setMovement(active, position, location) {
    walking = active;
    currentLocation = location || "town";
    if (!unlocked) return;
    const now = performance.now();
    const inMarket = currentLocation === "market";
    const inTavern = currentLocation === "tavern";
    const nearWater = Math.hypot(position.x - 13, position.z - 5) < 15;
    town.volume = inMarket ? 0.11 : 0.27;
    market.volume = inMarket ? 0.34 : 0;
    stream.volume = nearWater ? 0.19 : 0;
    tavern.volume = inTavern ? 0.32 : 0;
    fire.volume = inTavern ? 0.13 : 0;
    birds.volume = inTavern ? 0.015 : 0.12;
    const inside = currentLocation === "tavern" || currentLocation === "guild";
    if (walking && now - lastStep > (inside ? 3600 : 2600)) {
      lastStep = now;
      const step = new Audio(inside ? SOURCES.indoorSteps : SOURCES.steps);
      step.volume = 0.32;
      step.playbackRate = 0.94 + Math.random() * 0.13;
      safePlay(step);
      step.addEventListener("ended", () => step.remove(), { once: true });
    }
  }
  return { unlock, setMovement };
}
