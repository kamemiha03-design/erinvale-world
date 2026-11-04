import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

export function attachMobileControls(world, audio) {
  const pad=document.querySelector("#move-pad");
  const knob=document.querySelector("#move-knob");
  const canvas=document.querySelector("#renderCanvas");
  const interact=document.querySelector("#interact");
  const hint=document.querySelector("#hint");
  const state={x:0,y:0,pointer:null,lookPointer:null,lastX:0,lastY:0,keys:new Set(),autoWalk:false,lastTap:0,tapX:0,tapY:0};
  const release=()=>{state.x=0;state.y=0;state.pointer=null;knob.style.transform="translate(0, 0)";};
  function moveStick(event) {
    const rect=pad.getBoundingClientRect();
    const dx=event.clientX-(rect.left+rect.width/2),dy=event.clientY-(rect.top+rect.height/2);
    const radius=rect.width*.32,length=Math.hypot(dx,dy)||1,scale=Math.min(1,radius/length);
    const x=dx*scale,y=dy*scale;
    state.x=x/radius;state.y=-y/radius;
    knob.style.transform=`translate(${x}px, ${y}px)`;
  }
  pad.addEventListener("pointerdown",event=>{event.preventDefault();state.pointer=event.pointerId;pad.setPointerCapture(event.pointerId);moveStick(event);audio.unlock();});
  pad.addEventListener("pointermove",event=>{if(event.pointerId===state.pointer)moveStick(event);});
  pad.addEventListener("pointerup",release);pad.addEventListener("pointercancel",release);

  canvas.addEventListener("pointerdown",event=>{
    audio.unlock();
    if(event.pointerType==="touch"){
      state.lookPointer=event.pointerId;state.lastX=event.clientX;state.lastY=event.clientY;
      state.tapX=event.clientX;state.tapY=event.clientY;
      canvas.setPointerCapture(event.pointerId);
    } else if(event.pointerType==="mouse") canvas.requestPointerLock?.();
  });
  canvas.addEventListener("pointermove",event=>{
    if(event.pointerId===state.lookPointer){
      const dx=event.clientX-state.lastX,dy=event.clientY-state.lastY;
      state.lastX=event.clientX;state.lastY=event.clientY;
      if(Math.abs(dx)+Math.abs(dy)>2)world.turn(dx*.0032,dy*.0024);
    }
  });
  canvas.addEventListener("pointerup",event=>{
    if(event.pointerId!==state.lookPointer)return;
    const moved=Math.hypot(event.clientX-state.tapX,event.clientY-state.tapY);
    state.lookPointer=null;
    if(moved<22){
      const now=performance.now();
      if(now-state.lastTap<340){
        state.autoWalk=!state.autoWalk;
        hint.textContent=state.autoWalk?"自動歩行中 — もう一度ダブルタップで停止":"画面をダブルタップして前進";
        state.lastTap=0;
      } else state.lastTap=now;
    }
  });
  canvas.addEventListener("pointercancel",()=>{state.lookPointer=null;});
  document.addEventListener("mousemove",event=>{if(document.pointerLockElement===canvas)world.turn(event.movementX*.002,event.movementY*.0017);});
  window.addEventListener("keydown",event=>{
    const key=event.key.toLowerCase();
    if(["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright"].includes(key))event.preventDefault();
    state.keys.add(key);if(key==="e"&&!event.repeat)world.interact();
    audio.unlock();
  });
  window.addEventListener("keyup",event=>state.keys.delete(event.key.toLowerCase()));
  window.addEventListener("blur",()=>{state.keys.clear();release();state.autoWalk=false;});
  interact.addEventListener("click",()=>{audio.unlock();world.interact();});

  world.setMovementSource(()=>{
    let x=state.x,y=state.y;
    if(state.keys.has("a")||state.keys.has("arrowleft"))x-=1;
    if(state.keys.has("d")||state.keys.has("arrowright"))x+=1;
    if(state.keys.has("w")||state.keys.has("arrowup"))y+=1;
    if(state.keys.has("s")||state.keys.has("arrowdown"))y-=1;
    if(state.autoWalk)y=Math.max(y,1);
    const len=Math.hypot(x,y);if(len>1){x/=len;y/=len;}
    return new Vector3(x,0,y);
  });
}
