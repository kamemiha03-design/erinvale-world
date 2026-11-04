import {
  UniversalCamera,
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  MeshBuilder,
  PBRMaterial,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  Texture,
  Vector3,
} from "@babylonjs/core";

const palette = {
  limestone: new Color3(0.63, 0.59, 0.49),
  warmStone: new Color3(0.43, 0.37, 0.29),
  roof: new Color3(0.20, 0.16, 0.14),
  timber: new Color3(0.25, 0.15, 0.09),
  gold: new Color3(0.72, 0.52, 0.20),
  banner: new Color3(0.08, 0.18, 0.27),
  water: new Color3(0.12, 0.39, 0.48),
};

function pbr(scene, name, color, roughness = 0.86, metallic = 0) {
  const material = new PBRMaterial(name, scene);
  material.albedoColor = color;
  material.roughness = roughness;
  material.metallic = metallic;
  return material;
}

function makeFacade(scene, name, x, z, width, height, depth, wallMat, roofMat) {
  const root = MeshBuilder.CreateBox(name, { width, height, depth }, scene);
  root.position.set(x, height / 2, z);
  root.material = wallMat;

  const roof = MeshBuilder.CreateBox(name + "-roof", {
    width: width + 0.7, height: 0.38, depth: depth + 0.7,
  }, scene);
  roof.position.set(x, height + 0.18, z);
  roof.rotation.z = -0.06;
  roof.material = roofMat;

  const door = MeshBuilder.CreateBox(name + "-door", {
    width: 1.25, height: 2.45, depth: 0.12,
  }, scene);
  door.position.set(x, 1.22, z - depth / 2 - 0.07);
  door.material = pbr(scene, name + "-door-wood", new Color3(0.16, 0.09, 0.055));

  for (const side of [-1, 1]) {
    const window = MeshBuilder.CreateBox(name + "-window-" + side, {
      width: 0.82, height: 1.15, depth: 0.09,
    }, scene);
    window.position.set(x + side * width * 0.29, height * 0.62, z - depth / 2 - 0.08);
    window.material = pbr(scene, name + "-glass-" + side, new Color3(0.15, 0.25, 0.29), 0.22, 0.25);
    const sill = MeshBuilder.CreateBox(name + "-sill-" + side, {
      width: 1.05, height: 0.12, depth: 0.24,
    }, scene);
    sill.position.set(window.position.x, window.position.y - 0.63, window.position.z - 0.03);
    sill.material = wallMat;
  }
  return root;
}

function addPaving(scene, stoneMat) {
  const ground = MeshBuilder.CreateGround("plaza-ground", { width: 94, height: 94, subdivisions: 2 }, scene);
  ground.position.y = -0.12;
  ground.material = stoneMat;

  // Individual irregular paving slabs create readable scale and a sense of craft.
  const slabMat = pbr(scene, "paving-variation", new Color3(0.48, 0.45, 0.39));
  for (let z = -32; z <= 32; z += 4) {
    for (let x = -32; x <= 32; x += 4) {
      const slab = MeshBuilder.CreateBox("hand-cut-paving", {
        width: 3.88, depth: 3.88, height: 0.10,
      }, scene);
      slab.position.set(x, -0.045, z);
      slab.material = ((x + z) % 8 === 0) ? slabMat : stoneMat;
    }
  }
}

export async function createRoyalCity(engine, canvas) {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.58, 0.73, 0.82, 1);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.0038;
  scene.fogColor = new Color3(0.68, 0.78, 0.83);
  scene.environmentIntensity = 0.8;

  const camera = new UniversalCamera("explorer-camera", new Vector3(0, 2.1, 11), scene);
  camera.minZ = 0.08;
  camera.fov = 0.92;
  camera.inputs.clear();

  const skyLight = new HemisphericLight("sky-fill", new Vector3(0, 1, 0), scene);
  skyLight.intensity = 0.78;
  skyLight.groundColor = new Color3(0.28, 0.25, 0.21);
  const sun = new DirectionalLight("late-morning-sun", new Vector3(-0.45, -1, 0.35), scene);
  sun.position = new Vector3(35, 55, -30);
  sun.intensity = 2.1;
  const shadows = new ShadowGenerator(1024, sun);
  shadows.useBlurExponentialShadowMap = true;
  shadows.blurKernel = 24;

  const stone = pbr(scene, "weathered-limestone", palette.limestone);
  const timber = pbr(scene, "aged-oak", palette.timber);
  const roof = pbr(scene, "dark-slate-roof", palette.roof);
  const paving = pbr(scene, "plaza-stone", new Color3(0.52, 0.49, 0.43));
  addPaving(scene, paving);

  // The plaza is arranged around a broad central sightline toward the castle.
  makeFacade(scene, "wayfarers-tavern", -18, 5, 13, 8.5, 7, stone, roof);
  makeFacade(scene, "adventurers-guild", -18, -13, 12, 9, 7, stone, roof);
  makeFacade(scene, "market-hall", 18, -17, 14, 8, 8, stone, roof);
  makeFacade(scene, "royal-gatehouse", 0, -39, 19, 13, 8, stone, roof);

  const fountainBase = MeshBuilder.CreateCylinder("fountain-basin", { diameter: 10, height: 0.9, tessellation: 64 }, scene);
  fountainBase.position.set(13, 0.45, 5);
  fountainBase.material = stone;
  const water = MeshBuilder.CreateCylinder("fountain-water", { diameter: 8.7, height: 0.12, tessellation: 64 }, scene);
  water.position.set(13, 0.94, 5);
  const waterMat = new StandardMaterial("fountain-water-material", scene);
  waterMat.diffuseColor = palette.water;
  waterMat.specularColor = new Color3(0.85, 0.95, 1);
  waterMat.alpha = 0.76;
  water.material = waterMat;

  const statuePedestal = MeshBuilder.CreateBox("emperor-statue-pedestal", { width: 2.4, height: 2.8, depth: 2.4 }, scene);
  statuePedestal.position.set(13, 2.3, 5);
  statuePedestal.material = pbr(scene, "pedestal-marble", new Color3(0.69, 0.64, 0.53));
  const statue = MeshBuilder.CreateSphere("statue-silhouette", { diameter: 1.8, segments: 16 }, scene);
  statue.position.set(13, 4.65, 5);
  statue.material = pbr(scene, "statue-bronze", palette.gold, 0.48, 0.72);

  // Distant skyline layers frame the gate; asset-based architecture replaces these blockout masses in the art pass.
  for (let i = 0; i < 7; i++) {
    const tower = MeshBuilder.CreateCylinder("distant-tower-" + i, {
      diameter: 3.5 + (i % 3), height: 12 + (i % 4) * 2, tessellation: 12,
    }, scene);
    tower.position.set(-29 + i * 9.5, 6 + (i % 4), -52 - (i % 2) * 5);
    tower.material = stone;
  }

  camera.position = new Vector3(0, 2.1, 11);
  camera.setTarget(new Vector3(0, 2.1, -8));
  let moveSource = () => Vector3.Zero();
  let yaw = 0;
  let pitch = 0;
  let interactHint = "広場を自由に歩いてみよう";
  const forward = new Vector3();
  const right = new Vector3();

  return {
    scene,
    setMovementSource(source) { moveSource = source; },
    turn(dx, dy) {
      yaw += dx;
      pitch = Math.max(-1.05, Math.min(1.05, pitch + dy));
      camera.rotation.y = yaw + Math.PI;
      camera.rotation.x = pitch;
    },
    interact() {
      document.querySelector("#hint").textContent = interactHint;
    },
    update(dt) {
      const input = moveSource();
      if (input.lengthSquared() < 0.0001) return;
      const speed = 7.2 * Math.min(dt, 0.05);
      forward.set(Math.sin(yaw), 0, -Math.cos(yaw));
      right.set(Math.cos(yaw), 0, Math.sin(yaw));
      const delta = forward.scale(input.y).add(right.scale(input.x)).scale(speed);
      camera.position.addInPlace(delta);
      camera.position.y = 2.1;
      camera.setTarget(camera.position.add(new Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)).scale(12)));
    },
  };
}