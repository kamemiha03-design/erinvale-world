import "@babylonjs/loaders";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { createRoyalCity } from "./world/royalCity.js";
import { attachMobileControls } from "./player/controls.js";\nimport { createWorldAudio } from "./audio/audio.js";
import "./style.css";

const canvas=document.querySelector("#renderCanvas");
const loading=document.querySelector("#loading");
const hud=document.querySelector("#hud");
const mobileControls=document.querySelector("#mobile-controls");
const desktopHint=document.querySelector("#desktop-hint");

async function boot() {
  const engine=new Engine(canvas,true,{
    preserveDrawingBuffer:false,
    stencil:true,
    antialias:true,
    powerPreference:"high-performance",
    adaptToDeviceRatio:true,
  });
  engine.setHardwareScalingLevel(Math.min(1.5,Math.max(1,window.devicePixelRatio||1)));
  const world=await createRoyalCity(engine,canvas);\n  const audio=createWorldAudio();\n  world.onMovement=(moving,position,location)=>audio.setMovement(moving,position,location.includes("市場")?"market":"town");
  const isTouch=matchMedia("(pointer: coarse)").matches||navigator.maxTouchPoints>0;
  attachMobileControls(world,audio);
  if(isTouch)mobileControls.classList.remove("hidden");
  else desktopHint.classList.remove("hidden");

  engine.runRenderLoop(()=>{
    world.update(engine.getDeltaTime()/1000);
    world.scene.render();
  });
  window.addEventListener("resize",()=>engine.resize(),{passive:true});
  loading.classList.add("fade-out");
  hud.classList.remove("hidden");
  setTimeout(()=>loading.remove(),900);
}
boot().catch(error=>{
  console.error("Erinvale failed to start:",error);
  loading.innerHTML='<div class="loading-mark">✧</div><h1>ERINVALE</h1><p class="loading-copy">読み込みに失敗しました。ページを再読み込みしてください。</p>';
});