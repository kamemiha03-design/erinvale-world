import "@babylonjs/loaders";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { createRoyalCity } from "./world/royalCity.js";
import { attachMobileControls } from "./player/controls.js";
import { createWorldAudio } from "./audio/audio.js";
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
  const world=await createRoyalCity(engine,canvas);
  const audio=createWorldAudio();
  world.onMovement=(moving,position,location)=>{
    const tavern=position.x>-27.8&&position.x<-14.2&&position.z>1.4&&position.z<10.6;
    const guild=position.x>-27.8&&position.x<-14.2&&position.z>-20.4&&position.z<-11.6;
    const palace=position.z<-72;
    audio.setMovement(moving,position,palace?"palace":tavern?"tavern":guild?"guild":location.includes("市場")?"market":"town");
  };
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
  loading.innerHTML='<div class="loading-mark">✧</div><h1>ERINVALE</h1><p class="loading-copy">読み込みに失敗しました。</p>';
  const detail=document.createElement("p");
  detail.className="loading-copy";
  detail.style.cssText="max-width:90%;margin:12px auto;font-size:12px;line-height:1.6;overflow-wrap:anywhere;color:#f2c9a0";
  detail.textContent="診断情報: "+String(error?.name||"Error")+" — "+String(error?.message||error||"原因不明");
  loading.appendChild(detail);
});