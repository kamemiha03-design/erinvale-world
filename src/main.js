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
  const isTouch=matchMedia("(pointer: coarse)").matches||navigator.maxTouchPoints>0;
  const engine=new Engine(canvas,true,{
    preserveDrawingBuffer:false,
    stencil:false,
    antialias:!isTouch,
    powerPreference:isTouch?"low-power":"high-performance",
    adaptToDeviceRatio:!isTouch,
  });
  // Mobile keeps a sharper 50% internal resolution per axis; scene culling reduces CPU/GPU work.
  // Antialiasing and desktop post-processing are disabled separately for touch devices.
  engine.setHardwareScalingLevel(isTouch?2.0:1);
  const world=await createRoyalCity(engine,canvas);
  const audio=createWorldAudio();
  // Door movement uses the same unlocked Web Audio context as the ambience.
  world.onDoor=(opening)=>audio.playDoor(opening);
  const mapToggle=document.querySelector("#map-toggle"),mapPanel=document.querySelector("#world-map"),mapClose=document.querySelector("#map-close");
  const setMapOpen=open=>{mapPanel.classList.toggle("hidden",!open);mapToggle.setAttribute("aria-expanded",String(open));mapToggle.innerHTML=open?'閉じる <span>×</span>':'地図 <span>⌖</span>';};
  mapToggle.addEventListener("click",()=>setMapOpen(mapPanel.classList.contains("hidden")));
  mapClose.addEventListener("click",()=>setMapOpen(false));
  window.addEventListener("keydown",event=>{if(event.key==="Escape")setMapOpen(false);});

  world.onMovement=(moving,position,location)=>{
    const mapDot=document.querySelector("#map-player");
    if(mapDot){mapDot.setAttribute("cx",Math.max(4,Math.min(356,(position.x+112)/224*360)).toFixed(1));mapDot.setAttribute("cy",Math.max(4,Math.min(466,(80-position.z)/270*470)).toFixed(1));}


    const tavern=position.x>-27.8&&position.x<-14.2&&position.z>1.4&&position.z<10.6;
    const guild=position.x>-27.8&&position.x<-14.2&&position.z>-20.4&&position.z<-11.6;
    const palace=position.z<-72;
    audio.setMovement(moving,position,palace?"palace":tavern?"tavern":guild?"guild":location.includes("市場")?"market":"town");
  };
  attachMobileControls(world,audio);
  if(isTouch)mobileControls.classList.remove("hidden");
  else desktopHint.classList.remove("hidden");

  // Keep full scene detail, but cap mobile rendering at 24 FPS and use a lower internal resolution. Static geometry,
  // textures and shadow-map quality remain unchanged; optional model downloads
  // are deferred by the world builder.
  let lastMobileFrame=0;
  engine.runRenderLoop(()=>{
    const now=performance.now();
    if(isTouch && now-lastMobileFrame<1000/24)return;
    const elapsed=lastMobileFrame?Math.min((now-lastMobileFrame)/1000,.1):engine.getDeltaTime()/1000;
    lastMobileFrame=now;
    world.update(elapsed);
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