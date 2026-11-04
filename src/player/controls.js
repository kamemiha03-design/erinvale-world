import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

export function attachMobileControls(world) {
  const pad = document.querySelector("#move-pad");
  const knob = document.querySelector("#move-knob");
  const canvas = document.querySelector("#renderCanvas");
  const interact = document.querySelector("#interact");
  const state = { x: 0, y: 0, pointer: null, lookPointer: null, lastX: 0, lastY: 0 };

  const release = () => {
    state.x = 0;
    state.y = 0;
    state.pointer = null;
    knob.style.transform = "translate(0, 0)";
  };

  pad.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    state.pointer = event.pointerId;
    pad.setPointerCapture(event.pointerId);
    moveStick(event);
  });
  pad.addEventListener("pointermove", (event) => {
    if (event.pointerId === state.pointer) moveStick(event);
  });
  pad.addEventListener("pointerup", release);
  pad.addEventListener("pointercancel", release);

  function moveStick(event) {
    const rect = pad.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const radius = rect.width * 0.32;
    const length = Math.hypot(dx, dy) || 1;
    const scale = Math.min(1, radius / length);
    const x = dx * scale;
    const y = dy * scale;
    state.x = x / radius;
    state.y = y / radius;
    knob.style.transform = `translate(${x}px, ${y}px)`;
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch") return;
    state.lookPointer = event.pointerId;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
  });
  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerId !== state.lookPointer) return;
    const dx = event.clientX - state.lastX;
    const dy = event.clientY - state.lastY;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    world.turn(dx * 0.0032, dy * 0.0024);
  });
  const stopLook = (event) => {
    if (event.pointerId === state.lookPointer) state.lookPointer = null;
  };
  canvas.addEventListener("pointerup", stopLook);
  canvas.addEventListener("pointercancel", stopLook);

  interact.addEventListener("click", () => world.interact());

  world.setMovementSource(() => new Vector3(state.x, 0, -state.y));
}