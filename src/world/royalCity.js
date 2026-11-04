import {
  UniversalCamera, Color3, Color4, DirectionalLight, HemisphericLight,
  MeshBuilder, PBRMaterial, Scene, ShadowGenerator, StandardMaterial, TransformNode,
  DynamicTexture, Texture, Vector3, Animation, Scalar, ImageProcessingConfiguration,
} from "@babylonjs/core";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader.js";

const ASSET_ROOT = "https://raw.githubusercontent.com/J-Ponzo/gltf-medieval-village-megakit/main/glTF/";

async function addCC0Model(scene, file, position, scale, rotationY = 0) {
  try {
    const imported = await SceneLoader.ImportMeshAsync("", ASSET_ROOT, file + ".gltf", scene);
    const root = imported.meshes.find(mesh => mesh.name === "__root__") || imported.meshes[0];
    if (!root) return null;
    root.position.set(position[0], position[1], position[2]);
    root.scaling.set(scale[0], scale[1], scale[2]);
    root.rotation.y = rotationY;
    // Props whose origins are centered are lowered until their lowest vertex rests on the plaza.
    if (file === "Prop_Crate" || file === "Prop_Wagon") {
      root.computeWorldMatrix(true);
      const bounds = root.getHierarchyBoundingVectors(true);
      if (Number.isFinite(bounds.min.y)) root.position.y -= bounds.min.y;
      root.computeWorldMatrix(true);
    }
    return root;
  } catch (error) {
    console.warn("Optional CC0 model could not be loaded:", file, error);
    return null;
  }
}

const C = {
  stone: new Color3(0.66, 0.61, 0.51),
  paleStone: new Color3(0.78, 0.72, 0.60),
  darkStone: new Color3(0.35, 0.32, 0.28),
  roof: new Color3(0.19, 0.16, 0.15),
  wood: new Color3(0.27, 0.16, 0.095),
  woodLight: new Color3(0.43, 0.28, 0.16),
  gold: new Color3(0.78, 0.59, 0.27),
  blue: new Color3(0.075, 0.19, 0.28),
  green: new Color3(0.16, 0.30, 0.19),
  water: new Color3(0.12, 0.39, 0.48),
};

function mat(scene, name, color, roughness = 0.82, metallic = 0) {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = color;
  m.roughness = roughness;
  m.metallic = metallic;
  return m;
}

function noiseTexture(scene, name, base, accent, size = 256) {
  const tex = new DynamicTexture(name, { width: size, height: size }, scene, false);
  const ctx = tex.getContext();
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  let seed = 73;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let i = 0; i < 2400; i++) {
    const a = 0.025 + rand() * 0.12;
    ctx.globalAlpha = a;
    ctx.fillStyle = accent;
    const s = 1 + rand() * 5;
    ctx.fillRect(rand() * size, rand() * size, s, s);
  }
  ctx.globalAlpha = 1;
  tex.update(false);
  return tex;
}

function texturedMat(scene, name, color, base, fleck, roughness = 0.9) {
  const m = mat(scene, name, color, roughness);
  m.albedoTexture = noiseTexture(scene, name + "-grain", base, fleck);
  m.albedoTexture.uScale = 3;
  m.albedoTexture.vScale = 3;
  return m;
}

function box(scene, name, pos, size, material, opts = {}) {
  const mesh = MeshBuilder.CreateBox(name, { width:size[0], height:size[1], depth:size[2] }, scene);
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.material = material;
  if (opts.rotation) mesh.rotation.y = opts.rotation;
  if (opts.castShadow) mesh.receiveShadows = true;
  return mesh;
}

function cylinder(scene, name, pos, diameter, height, material, tessellation = 24) {
  const mesh = MeshBuilder.CreateCylinder(name, { diameter, height, tessellation }, scene);
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.material = material;
  return mesh;
}

function addWindow(scene, x, y, z, wood, glass, side = 0) {
  box(scene, "window-recess", [x,y,z], [1.25,1.65,0.16], wood);
  box(scene, "window-glass", [x,y,z-0.095], [0.86,1.23,0.05], glass);
  box(scene, "window-mullion-v", [x,y,z-0.14], [0.075,1.25,0.08], wood);
  box(scene, "window-mullion-h", [x,y,z-0.14], [0.9,0.075,0.08], wood);
  box(scene, "window-sill", [x,y-0.88,z-0.17], [1.45,0.13,0.32], wood);
  box(scene, "window-lintel", [x,y+0.88,z-0.13], [1.45,0.15,0.25], wood);
}

function addLantern(scene, x, y, z, metal, glow) {
  box(scene, "lantern-bracket", [x,y+0.58,z], [0.12,0.12,0.72], metal);
  const lamp = MeshBuilder.CreateBox("lantern-frame", { width:0.42,height:0.62,depth:0.42 }, scene);
  lamp.position.set(x,y,z-0.36);
  lamp.material = metal;
  const core = MeshBuilder.CreateBox("lantern-light", { width:0.27,height:0.45,depth:0.27 }, scene);
  core.position.copyFrom(lamp.position);
  core.material = glow;
}

function addBarrel(scene, x, z, wood, hoop) {
  const b = cylinder(scene, "oak-barrel", [x,0.65,z], 0.9, 1.3, wood, 16);
  b.scaling.x = 0.82;
  cylinder(scene, "barrel-hoop-top", [x,1.03,z], 0.79, 0.08, hoop, 24);
  cylinder(scene, "barrel-hoop-bottom", [x,0.28,z], 0.79, 0.08, hoop, 24);
  cylinder(scene, "barrel-lid", [x,1.32,z], 0.7, 0.06, wood, 20);
}

function addPlanter(scene, x, z, stone, greens, flowers) {
  box(scene, "stone-planter", [x,0.38,z], [1.8,0.72,1.35], stone);
  box(scene, "planter-soil", [x,0.76,z], [1.52,0.08,1.08], mat(scene,"rich-soil",new Color3(.16,.12,.08)));
  for (let i=0;i<8;i++) {
    const px=x+(Math.random()-.5)*1.25, pz=z+(Math.random()-.5)*.82;
    const h=0.55+Math.random()*.55;
    const leaf=MeshBuilder.CreateSphere("flowering-shrub",{diameter:0.5,segments:8},scene);
    leaf.position.set(px,0.95+h*.45,pz);
    leaf.scaling.set(.7,h,.7);
    leaf.material = i%3===0 ? flowers : greens;
  }
}

function addTree(scene, x, z, scale, trunk, leaves) {
  cylinder(scene,"old-tree-trunk",[x,2.2*scale,z],0.85*scale,4.4*scale,trunk,12);
  for (let i=0;i<7;i++) {
    const crown=MeshBuilder.CreateSphere("leaf-crown",{diameter:3.5*scale,segments:12},scene);
    crown.position.set(x+(Math.random()-.5)*2*scale,4.2*scale+Math.random()*1.6*scale,z+(Math.random()-.5)*2*scale);
    crown.scaling.y=.8+Math.random()*.45;
    crown.material=leaves;
  }
}

function addBanner(scene, x, y, z, wood, cloth, phase=0) {
  cylinder(scene,"banner-pole",[x,y/2,z],0.13,y,wood,12);
  const flag=MeshBuilder.CreatePlane("royal-banner",{width:1.55,height:2.25,sideOrientation:2},scene);
  flag.position.set(x+0.82,y-1.25,z);
  flag.material=cloth;
  flag.rotation.y=Math.PI/2;
  flag.metadata={windPhase:phase};
  return flag;
}

function addBuilding(scene, cfg, mats, shadows, colliders, obstacles) {
  const {x,z,w,d,h,name,sign,interior=false} = cfg;
  const front=z+d/2;
  // Split the front wall around the entrance so the doorway is physically walkable.
  const sideWidth=(w-2.25)/2;
  box(scene,name+"-facade-left",[x-(w+2.25)/4,h/2,front],[sideWidth,h,.38],mats.wall).receiveShadows=true;
  box(scene,name+"-facade-right",[x+(w+2.25)/4,h/2,front],[sideWidth,h,.38],mats.wall).receiveShadows=true;
  box(scene,name+"-facade-over-door",[x,h-0.52,front],[2.25,1.04,.38],mats.wall).receiveShadows=true;
  box(scene,name+"-side-wall-left",[x-w/2+.16,h/2,z],[.32,h,d],mats.wall).receiveShadows=true;
  box(scene,name+"-side-wall-right",[x+w/2-.16,h/2,z],[.32,h,d],mats.wall).receiveShadows=true;
  if(!cfg.passThrough) box(scene,name+"-rear-wall",[x,h/2,z-d/2+.16],[w,h,.32],mats.wall).receiveShadows=true;
  // Timber framing and stone quoins make the facade read as a crafted medieval building.
  for (const side of [-1,1]) {
    box(scene,name+"-corner-post",[x+side*(w/2-.35),h/2,front-.13],[.32,h+.12,.28],mats.wood);
    box(scene,name+"-crossbeam",[x,h*.72,front-.15],[w+.18,.24,.3],mats.wood);
    box(scene,name+"-sill-beam",[x,2.75,front-.16],[w+.12,.2,.3],mats.wood);
  }
  box(scene,name+"-base-course",[x,.42,front-.12],[w+.3,.65,.35],mats.trim);
  // Gabled roof with overlapping slate-like roof planes and ridge cap.
  const roofL=box(scene,name+"-roof-left",[x-w*.24,h+.72,z],[w*.58,0.42,d+1.0],mats.roof,{rotation:-.42});
  roofL.rotation.z=.42;
  const roofR=box(scene,name+"-roof-right",[x+w*.24,h+.72,z],[w*.58,0.42,d+1.0],mats.roof,{rotation:.42});
  roofR.rotation.z=-.42;
  box(scene,name+"-ridge",[x,h+1.42,z],[.35,.35,d+1.1],mats.trim);
  // Repeated roof seams catch the sun.
  for(let i=-3;i<=3;i++) {
    const seam=box(scene,name+"-roof-seam",[x+i*w*.105,h+.91,z-d*.42],[.055,.055,d*.45],mats.trim);
    seam.rotation.z=.42;
  }
  // Main arched entrance: stone piers, lintel, deep shadow and timber door.
  box(scene,name+"-door-shadow",[x,1.35,front-.20],[1.75,2.7,.12],mats.dark);
  box(scene,name+"-door-left",[x-.93,1.35,front-.28],[.16,2.9,.45],mats.trim);
  box(scene,name+"-door-right",[x+.93,1.35,front-.28],[.16,2.9,.45],mats.trim);
  box(scene,name+"-door-lintel",[x,2.82,front-.28],[2.05,.22,.45],mats.trim);
  // The entrance is intentionally open so the player can walk inside.
  const windowY=h*.67;
  addWindow(scene,x-w*.27,windowY,front-.16,mats.wood,mats.glass);
  addWindow(scene,x+w*.27,windowY,front-.16,mats.wood,mats.glass);
  // Hanging sign with a legible, illuminated title.
  box(scene,name+"-sign-arm",[x+w*.28,h*.9,front-.85],[2.1,.14,.14],mats.wood);
  box(scene,name+"-sign-board",[x+w*.28,h*.9-.65,front-.88],[2.15,1.15,.16],mats.wood);
  const signTex=new DynamicTexture(name+"-sign-text",{width:512,height:256},scene,false);
  const ctx=signTex.getContext();
  ctx.fillStyle="#332318";ctx.fillRect(0,0,512,256);
  ctx.strokeStyle="#c9a45e";ctx.lineWidth=12;ctx.strokeRect(10,10,492,236);
  ctx.fillStyle="#f1dfb8";ctx.font="bold 48px Georgia";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(sign||name,256,130);
  signTex.update();
  const signMat=new StandardMaterial(name+"-sign-material",scene);signMat.diffuseTexture=signTex;signMat.emissiveColor=new Color3(.18,.12,.06);
  const signFace=MeshBuilder.CreatePlane(name+"-sign-face",{width:2.0,height:1.0},scene);
  signFace.position.set(x+w*.28,h*.9-.65,front-.98);signFace.rotation.y=0;signFace.material=signMat;
  addLantern(scene,x-w*.34,3.9,front-.7,mats.gold,mats.lantern);
  addLantern(scene,x+w*.34,3.9,front-.7,mats.gold,mats.lantern);
  // Small upper-storey dormers and chimney silhouettes.
  cylinder(scene,name+"-chimney",[x-w*.32,h+1.75,z+d*.25],.62,2.1,mats.trim,8);
  for(let i=0;i<5;i++) box(scene,name+"-chimney-course",[x-w*.32,h+1.05+i*.35,z+d*.25],[.75,.08,.75],mats.dark);
  // Interior is deliberately furnished and open through the front doorway.
  if(interior) {
    box(scene,name+"-inside-floor",[x,.08,z],[w-.5,.12,d-.5],mats.floor);
    // Interior architecture: visible ceiling structure, carved beams, wall lamps and real furniture silhouettes.
    box(scene,name+"-interior-plinth",[x,.18,z],[w-.65,.22,d-.65],mats.trim);
    for(const side of [-1,1]) {
      for(let zz=z-d*.34;zz<=z+d*.34;zz+=d*.34) {
        box(scene,name+"-interior-pier",[x+side*(w/2-.65),h*.43,zz],[.42,h*.86,.48],mats.woodLight);
        box(scene,name+"-interior-pier-cap",[x+side*(w/2-.65),h*.83,zz],[.72,.22,.72],mats.gold);
      }
      box(scene,name+"-interior-wall-wainscot",[x+side*(w/2-.38),2.0,z],[.18,2.7,d-.7],mats.wood);
    }
    for(let zz=z-d*.34;zz<=z+d*.34;zz+=d*.34) {
      const beam=box(scene,name+"-exposed-ceiling-beam",[x,h-.18,zz],[w-.4,.32,.42],mats.wood);
      beam.receiveShadows=true;
    }
    for(let i=0;i<4;i++) {
      const tx=x-4.5+i*3;
      box(scene,name+"-interior-table",[tx,.98,z+1.25],[1.85,.20,1.35],mats.woodLight);
      for(const dx of [-.72,.72]) for(const dz of [-.48,.48])
        box(scene,name+"-table-leg",[tx+dx,.50,z+1.25+dz],[.14,.86,.14],mats.wood);
      for(const side of [-1,1]) {
        box(scene,name+"-dining-stool-seat",[tx+side*1.25,.66,z+1.25],[.72,.16,.72],mats.wood);
        cylinder(scene,name+"-stool-foot",[tx+side*1.25,.34,z+1.25],.12,.62,mats.wood,8);
      }
      cylinder(scene,name+"-table-tankard",[tx,.12+1.12,z+1.25],.22,.38,mats.gold,12);
    }
    box(scene,name+"-counter",[x+3,1.25,z+1.6],[3.5,1.5,.95],mats.woodLight);
    box(scene,name+"-counter-front-inlay",[x+3,1.25,z+1.105],[2.9,.78,.06],mats.gold);
    obstacles.push({x:x+3,z:z+1.6,r:1.7});
    for(let i=0;i<5;i++) {
      box(scene,name+"-backbar-shelf",[x+1.6+i*.62,3.1,z+d*.18],[.52,.13,.72],mats.woodLight);
      cylinder(scene,name+"-bottle",[x+1.6+i*.62,3.48,z+d*.18],.22,.58,i%2?mats.green:mats.gold,10);
    }
    for(let i=0;i<3;i++) {
      box(scene,name+"-wall-shelf",[x+2.6+i*.18,4.2,z+d*.18],[.12,2.3,.55],mats.wood);
      box(scene,name+"-shelf-bracket",[x+2.45+i*.18,4.2,z+d*.18],[.18,2.45,.18],mats.gold);
    }
    // A wrought-iron chandelier hangs over the central aisle.
    cylinder(scene,name+"-chandelier-ring",[x,h-1.1,z],1.35,.13,mats.gold,20);
    cylinder(scene,name+"-chandelier-chain",[x,h-.48,z],.08,1.1,mats.wood,10);
    for(let i=0;i<6;i++) {
      const a=i*Math.PI/3;
      const candle=MeshBuilder.CreateSphere(name+"-chandelier-candle",{diameter:.22,segments:8},scene);
      candle.position.set(x+Math.cos(a)*1.18,h-1.0,z+Math.sin(a)*1.18);candle.material=mats.lantern;
    }
    if(name==="The Copper Stag Tavern" || name==="The Lantern and Lark" || name==="The Fox and Fir") {
      // Tavern-specific hearth, chimney breast, glowing embers and beer service details.
      const hx=x-w*.30, hz=z-d/2+.95;
      box(scene,name+"-massive-hearth-surround",[hx,.95,hz],[3.8,1.9,.72],mats.trim);
      box(scene,name+"-hearth-black-opening",[hx,1.02,hz-.39],[2.35,1.12,.08],mats.dark);
      box(scene,name+"-hearth-mantel",[hx,2.05,hz-.45],[4.2,.22,.85],mats.woodLight);
      box(scene,name+"-chimney-breast",[hx,4.0,hz+.20],[3.5,3.8,.52],mats.wall);
      const ember=mat(scene,name+"-ember-glow",new Color3(1,.24,.035),.35);
      ember.emissiveColor=new Color3(.95,.16,.015);
      const flame=MeshBuilder.CreateSphere(name+"-hearth-fire",{diameter:1,segments:12},scene);
      flame.position.set(hx,1.05,hz-.48);flame.scaling.set(.82,.9,.18);flame.material=ember;
      for(let j=0;j<4;j++) {
        cylinder(scene,name+"-ale-mug",[x-4+j*1.25,1.22,z+1.25],.25,.42,mats.gold,12);
        box(scene,name+"-mug-handle",[x-4.17+j*1.25,1.25,z+1.25],[.12,.25,.12],mats.gold);
      }
      // Round ale casks behind the bar and a hanging inn emblem.
      for(let j=0;j<3;j++) {
        cylinder(scene,name+"-ale-cask",[x+4.2,0.95,z-2+j*1.45],.78,1.75,mats.wood,16);
        cylinder(scene,name+"-ale-cask-hoop",[x+4.2,1.25,z-2+j*1.45],.82,.09,mats.gold,20);
      }
      box(scene,name+"-inn-sign-interior",[x,5.2,z-d/2+.55],[3.8,1.15,.18],mats.wood);
      const plaque=MeshBuilder.CreateCylinder(name+"-stag-crest",{diameter:1.05,height:.18,tessellation:6},scene);
      plaque.position.set(x,5.3,z-d/2+.38);plaque.rotation.x=Math.PI/2;plaque.material=mats.gold;
    } else if(name==="Adventurers Guild") {
      // Guild hall interior: mission counter, trophy wall, weapon rack, map table and banners.
      box(scene,"guild-reception-counter",[x,1.25,z-d/2+2.2],[6.8,1.55,1.0],mats.woodLight);
      obstacles.push({x,z:z-d/2+2.2,r:2.8});
      box(scene,"guild-counter-front-panel",[x,1.3,z-d/2+1.68],[5.8,.85,.08],mats.gold);
      box(scene,"guild-map-table",[x-5,.95,z+1.2],[3.0,.22,2.0],mats.wood);
      box(scene,"guild-map-table-map",[x-5,1.09,z+1.2],[2.55,.035,1.55],mats.banner);
      // A large mission board and framed maps on the rear wall.
      box(scene,"guild-interior-mission-board",[x,5.5,z-d/2+.38],[5.2,3.4,.22],mats.wood);
      for(let i=0;i<3;i++) {
        box(scene,"guild-mission-paper",[x-1.55+i*1.55,5.5,z-d/2+.22],[1.25,2.45,.05],mats.trim);
        box(scene,"guild-mission-red-seal",[x-1.55+i*1.55,4.55,z-d/2+.15],[.28,.28,.08],mats.flowers);
      }
      for(let side of [-1,1]) {
        box(scene,"guild-weapon-rack",[x+side*7.0,2.4,z],[.3,3.3,.35],mats.wood);
        for(let j=0;j<3;j++) {
          const blade=box(scene,"guild-display-sword",[x+side*7.0,2.3,z-1+j],[.10,2.2,.12],mats.gold);
          blade.rotation.z=(j-1)*.13;
          box(scene,"guild-sword-crossguard",[x+side*7.0,2.0,z-1+j],[.7,.12,.2],mats.woodLight);
        }
        box(scene,"guild-hall-banner",[x+side*7.8,6.3,z],[1.1,3.4,.12],mats.banner);
      }
    }
    for(let zz=z-d/2+.7;zz<=z+d/2-.7;zz+=1.35) {
      obstacles.push({x:x-w/2+.12,z:zz,r:.68});
      obstacles.push({x:x+w/2-.12,z:zz,r:.68});
    }
    for(let xx=x-w/2+.85;xx<=x+w/2-.85;xx+=1.35) obstacles.push({x:xx,z:z-d/2+.12,r:.68});
    for(let xx=x-w/2+.85;xx<=x+w/2-.85;xx+=1.35) if(Math.abs(xx-x)>1.5) obstacles.push({x:xx,z:z+d/2-.12,r:.68});
  }
  colliders.push({minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,doorX:x,doorWidth:1.9,doorZ:front,interior,passThrough:!!cfg.passThrough});
  return null;
}

export async function createRoyalCity(engine, canvas) {
  const scene=new Scene(engine);
  scene.clearColor=new Color4(.58,.74,.84,1);
  scene.fogMode=Scene.FOGMODE_EXP2;scene.fogDensity=.0028;scene.fogColor=new Color3(.68,.78,.84);
  const sky=new HemisphericLight("sky-fill",new Vector3(0,1,0),scene);sky.intensity=.86;sky.groundColor=new Color3(.29,.25,.20);
  const sun=new DirectionalLight("golden-sun",new Vector3(-.45,-1,.3),scene);sun.position=new Vector3(45,70,-20);sun.intensity=2.0;
  const shadow=new ShadowGenerator(2048,sun);shadow.useBlurExponentialShadowMap=true;shadow.blurKernel=24;
  shadow.setDarkness(.22);shadow.bias=.0005;shadow.normalBias=.025;
  scene.imageProcessingConfiguration.toneMappingEnabled=true;
  scene.imageProcessingConfiguration.toneMappingType=ImageProcessingConfiguration.TONEMAPPING_ACES;
  scene.imageProcessingConfiguration.exposure=1.12;
  scene.imageProcessingConfiguration.contrast=1.16;

  const mats={
    wall:texturedMat(scene,"aged-limestone",C.stone,"#a99a7d","#594d3d"),
    trim:mat(scene,"carved-stone",C.paleStone,.92),
    dark:mat(scene,"deep-arch-shadow",new Color3(.09,.085,.075)),
    wood:texturedMat(scene,"weathered-oak",C.wood,"#69452b","#24170e"),
    woodLight:mat(scene,"polished-oak",C.woodLight,.72),
    roof:texturedMat(scene,"slate-roof",C.roof,"#514641","#1c1715"),
    floor:mat(scene,"interior-floor",new Color3(.29,.23,.17)),
    glass:mat(scene,"blue-glass",new Color3(.12,.24,.29),.2,.35),
    gold:mat(scene,"aged-brass",C.gold,.35,.72),
    lantern:mat(scene,"warm-lantern",new Color3(1,.65,.25),.3,0),
    green:mat(scene,"ivy-green",new Color3(.13,.29,.16)),
    flowers:mat(scene,"flowers",new Color3(.67,.29,.31)),
    leaves:mat(scene,"tree-leaves",new Color3(.15,.31,.18)),
    trunk:mat(scene,"tree-bark",new Color3(.25,.16,.095)),
    banner:mat(scene,"royal-blue-cloth",C.blue),
  };


  // Real CC0 tile maps replace procedural noise on the hero surfaces.
  function surfaceMaps(material, baseColor, normal, tileU=3, tileV=3) {
    const albedo=new Texture(ASSET_ROOT+baseColor,scene,true,false);
    albedo.uScale=tileU;albedo.vScale=tileV;
    material.albedoTexture=albedo;
    if(normal) {
      const normalMap=new Texture(ASSET_ROOT+normal,scene,true,false);
      normalMap.uScale=tileU;normalMap.vScale=tileV;
      material.bumpTexture=normalMap;
      material.bumpTexture.level=.48;
    }
  }
  surfaceMaps(mats.wall,"T_Plaster_BaseColor.png","T_Plaster_Normal.png",2.6,2.6);
  surfaceMaps(mats.wood,"T_WoodTrim_BaseColor.png",null,2.2,2.2);
  surfaceMaps(mats.roof,"T_RoundTiles_BaseColor.png","T_RoundTiles_Normal.png",2.4,2.4);

  // Cobblestone plaza with a repeating hand-laid pattern.
  const ground=MeshBuilder.CreateGround("plaza-ground",{width:380,height:380,subdivisions:2},scene);
  ground.position.y=-.12;ground.material=texturedMat(scene,"cobblestone",new Color3(.53,.50,.43),"#8c8475","#39362f");
  surfaceMaps(ground.material,"T_UnevenBrick_BaseColor.png","T_UnevenBrick_Normal.png",9,9);
  for(let z=-39;z<=33;z+=6) for(let x=-39;x<=39;x+=6) {
    const p=MeshBuilder.CreateBox("individual-cobble",{width:5.78,height:.055,depth:5.78},scene);
    p.position.set(x,-.055,z);p.material=(Math.floor((x+39)/6+z/6)%6===0)?mats.trim:ground.material;
  }

  const colliders=[];
  const obstacles=[];
  const addObstacle=(x,z,r)=>obstacles.push({x,z,r});
  addBuilding(scene,{x:-21,z:6,w:15,d:10,h:9,name:"The Copper Stag Tavern",sign:"COPPER STAG • TAVERN",interior:true},{...mats},shadow,colliders,obstacles);
  addBuilding(scene,{x:-23,z:-20,w:20,d:14,h:12,name:"Adventurers Guild",sign:"ADVENTURERS GUILD",interior:true},{...mats},shadow,colliders,obstacles);
  addBuilding(scene,{x:22,z:-18,w:15,d:10,h:8.5,name:"Royal Market Hall",sign:"MARKET HALL"},{...mats},shadow,colliders,obstacles);
  // Landmark dressing: make the tavern and guild unmistakable from the square.
  // Copper Stag: oversized hanging sign, steep timber gable, warm windows and a beer emblem.
  const tavernGold=mat(scene,"tavern-sign-gold",new Color3(.92,.68,.27),.38,.48);
  const tavernGlow=mat(scene,"tavern-window-glow",new Color3(1,.48,.13),.28);
  tavernGlow.emissiveColor=new Color3(.9,.26,.055);
  for(const x of [-25.2,-16.8]) {
    const glow=box(scene,"copper-stag-warm-window",[x,6.2,11.18],[2.15,2.5,.12],tavernGlow);
    glow.material=tavernGlow;
    box(scene,"copper-stag-window-cross",[x,6.2,11.05],[.14,2.35,.12],mats.wood);
    box(scene,"copper-stag-window-crossbar",[x,6.2,11.03],[2.0,.14,.12],mats.wood);
  }
  // Tall timber gable and decorative braces break the generic house silhouette.
  const tavernGable=MeshBuilder.CreateCylinder("copper-stag-gable-crest",{diameter:3.0,height:.38,tessellation:3},scene);
  tavernGable.position.set(-21,10.9,11.0);tavernGable.rotation.z=Math.PI; tavernGable.rotation.x=Math.PI/2;tavernGable.material=mats.woodLight;
  for(const side of [-1,1]) {
    const brace=box(scene,"copper-stag-gable-brace",[-21+side*5.4,8.2,10.75],[.22,4.0,.28],mats.wood);
    brace.rotation.z=side*.72;
  }
  box(scene,"copper-stag-sign-arm",[-13.2,8.0,10.4],[.18,.18,2.1],mats.wood);
  box(scene,"copper-stag-sign-board",[-13.2,6.6,9.35],[4.8,2.35,.3],mats.wood);
  const tavernSignTex=new DynamicTexture("copper-stag-big-sign",{width:768,height:384},scene,false);
  const ts=tavernSignTex.getContext();
  ts.fillStyle="#302018";ts.fillRect(0,0,768,384);ts.strokeStyle="#d6a64c";ts.lineWidth=18;ts.strokeRect(12,12,744,360);
  ts.fillStyle="#f5d89b";ts.textAlign="center";ts.font="bold 76px Georgia";ts.fillText("THE COPPER STAG",384,150);
  ts.font="bold 54px Georgia";ts.fillText("TAVERN  •  ALE  •  ROOMS",384,260);tavernSignTex.update();
  const tavernSignMat=new StandardMaterial("copper-stag-big-sign-mat",scene);tavernSignMat.diffuseTexture=tavernSignTex;tavernSignMat.emissiveColor=new Color3(.22,.12,.035);
  const tavernSignFace=MeshBuilder.CreatePlane("copper-stag-big-sign-face",{width:4.55,height:2.1},scene);
  tavernSignFace.position.set(-13.2,6.6,9.17);tavernSignFace.material=tavernSignMat;
  for(const x of [-15.4,-11.0]) addLantern(scene,x,7.5,10.0,mats.gold,mats.lantern);

  // Adventurers' Guild: stone keep-like front, twin turrets, crossed-sword crest and banners.
  const guildStone=mat(scene,"guild-cut-stone",new Color3(.55,.52,.45),.92);
  const guildGold=mat(scene,"guild-heraldic-gold",new Color3(.86,.64,.27),.35,.62);
  for(const side of [-1,1]) {
    const tx=-23+side*9.1;
    const turret=cylinder(scene,"guild-front-turret",[tx,10.0,-20],4.2,17.5,guildStone,20);
    const turretCap=MeshBuilder.CreateCylinder("guild-turret-roof",{diameterTop:0,diameterBottom:5.3,height:5.5,tessellation:12},scene);
    turretCap.position.set(tx,21.4,-20);turretCap.material=mats.roof;
    cylinder(scene,"guild-turret-crown",[tx,18.7,-20],4.45,.35,guildGold,20);
    addBanner(scene,tx,15.5,-12.7,mats.gold,mats.banner,side);
    const slit=box(scene,"guild-turret-arrow-window",[tx,11.8,-12.82],[.65,2.7,.12],mats.dark);
  }
  box(scene,"guild-main-crest-plaque",[-23,9.2,-12.82],[5.4,3.2,.36],guildStone);
  const shield=MeshBuilder.CreateCylinder("guild-heraldic-shield",{diameter:2.45,height:.3,tessellation:6},scene);
  shield.position.set(-23,9.3,-13.08);shield.rotation.x=Math.PI/2;shield.material=guildGold;
  const swordA=box(scene,"guild-crossed-sword-a",[-23,9.3,-13.30],[.20,2.8,.18],mats.trim);swordA.rotation.z=.65;
  const swordB=box(scene,"guild-crossed-sword-b",[-23,9.3,-13.31],[.20,2.8,.18],mats.trim);swordB.rotation.z=-.65;
  const guildSignTex=new DynamicTexture("guild-front-sign",{width:768,height:256},scene,false);
  const gs=guildSignTex.getContext();gs.fillStyle="#202d32";gs.fillRect(0,0,768,256);gs.strokeStyle="#d7b56b";gs.lineWidth=16;gs.strokeRect(10,10,748,236);
  gs.fillStyle="#f5e4bd";gs.textAlign="center";gs.font="bold 62px Georgia";gs.fillText("ADVENTURERS' GUILD",384,155);guildSignTex.update();
  const guildSignMat=new StandardMaterial("guild-front-sign-mat",scene);guildSignMat.diffuseTexture=guildSignTex;guildSignMat.emissiveColor=new Color3(.13,.12,.08);
  const guildSign=MeshBuilder.CreatePlane("guild-front-sign-face",{width:5.5,height:1.8},scene);
  guildSign.position.set(-23,5.5,-12.78);guildSign.material=guildSignMat;



  // A compact inn quarter begins just beyond the eastern edge of the central square.
  const pubLaneMat=texturedMat(scene,"pub-quarter-road",new Color3(.39,.36,.31),"#81796c","#39352f",.96);
  const pubLane=MeshBuilder.CreateGround("pub-street-main-lane",{width:68,height:10,subdivisions:1},scene);
  pubLane.position.set(60,-.035,21);pubLane.material=pubLaneMat;
  const pubLink=MeshBuilder.CreateGround("pub-street-connector",{width:22,height:9,subdivisions:1},scene);
  pubLink.position.set(35,-.03,15);pubLink.rotation.y=-.48;pubLink.material=pubLaneMat;
  addBuilding(scene,{x:48,z:5,w:20,d:15,h:11,name:"The Lantern and Lark",sign:"THE LANTERN & LARK",interior:true},{...mats},shadow,colliders,obstacles);
  addBuilding(scene,{x:72,z:5,w:20,d:15,h:11.5,name:"The Fox and Fir",sign:"THE FOX & FIR",interior:true},{...mats},shadow,colliders,obstacles);
  // Dense lower-town frontage: projecting upper floors, timber braces, shutters, flower boxes and shop awnings.
  const streetWood=mat(scene,"lower-town-dark-oak",new Color3(.22,.13,.075),.9);
  const streetTrim=mat(scene,"lower-town-honey-oak",new Color3(.48,.31,.16),.82);
  const flowerRed=mat(scene,"lower-town-geranium",new Color3(.72,.16,.20),.78);
  const flowerPink=mat(scene,"lower-town-pink",new Color3(.88,.43,.48),.78);
  for(const [bx,bz,frontW,frontZ,upperY] of [[48,5,20,12.62,7.7],[72,5,20,12.62,7.9]]) {
    // Upper-storey overhang and heavy carved supporting brackets.
    box(scene,"lower-town-jettied-upper-floor",[bx,upperY,frontZ],[frontW+1.3,.34,1.05],streetWood);
    for(const side of [-1,1]) for(const dx of [-6.8,0,6.8]) {
      const bracket=box(scene,"lower-town-jettied-bracket",[bx+dx,upperY-.72,frontZ-.12],[.22,1.25,.32],streetTrim);
      bracket.rotation.z=side*.42;
    }
    // Shuttered upper windows with flower troughs.
    for(const wx of [-6.3,0,6.3]) {
      const y=upperY+1.2, z=frontZ-.28;
      box(scene,"lower-town-window-recess",[bx+wx,y,z],[2.15,2.25,.18],streetWood);
      box(scene,"lower-town-window-glass",[bx+wx,y,z-.12],[1.55,1.65,.07],mats.glass);
      box(scene,"lower-town-window-mullion-v",[bx+wx,y,z-.18],[.10,1.72,.08],streetTrim);
      box(scene,"lower-town-window-mullion-h",[bx+wx,y,z-.18],[1.62,.10,.08],streetTrim);
      for(const side of [-1,1]) {
        box(scene,"lower-town-window-shutter",[bx+wx+side*1.0,y,z-.19],[.34,1.85,.13],streetWood);
        for(let k=0;k<4;k++) box(scene,"lower-town-shutter-slat",[bx+wx+side*1.0,y-.58+k*.38,z-.27],[.29,.07,.06],streetTrim);
      }
      box(scene,"lower-town-flower-box",[bx+wx,y-.98,z-.42],[1.9,.34,.52],streetWood);
      for(let k=0;k<5;k++) {
        const bloom=MeshBuilder.CreateSphere("lower-town-window-geranium",{diameter:.28,segments:8},scene);
        bloom.position.set(bx+wx-.72+k*.36,y-.69,z-.48);bloom.material=k%2?flowerPink:flowerRed;
      }
    }
    // Striped canvas awning over the shopfront and small hanging sign.
    box(scene,"lower-town-awning-valance",[bx,4.8,frontZ-.95],[8.6,.18,.22],streetTrim);
    for(let k=0;k<8;k++) {
      const stripe=box(scene,"lower-town-awning-stripe",[bx-3.75+k*1.07,4.55,frontZ-1.15],[1.0,.12,1.65],k%2?mats.banner:mats.trim);
      stripe.rotation.x=-.10;
    }
    box(scene,"lower-town-shop-sign-arm",[bx+7.1,6.2,frontZ-.75],[.16,.16,1.25],streetWood);
    box(scene,"lower-town-shop-sign",[bx+7.1,5.45,frontZ-1.35],[1.45,1.45,.20],streetTrim);
    addLantern(scene,bx-8.3,4.4,frontZ-.65,mats.gold,mats.lantern);
    addLantern(scene,bx+8.3,4.4,frontZ-.65,mats.gold,mats.lantern);
    // Roof dormer, ridge ornaments and a masonry chimney crown.
    for(const dx of [-5.8,5.8]) {
      box(scene,"lower-town-roof-dormer-front",[bx+dx,12.1,bz-.5],[2.0,2.0,.28],mats.wall);
      const dormerRoof=box(scene,"lower-town-roof-dormer-cap",[bx+dx,13.15,bz-.5],[2.6,.22,1.9],streetWood);
      dormerRoof.rotation.z=.08;
    }
    cylinder(scene,"lower-town-chimney-cap",[bx-7.0,13.0,bz+4.4],.95,.22,streetTrim,8);
  }

  for(const [x,z] of [[39,18],[59,18],[82,18]]) {
    cylinder(scene,"pub-quarter-lamp-post",[x,2.15,z],.16,4.3,mats.wood,12);
    box(scene,"pub-quarter-lamp-cap",[x,4.25,z],[.85,.18,.85],mats.gold);
    const glow=MeshBuilder.CreateSphere("pub-quarter-lamp-glow",{diameter:.34,segments:10},scene);
    glow.position.set(x,3.78,z);glow.material=mats.lantern;
    addObstacle(x,z,.48);
  }
  for(const [x,z] of [[40,10],[61,10],[83,10],[44,27],[68,27]]) {
    addBarrel(scene,x,z,mats.wood,mats.gold);
    addObstacle(x,z,.68);
  }
  for(const x of [44,53,68,77]) {
    box(scene,"pub-quarter-terrace-table",[x,.88,18.4],[1.55,.18,1.15],mats.woodLight);
    box(scene,"pub-quarter-terrace-bench",[x,.5,20.0],[1.8,.2,.38],mats.wood);
    addObstacle(x,18.4,.95);
  }

  // Tavern outdoor terrace: benches, tables, barrels, flower boxes and striped awning.
  for(let i=0;i<3;i++) {
    addObstacle(-27+i*4,-1,1.0);
    addObstacle(-27+i*4,-2.05,1.05);
    addObstacle(-30+i*2.3,-1.4,.68);
    box(scene,"terrace-table",[-27+i*4,.9,-1],[1.6,.18,1.2],mats.woodLight);
    box(scene,"terrace-bench",[-27+i*4, .52,-2.05],[2,.22,.42],mats.wood);
    addBarrel(scene,-30+i*2.3,-1.4,mats.wood,mats.gold);
  }
  box(scene,"tavern-awning-frame",[-21,5.6,.2],[11,.18,2.5],mats.wood);
  for(let i=0;i<8;i++) {
    const stripe=box(scene,"canvas-awning-stripe",[-26+i*1.42,5.28,-.8],[1.35,.13,2.2],i%2?mats.banner:mats.trim);
    stripe.rotation.x=.12;
  }
  addPlanter(scene,-30,4,mats.trim,mats.green,mats.flowers);
  addPlanter(scene,-12,4,mats.trim,mats.green,mats.flowers);
  addBarrel(scene,-29,11,mats.wood,mats.gold);addBarrel(scene,-13,11,mats.wood,mats.gold);
  addObstacle(-29,11,.68);addObstacle(-13,11,.68);

  // A readable quest board stands beside the guild, close to the main square.
  box(scene,"quest-board-post-left",[-11.6,2.25,-12.45],[.26,4.5,.34],mats.wood);
  box(scene,"quest-board-post-right",[-7.4,2.25,-12.45],[.26,4.5,.34],mats.wood);
  box(scene,"quest-board-frame",[-9.5,3.15,-12.45],[4.65,3.65,.48],mats.wood);
  addObstacle(-9.5,-12.45,1.85);
  box(scene,"quest-board-face",[-9.5,3.15,-12.72],[4.25,3.25,.06],mats.woodLight);
  const questTexture=new DynamicTexture("guild-quest-board-lettering",{width:768,height:512},scene,false);
  const questCtx=questTexture.getContext();
  questCtx.fillStyle="#34251b";questCtx.fillRect(0,0,768,512);
  questCtx.strokeStyle="#d5b879";questCtx.lineWidth=15;questCtx.strokeRect(12,12,744,488);
  questCtx.fillStyle="#f5dfae";questCtx.textAlign="center";questCtx.font="bold 58px Georgia";questCtx.fillText("CURRENT QUESTS",384,86);
  questCtx.textAlign="left";questCtx.font="bold 29px Georgia";questCtx.fillStyle="#f2d7a0";
  questCtx.fillText("01  HERB GATHERING",54,174);
  questCtx.fillText("02  NORTH ROAD PATROL",54,270);
  questCtx.fillText("03  LAKE-SIDE ESCORT",54,366);
  questCtx.font="22px Georgia";questCtx.fillStyle="#d7c29c";questCtx.fillText("Ask at the guild reception",54,440);
  questTexture.update();
  const questMat=new StandardMaterial("guild-quest-board-ink",scene);
  questMat.diffuseTexture=questTexture;questMat.emissiveColor=new Color3(.12,.085,.045);
  const questFace=MeshBuilder.CreatePlane("guild-quest-board-readable-face",{width:4.15,height:3.05},scene);
  questFace.position.set(-9.5,3.15,-12.78);questFace.rotation.y=0;questFace.material=questMat;

  // Grand civic fountain: carved limestone tiers, broad water basins and a welcoming stone gathering plaza.
  const fountainStone=texturedMat(scene,"fountain-honed-limestone",new Color3(.72,.68,.59),"#b8ad98","#655b4c",.88);
  const fountainEdge=mat(scene,"fountain-edge-highlight",new Color3(.84,.79,.68),.78);
  const fountainShadow=mat(scene,"fountain-recess-shadow",new Color3(.29,.27,.23),.96);
  const fountainWater=mat(scene,"clear-fountain-water",new Color3(.18,.48,.56),.12,.18);
  fountainWater.alpha=.92;
  const fountainMetal=mat(scene,"fountain-aged-bronze",new Color3(.48,.34,.18),.38,.68);
  // Wide octagonal-looking stepped foundation, large enough to feel like a true town landmark.
  cylinder(scene,"fountain-square-foundation",[13,.18,5],17.4,.42,fountainStone,12);
  cylinder(scene,"fountain-foundation-upper",[13,.43,5],16.2,.24,fountainEdge,12);
  cylinder(scene,"fountain-foundation-shadowline",[13,.57,5],15.6,.10,fountainShadow,12);
  cylinder(scene,"fountain-outer-basin-foot",[13,.82,5],15.2,.48,fountainStone,64);
  cylinder(scene,"fountain-outer-basin-wall",[13,1.42,5],14.4,.92,fountainStone,64);
  // The water sits visibly BELOW the stone lip, so the basin reads as a hollow vessel.
  cylinder(scene,"fountain-basin-inner-recess",[13,1.70,5],12.9,.10,fountainShadow,64);
  cylinder(scene,"fountain-water-lower",[13,1.77,5],12.45,.08,fountainWater,64);
  cylinder(scene,"fountain-rim-lower",[13,1.91,5],14.75,.22,fountainEdge,64);
  cylinder(scene,"fountain-rim-inlay",[13,2.045,5],13.7,.045,fountainMetal,64);
  const basinInnerBand=MeshBuilder.CreateTorus("fountain-inner-waterline",{diameter:12.48,thickness:.10,tessellation:64},scene);
  basinInnerBand.position.set(13,1.83,5);basinInnerBand.material=fountainEdge;
  // Stone courses, voussoirs and buttresses give the basin real architectural weight.
  for(let course=0;course<2;course++) {
    const band=MeshBuilder.CreateTorus("fountain-basin-carved-course",{diameter:14.52-course*.16,thickness:.13,tessellation:64},scene);
    band.position.set(13,1.10+course*.48,5);band.material=course?fountainEdge:fountainShadow;
  }
  for(let i=0;i<16;i++) {
    const a=i*Math.PI/8, x=13+Math.cos(a)*7.12, z=5+Math.sin(a)*7.12;
    const buttress=box(scene,"fountain-basin-stone-pilaster",[x,1.38,z],[.58,1.12,.72],fountainEdge);
    buttress.rotation.y=-a;
    const cap=box(scene,"fountain-basin-pilaster-cap",[x,1.99,z],[.82,.16,.88],fountainStone);
    cap.rotation.y=-a;
  }
  // Repeated carved stone panels and small bronze rosettes around the basin.
  for(let i=0;i<24;i++) {
    const a=i*Math.PI/12, r=7.12;
    const panel=box(scene,"fountain-carved-panel",[13+Math.cos(a)*r,1.42,5+Math.sin(a)*r],[.82,.48,.10],fountainEdge);
    panel.rotation.y=-a;
    const rosette=MeshBuilder.CreateSphere("fountain-bronze-rosette",{diameter:.16,segments:10},scene);
    rosette.position.set(13+Math.cos(a)*7.2,1.48,5+Math.sin(a)*7.2);
    rosette.material=fountainMetal;
  }
  // Central monumental column and a smaller upper bowl create a recognisable tiered fountain silhouette.
  cylinder(scene,"fountain-central-pedestal-foot",[13,2.28,5],4.1,.38,fountainStone,12);
  cylinder(scene,"fountain-central-pedestal",[13,3.12,5],3.0,1.55,fountainStone,16);
  cylinder(scene,"fountain-pedestal-cap",[13,3.98,5],3.8,.32,fountainEdge,16);
  cylinder(scene,"fountain-upper-bowl-base",[13,4.22,5],2.8,.38,fountainStone,48);
  cylinder(scene,"fountain-upper-bowl",[13,4.58,5],4.8,.48,fountainStone,48);
  cylinder(scene,"fountain-upper-water",[13,4.84,5],4.15,.10,fountainWater,48);
  const upperRim=MeshBuilder.CreateTorus("fountain-upper-rim",{diameter:4.8,thickness:.16,tessellation:48},scene);
  upperRim.position.set(13,4.83,5);upperRim.material=fountainEdge;
  const lowerRipple=MeshBuilder.CreateTorus("fountain-lower-ripple",{diameter:8.4,thickness:.045,tessellation:64},scene);
  lowerRipple.position.set(13,1.84,5);lowerRipple.material=mat(scene,"fountain-water-glint",new Color3(.65,.84,.86),.12,.18);
  // A dignified stone guardian, rather than a plain gold mannequin, crowns the fountain.
  cylinder(scene,"guardian-footing",[13,5.12,5],2.0,.35,fountainMetal,16);
  const statue=MeshBuilder.CreateSphere("emperor-statue-torso",{diameter:1.55,segments:24},scene);
  statue.position.set(13,6.15,5);statue.scaling.set(1.05,1.55,.78);statue.material=fountainStone;
  const head=MeshBuilder.CreateSphere("emperor-statue-head",{diameter:.72,segments:20},scene);
  head.position.set(13,7.38,5);head.material=fountainStone;
  const cloak=MeshBuilder.CreateCylinder("guardian-cloak",{diameterTop:1.15,diameterBottom:2.0,height:1.45,tessellation:12},scene);
  cloak.position.set(13,5.65,5);cloak.material=fountainStone;
  const scepter=MeshBuilder.CreateCylinder("guardian-scepter",{diameter:.10,height:2.2,tessellation:10},scene);
  scepter.position.set(14.05,6.2,5);scepter.rotation.z=-.12;scepter.material=fountainMetal;
  const crown=MeshBuilder.CreateCylinder("guardian-crown",{diameterTop:.55,diameterBottom:.82,height:.32,tessellation:8},scene);
  crown.position.set(13,7.82,5);crown.material=fountainMetal;
  // Gentle arcing water streams from the upper bowl into the broad lower basin.
  for(let i=0;i<8;i++) {
    const a=i*Math.PI/4;
    const jet=MeshBuilder.CreateCylinder("fountain-water-jet",{diameterTop:.025,diameterBottom:.075,height:1.75,tessellation:10},scene);
    jet.position.set(13+Math.cos(a)*2.0,3.55,5+Math.sin(a)*2.0);
    jet.rotation.z=Math.cos(a)*-.42;jet.rotation.x=Math.sin(a)*.42;jet.material=fountainWater;
  }
  for(let i=0;i<16;i++) {
    const a=i*Math.PI/8;
    const nozzle=MeshBuilder.CreateCylinder("fountain-basin-nozzle",{diameterTop:.035,diameterBottom:.10,height:.38,tessellation:8},scene);
    nozzle.position.set(13+Math.cos(a)*5.45,2.25,5+Math.sin(a)*5.45);
    nozzle.rotation.z=Math.cos(a)*-.15;nozzle.rotation.x=Math.sin(a)*.15;nozzle.material=fountainMetal;
  }
  // Fine artisan details: carved shell niches, bronze fish spouts, heraldic medallions and stone fluting.
  for(let i=0;i<16;i++) {
    const a=i*Math.PI/8, ca=Math.cos(a), sa=Math.sin(a);
    const x=13+ca*7.22, z=5+sa*7.22;
    const shield=MeshBuilder.CreateCylinder("fountain-heraldic-medallion",{diameter:1.02,height:.12,tessellation:6},scene);
    shield.position.set(x,1.46,z);shield.rotation.x=Math.PI/2;shield.rotation.y=-a;shield.material=fountainMetal;
    const inset=MeshBuilder.CreateSphere("fountain-medallion-center",{diameter:.34,segments:12},scene);
    inset.position.set(13+ca*7.31,1.47,5+sa*7.31);inset.scaling.z=.22;inset.material=fountainEdge;
    // Small bronze fish mouths form the lower-basin outlets; all remain attached to the basin.
    const fish=MeshBuilder.CreateSphere("fountain-bronze-fish-spout",{diameter:.42,segments:12},scene);
    fish.position.set(13+ca*6.45,2.18,5+sa*6.45);fish.scaling.set(1,.65,.55);fish.material=fountainMetal;
    const mouth=MeshBuilder.CreateTorus("fountain-fish-mouth",{diameter:.16,thickness:.035,tessellation:12},scene);
    mouth.position.set(13+ca*6.66,2.17,5+sa*6.66);mouth.rotation.y=-a;mouth.material=fountainEdge;
    const stream=MeshBuilder.CreateCylinder("fountain-fish-waterfall",{diameterTop:.035,diameterBottom:.10,height:.48,tessellation:8},scene);
    stream.position.set(13+ca*6.42,1.92,5+sa*6.42);stream.rotation.z=ca*.10;stream.rotation.x=sa*.10;stream.material=fountainWater;
  }
  // Vertical flutes and capitals make the central support read as carved stonework.
  for(let i=0;i<12;i++) {
    const a=i*Math.PI/6;
    const flute=box(scene,"fountain-pedestal-flute",[13+Math.cos(a)*1.48,3.13,5+Math.sin(a)*1.48],[.13,1.12,.10],fountainEdge);
    flute.rotation.y=-a;
  }
  for(let i=0;i<8;i++) {
    const a=i*Math.PI/4;
    const finial=MeshBuilder.CreateSphere("fountain-upper-bowl-finial",{diameter:.24,segments:10},scene);
    finial.position.set(13+Math.cos(a)*2.25,4.96,5+Math.sin(a)*2.25);finial.material=fountainMetal;
  }
  // A narrow mosaic band gives the upper bowl a distinct decorative identity.
  const mosaic=MeshBuilder.CreateTorus("fountain-upper-bowl-mosaic",{diameter:4.58,thickness:.055,tessellation:64},scene);
  mosaic.position.set(13,4.48,5);mosaic.material=fountainMetal;
  // Crown the statue with a detailed laurel wreath and a small raised crest.
  for(let i=0;i<7;i++) {
    const a=-Math.PI*.85+i*Math.PI*1.7/6;
    const leaf=MeshBuilder.CreateSphere("guardian-laurel-leaf",{diameter:.22,segments:8},scene);
    leaf.position.set(13+Math.cos(a)*.47,7.82+Math.sin(a)*.22,4.96);
    leaf.scaling.set(1.45,.62,.42);leaf.material=fountainMetal;
  }
  const crest=MeshBuilder.CreateCylinder("guardian-crown-crest",{diameter:.34,height:.12,tessellation:4},scene);
  crest.position.set(13,8.03,4.88);crest.rotation.x=Math.PI/2;crest.material=fountainEdge;

  // Leave a broad, unobstructed paved ring around the fountain for free movement.
  const fountainApron=MeshBuilder.CreateGround("fountain-open-apron",{width:34,height:34,subdivisions:1},scene);
  fountainApron.position.set(13,-.045,5);
  fountainApron.material=ground.material;
  const waterRing=lowerRipple;

  // Warm civic square details: radial stone paving, carved edging, lanterns and places to sit.
  const plazaGold=mat(scene,"plaza-warm-brass",new Color3(.62,.43,.19),.38,.62);
  const pavingLight=texturedMat(scene,"sun-warmed-paving",new Color3(.72,.67,.56),"#b7aa91","#6d6251",.94);
  const pavingDark=mat(scene,"paving-joint-shadow",new Color3(.32,.30,.26),.98);
  // Keep the fountain plaza's paving broad and calm; omit concentric inlays and spoke-like strips.
  // Ornate stone lamp standards with warm glass lanterns.
  for(let i=0;i<8;i++) {
    const a=i*Math.PI/4,x=13+Math.cos(a)*23.5,z=5+Math.sin(a)*23.5;
    cylinder(scene,"plaza-lamp-foot",[x,.34,z],.92,.55,fountainStone,12);
    cylinder(scene,"plaza-lamp-column",[x,2.05,z],.32,3.0,fountainMetal,12);
    cylinder(scene,"plaza-lamp-cap",[x,3.62,z],.72,.22,plazaGold,12);
    const lantern=MeshBuilder.CreateBox("plaza-lantern-glass",{width:.58,height:.78,depth:.58},scene);
    lantern.position.set(x,3.18,z);lantern.material=mats.lantern;
    cylinder(scene,"plaza-lamp-crown",[x,3.68,z],.2,.35,fountainMetal,8);
  }
  // Decorative troughs and urns are omitted so the fountain approach stays clear.

  // Market stalls, cloth roofs, produce crates and baskets.
  for(let i=0;i<4;i++) {
    const x=14+i*4.5,z=-10-(i%2)*3;
    addObstacle(x,z,1.9);
    addObstacle(x-1.3,z+1.5,.68);
    box(scene,"market-counter",[x,1,z],[3.3,1.6,2.1],mats.wood);
    box(scene,"market-canopy",[x,2.65,z],[3.8,.18,2.7],i%2?mats.banner:mats.flowers);
    for(const dx of [-1.65,1.65]) for(const dz of [-1.05,1.05])
      box(scene,"market-post",[x+dx,1.8,z+dz],[.12,2.0,.12],mats.woodLight);
    for(let j=0;j<5;j++) {
      const fruit=MeshBuilder.CreateSphere("market-produce",{diameter:.42,segments:10},scene);
      fruit.position.set(x-1.1+(j%3)*.75,1.92,z-.35+Math.floor(j/3)*.65);
      fruit.material=[mats.flowers,mats.green,mats.gold][j%3];
    }
    addBarrel(scene,x-1.3,z+1.5,mats.wood,mats.gold);
  }

  // Gatehouse and layered city approach.
  addBuilding(scene,{x:0,z:-53,w:22,d:10,h:14,name:"Royal Gatehouse",sign:"THE CROWN GATE",passThrough:true},{...mats},shadow,colliders,obstacles);
  for(let side of [-1,1]) {
    const tower=cylinder(scene,"gatehouse-tower",[side*11,9,-53],5.4,18,mats.wall,16);
    const cap=MeshBuilder.CreateCylinder("gatehouse-turret-roof",{diameterTop:0,diameterBottom:6.4,height:4.8,tessellation:12},scene);
    cap.position.set(side*11,20.4,-43);cap.material=mats.roof;
    box(scene,"gate-banner-bracket",[side*11,14,-56],[.2,.2,1],mats.gold);
    addBanner(scene,side*11,17,-56,mats.gold,mats.banner,side);
  }
  for(let i=0;i<8;i++) {
    const house=MeshBuilder.CreateBox("distant-city-house",{width:5+Math.random()*3,height:5+Math.random()*7,depth:5},scene);
    house.position.set(-32+i*9,house.scaling.y+2,-59-(i%3)*5);house.material=mats.wall;
    const roof=MeshBuilder.CreateCylinder("distant-roof",{diameterTop:0,diameterBottom:7,height:3,tessellation:4},scene);
    roof.position.set(house.position.x,house.position.y+5,house.position.z);roof.material=mats.roof;
  }
  // The royal citadel: a layered limestone fortress with a proper keep, curtain walls,
  // crenellations, arched windows, buttresses, rooflines and royal banners.
  const cliffMat=texturedMat(scene,"castle-cliff-rock",new Color3(.34,.36,.35),"#555750","#292b28",.98);
  const castleStone=texturedMat(scene,"castle-cut-limestone",new Color3(.73,.68,.57),"#b5a88e","#5b5142",.9);
  const castleShadow=mat(scene,"castle-window-depth",new Color3(.12,.13,.13),.98);
  const castleRoof=texturedMat(scene,"castle-blue-slate",new Color3(.17,.21,.23),"#454d50","#171d20",.82);
  const castleGold=mat(scene,"castle-aged-gold",new Color3(.72,.52,.23),.34,.68);
  // Split the cliff into shoulders, retaining the broad central approach to the World Tree.
  for(const side of [-1,1]) {
    const cliff=MeshBuilder.CreateBox("castle-cliff-shoulder",{width:24,height:17,depth:17},scene);
    cliff.position.set(side*20,7.5,-77);cliff.material=cliffMat;
  }
  const approach=MeshBuilder.CreateGround("world-tree-approach",{width:15,height:68,subdivisions:1},scene);
  approach.position.set(0,-.08,-88);approach.material=mats.floor;
  // Main curtain wall and its raised central gatehouse.
  box(scene,"citadel-front-wall",[0,17,-77],[53,17,3.2],castleStone);
  box(scene,"citadel-wall-base-course",[0,9.1,-75.25],[54,1.0,.75],mats.trim);
  box(scene,"citadel-wall-cornice",[0,25.45,-75.15],[54,.62,3.7],castleGold);
  for(let i=0;i<27;i++) {
    const x=-25.5+i*1.96;
    box(scene,"citadel-merlon",[x,26.55,-77],[1.15,1.65,3.25],castleStone);
    if(i%2===0) box(scene,"citadel-arrow-slit",[x,18.8,-75.28],[.22,2.0,.08],castleShadow);
  }
  // Central keep rises behind the gate, with layered roofs and a readable silhouette.
  // The lower keep is built as a real open-front hall instead of a sealed block.
  // Its broad central doorway lets visitors see the royal hall from the courtyard.
  box(scene,"royal-keep-left-wing",[-7.8,17.0,-82],[5.4,17,15],castleStone);
  box(scene,"royal-keep-right-wing",[7.8,17.0,-82],[5.4,17,15],castleStone);
  box(scene,"royal-keep-over-door",[0,23.0,-82],[10.2,5.0,15],castleStone);
  // The rear wall is split around a broad doorway, so the throne hall continues into the private suite.
  box(scene,"royal-keep-back-wall-left",[-7.5,17.0,-89.35],[6,17,1.0],castleStone);
  box(scene,"royal-keep-back-wall-right",[7.5,17.0,-89.35],[6,17,1.0],castleStone);
  box(scene,"royal-keep-back-wall-lintel",[0,24.0,-89.35],[9,3,1.0],castleStone);
  box(scene,"royal-keep-upper",[0,40.2,-82],[16.8,7.5,12.2],mats.trim);
  // Four connected palace apartments extend from the central throne hall.
  // The side-wing walls are split around real door openings so the rooms can be explored.
  const wingFloor=mat(scene,"palace-wing-floor",new Color3(.73,.70,.62),.92);
  const wingWall=castleStone;
  const palaceWingStartIndex=scene.meshes.length;
  for(const side of [-1,1]) {
    const cx=side*17.25, innerX=side*10.45, outerX=side*24.05;
    // Continuous walkable floor and upper cornice define the east and west wings.
    box(scene,"palace-wing-floor",[cx,8.58,-82],[13.6,.24,15.0],wingFloor);
    box(scene,"palace-wing-ceiling",[cx,31.0,-82],[13.6,.42,15.0],castleStone);
    // Steep blue-slate roofs make the two palace wings visible as real exterior volumes.
    const innerRoof=box(scene,"palace-wing-inner-roof",[cx-side*3.2,27.45,-82],[7.8,.62,17.2],castleRoof);
    innerRoof.rotation.z=-side*.36;
    const outerRoof=box(scene,"palace-wing-outer-roof",[cx+side*3.2,27.45,-82],[7.8,.62,17.2],castleRoof);
    outerRoof.rotation.z=side*.36;
    box(scene,"palace-wing-gold-ridge",[cx,29.0,-82],[.48,.38,17.5],castleGold);
    // Outer wall, with tall inset windows facing the gardens.
    box(scene,"palace-wing-outer-wall",[outerX,20.5,-82],[.9,24,15.0],wingWall);
    for(const z of [-86.2,-82,-77.8]) {
      box(scene,"palace-wing-window-recess",[outerX-side*.48,18.1,z],[.12,4.1,1.7],castleShadow);
      box(scene,"palace-wing-window-glass",[outerX-side*.39,18.1,z],[.08,3.3,1.1],mats.glass);
      box(scene,"palace-wing-window-mullion",[outerX-side*.32,18.1,z],[.08,3.35,.10],castleGold);
      box(scene,"palace-wing-window-sill",[outerX-side*.30,15.95,z],[.38,.22,2.0],mats.trim);
      const arch=MeshBuilder.CreateTorus("palace-wing-window-arch",{diameter:1.25,thickness:.13,tessellation:16},scene);
      arch.scaling.y=1.35;arch.position.set(outerX-side*.3,20.0,z);arch.rotation.y=Math.PI/2;arch.material=mats.trim;
    }
    // The inner wall has a broad doorway into the throne hall.
    for(const z of [-77.55,-87.0]) box(scene,"palace-wing-inner-wall",[innerX,20.5,z],[.9,24,5.0],wingWall);
    // Front and rear walls close the wing while leaving the central hall-facing door open.
    box(scene,"palace-wing-front-wall",[cx,20.5,-74.55],[13.6,24,.9],wingWall);
    box(scene,"palace-wing-rear-wall",[cx,20.5,-89.45],[13.6,24,.9],wingWall);
    // A partition separates two rooms; its central opening keeps both rooms connected.
    box(scene,"palace-wing-partition-front",[cx+side*.1,17,-84.85],[12.7,17,.75],castleStone);
    box(scene,"palace-wing-partition-rear",[cx+side*.1,17,-79.15],[12.7,17,.75],castleStone);
    // Door frames and gilded lintels make the openings legible.
    for(const z of [-82,-82]) {
      box(scene,"palace-wing-door-jamb",[innerX-side*.05,17,z-1.55],[.55,8.4,.42],mats.trim);
      box(scene,"palace-wing-door-jamb",[innerX-side*.05,17,z+1.55],[.55,8.4,.42],mats.trim);
      box(scene,"palace-wing-door-lintel",[innerX-side*.05,21.2,z],[.65,.5,3.5],castleGold);
    }
    // West wing: library and council chamber. East wing: royal dining room and private salon.
    const roomA=side<0?"palace-library":"palace-banquet-room";
    const roomB=side<0?"palace-council-room":"palace-royal-salon";
    const wood=mat(scene,"palace-furniture-walnut",new Color3(.22,.105,.055),.78);
    const cloth=mat(scene,"palace-furniture-velvet",new Color3(.34,.10,.16),.88);
    // Front room furnishings.
    box(scene,roomA+"-rug",[cx,8.76,-86.0],[7.4,.08,4.2],cloth);
    box(scene,roomA+"-table",[cx,9.55,-86.0],[3.8,.35,1.55],wood);
    for(const dx of [-1.35,1.35]) for(const dz of [-.95,.95]) {
      box(scene,roomA+"-chair-seat",[cx+dx,9.15,-86+dz],[.85,.25,.85],wood);
      box(scene,roomA+"-chair-back",[cx+dx,9.75,-86+dz*1.15],[.82,1.0,.18],wood);
    }
    // Rear room furnishings.
    box(scene,roomB+"-rug",[cx,8.76,-78.0],[7.4,.08,4.2],cloth);
    box(scene,roomB+"-table",[cx,9.55,-78.0],[4.2,.35,1.45],wood);
    for(let i=0;i<5;i++) {
      const candle=MeshBuilder.CreateCylinder(roomB+"-candle",{diameter:.12,height:.55,tessellation:8},scene);
      candle.position.set(cx-1.5+i*.75,10.0,-78.0);candle.material=castleGold;
    }
    // Wall-mounted sconces, framed paintings and bookcases provide room identity.
    for(const z of [-87.4,-76.6]) {
      box(scene,"palace-wing-wall-sconce",[cx,16.8,z],[.45,1.0,.24],castleGold);
      const light=MeshBuilder.CreateSphere("palace-wing-sconce-glow",{diameter:.28,segments:8},scene);
      light.position.set(cx,17.35,z-.18);light.material=mats.lantern;
    }
    if(side<0) {
      // Library: floor-to-ceiling shelves, a rolling ladder, reading lamps and scroll cabinets.
      for(const x of [cx-5.3,cx+5.3]) {
        box(scene,"palace-library-bookcase",[x,13.2,-86.0],[1.0,8.2,3.8],wood);
        for(let level=0;level<4;level++) {
          box(scene,"palace-library-shelf",[x,10.0+level*1.8,-84.0],[1.08,.13,3.9],mats.trim);
          for(let b=0;b<5;b++) {
            const book=box(scene,"palace-library-book",[x-0.34+b*.17,10.55+level*1.55,-84.25],[.12,1.05,.38],b%2?mats.banner:mats.gold);
          }
        }
      }
      box(scene,"palace-library-ladder-rail",[cx-4.15,13.5,-82.7],[.12,6.6,.12],castleGold);
      box(scene,"palace-library-ladder-rail",[cx-4.15,13.5,-87.1],[.12,6.6,.12],castleGold);
      for(let rung=0;rung<8;rung++) box(scene,"palace-library-ladder-rung",[cx-4.15,10.6+rung*.78,-84.9],[.16,.09,4.4],wood);
      box(scene,"palace-library-reading-desk",[cx,9.65,-86.0],[3.2,.16,1.15],wood);
      for(let side2 of [-1,1]) {
        const lamp=MeshBuilder.CreateSphere("palace-library-lamp",{diameter:.25,segments:10},scene);
        lamp.position.set(cx+side2*1.2,10.25,-86.0);lamp.material=mats.lantern;
      }
      box(scene,"palace-council-map-table",[cx,9.35,-78.0],[4.8,.28,2.6],wood);
      box(scene,"palace-council-map",[cx,9.52,-78.0],[3.8,.035,1.8],mats.trim);
      for(let i=0;i<4;i++) {
        const marker=MeshBuilder.CreateCylinder("palace-council-map-marker",{diameter:.18,height:.12,tessellation:10},scene);
        marker.position.set(cx-1.3+i*.82,9.66,-78.0+(i%2)*.42);marker.material=castleGold;
      }
      box(scene,"palace-council-fireplace",[cx,12.0,-74.95],[3.5,4.8,.8],wood);
      box(scene,"palace-council-fire-opening",[cx,10.8,-74.48],[1.8,2.1,.08],castleShadow);
      box(scene,"palace-council-mantel",[cx,14.5,-74.35],[4.2,.28,1.0],castleGold);
    } else {
      // Banquet room: long feast table, place settings, carved fireplace and royal tapestry.
      for(let i=0;i<6;i++) {
        const plate=MeshBuilder.CreateCylinder("palace-banquet-plate",{diameter:.48,height:.06,tessellation:16},scene);
        plate.position.set(cx-1.5+i*.6,9.76,-78.0);plate.material=mats.trim;
        const goblet=MeshBuilder.CreateCylinder("palace-banquet-goblet",{diameterTop:.16,diameterBottom:.07,height:.32,tessellation:10},scene);
        goblet.position.set(cx-1.5+i*.6,9.96,-77.45);goblet.material=castleGold;
      }
      box(scene,"palace-banquet-fireplace",[cx,12.0,-74.95],[3.8,5.0,.8],wood);
      box(scene,"palace-banquet-fire-opening",[cx,10.9,-74.48],[2.0,2.2,.08],castleShadow);
      const fire=MeshBuilder.CreateSphere("palace-banquet-fire",{diameter:1.0,segments:10},scene);
      fire.position.set(cx,10.9,-74.25);fire.scaling.set(1.0,.75,.25);fire.material=mats.lantern;
      box(scene,"palace-banquet-mantel",[cx,14.65,-74.35],[4.4,.3,1.0],castleGold);
      box(scene,"palace-banquet-tapestry",[cx,18.3,-74.4],[3.4,4.6,.12],mats.banner);
      box(scene,"palace-banquet-tapestry-crest",[cx,18.4,-74.28],[1.1,1.6,.08],castleGold);
      box(scene,"palace-salon-settee",[cx,9.25,-86.0],[4.0,.65,1.2],cloth);
      box(scene,"palace-salon-back",[cx,10.05,-86.5],[4.0,1.25,.28],cloth);
      for(let side2 of [-1,1]) {
        box(scene,"palace-salon-arm",[cx+side2*1.9,9.75,-86.0],[.3,1.0,1.2],castleGold);
        const vase=MeshBuilder.CreateCylinder("palace-salon-vase",{diameterTop:.28,diameterBottom:.48,height:.85,tessellation:12},scene);
        vase.position.set(cx+side2*5.0,9.45,-86.0);vase.material=mats.trim;
      }
    }
    // Gilded pilasters and a restrained blue-and-gold banner mark each wing entrance.
    for(const z of [-88.6,-75.4]) {
      box(scene,"palace-wing-pilaster",[cx,17,z],[.55,16,.55],mats.trim);
      box(scene,"palace-wing-gilt-capital",[cx,24.9,z],[1.0,.38,.9],castleGold);
    }
  }
  // Keep the entire new wing assembly aligned with the central keep after the citadel depth adjustment.
  for(const mesh of scene.meshes.slice(palaceWingStartIndex)) mesh.position.z-=22;
  // Palace hall floor, pale columns, crimson runner and a visible throne.
  box(scene,"royal-hall-floor",[0,8.62,-82],[15.2,.24,13.0],mats.trim);
  box(scene,"royal-hall-carpet",[0,8.78,-82],[4.2,.06,12.5],mats.banner);
  for(let side of [-1,1]) for(let z=-87;z<=-77;z+=3.3) {
    cylinder(scene,"royal-hall-column-base",[side*6.2,9.05,z],1.25,.48,castleGold,16);
    const col=cylinder(scene,"royal-hall-column",[side*6.2,16.5,z],.62,14.5,mats.trim,20);
    cylinder(scene,"royal-hall-column-capital",[side*6.2,24.0,z],1.15,.55,castleGold,16);
  }
  const throne=box(scene,"royal-throne-seat",[0,10.2,-87.6],[3.4,.55,2.0],castleGold);
  box(scene,"royal-throne-back",[0,12.1,-88.4],[3.3,4.0,.55],castleStone);
  for(let side of [-1,1]) {
    box(scene,"royal-throne-arm",[side*1.65,11.0,-87.7],[.42,1.4,1.8],castleGold);
    const finial=MeshBuilder.CreateSphere("royal-throne-finial",{diameter:.42,segments:12},scene);
    finial.position.set(side*1.65,14.2,-88.4);finial.material=castleGold;
  }
  // A grand suspended chandelier, paired royal standards and visitor benches.
  const chandelier=MeshBuilder.CreateCylinder("royal-hall-chandelier-ring",{diameter:5.8,height:.22,tessellation:32},scene);
  chandelier.position.set(0,29.0,-82);chandelier.material=castleGold;
  for(let i=0;i<10;i++) {
    const a=i*Math.PI*2/10;
    const candle=MeshBuilder.CreateCylinder("royal-hall-chandelier-candle",{diameter:.16,height:.85,tessellation:10},scene);
    candle.position.set(Math.cos(a)*2.45,29.55,-82+Math.sin(a)*2.45);candle.material=mats.trim;
    const flame=MeshBuilder.CreateSphere("royal-hall-chandelier-flame",{diameter:.22,segments:8},scene);
    flame.position.set(Math.cos(a)*2.45,30.1,-82+Math.sin(a)*2.45);flame.material=mats.lantern;
    const chain=MeshBuilder.CreateCylinder("royal-hall-chandelier-chain",{diameter:.055,height:2.5,tessellation:8},scene);
    chain.position.set(Math.cos(a)*2.45,26.9,-82+Math.sin(a)*2.45);chain.material=castleGold;
  }
  const wood=mat(scene,"palace-furniture-walnut",new Color3(.22,.105,.055),.78);
  const cloth=mat(scene,"palace-furniture-velvet",new Color3(.34,.10,.16),.88);
  for(let side of [-1,1]) {
    box(scene,"royal-hall-visitor-bench",[side*4.8,9.25,-77.4],[2.7,.35,1.0],wood);
    box(scene,"royal-hall-visitor-bench-back",[side*4.8,10.0,-77.85],[2.7,1.1,.2],wood);
    box(scene,"royal-hall-royal-standard",[side*7.0,20.5,-86.7],[.9,8.0,.12],mats.banner);
    box(scene,"royal-hall-standard-crest",[side*7.0,20.5,-86.58],[.48,.8,.08],castleGold);
  }
  // Tall jewel-toned stained-glass panels glow behind the throne.
  for(let i=0;i<5;i++) {
    const pane=box(scene,"royal-hall-stained-glass",[-4+i*2,20.5,-88.72],[1.1,8.0,.08],i%2?mats.banner:mats.glass);
    pane.material.emissiveColor=new Color3(.08,.12,.18);
  }
  box(scene,"royal-keep-roof-base",[0,44.3,-82],[18.5,.65,13.8],castleGold);
  const keepRoof=MeshBuilder.CreateCylinder("royal-keep-pitched-roof",{diameterTop:0,diameterBottom:18.5,height:8.5,tessellation:4},scene);
  keepRoof.position.set(0,48.6,-82);keepRoof.rotation.y=Math.PI/4;keepRoof.material=castleRoof;
  // A second walkable palace suite continues directly beyond the throne hall.
  const suiteZ=-109.5;
  box(scene,"royal-suite-floor",[0,8.62,suiteZ],[18,.24,20],wingFloor);
  box(scene,"royal-suite-ceiling",[0,31.0,suiteZ],[18,.38,20],castleStone);
  for(const side of [-1,1]) {
    box(scene,"royal-suite-side-wall",[side*9,20.5,suiteZ],[.8,24,20],castleStone);
    for(const z of [-105,-109.5,-114]) {
      box(scene,"royal-suite-window-recess",[side*8.55,17.5,z],[.12,4.5,2.0],castleShadow);
      box(scene,"royal-suite-window-glass",[side*8.48,17.5,z],[.08,3.7,1.35],mats.glass);
      box(scene,"royal-suite-window-sill",[side*8.25,15.1,z],[.45,.2,2.25],castleGold);
    }
    for(const z of [-105,-109.5,-114]) {
      cylinder(scene,"royal-suite-column-base",[side*7.5,9.0,z],1.0,.4,castleGold,16);
      cylinder(scene,"royal-suite-column",[side*7.5,16.8,z],.48,15.2,mats.trim,16);
      cylinder(scene,"royal-suite-column-cap",[side*7.5,24.5,z],.95,.4,castleGold,16);
    }
  }
  box(scene,"royal-suite-back-wall",[0,20.5,suiteZ-10],[18,24,.8],castleStone);
  const suiteCloth=mat(scene,"royal-suite-velvet",new Color3(.34,.10,.16),.88);
  // Canopied royal bed, embroidered curtains and a carved headboard.
  box(scene,"royal-suite-bed-frame",[0,9.45,suiteZ-5.8],[5.6,.55,4.0],mats.wood);
  box(scene,"royal-suite-mattress",[0,9.85,suiteZ-5.7],[5.1,.42,3.6],suiteCloth);
  box(scene,"royal-suite-headboard",[0,11.4,suiteZ-7.55],[5.5,3.0,.38],castleGold);
  for(const side of [-1,1]) {
    box(scene,"royal-suite-bedpost",[side*2.5,11.8,suiteZ-7.5],[.24,4.8,.24],castleGold);
    const finial=MeshBuilder.CreateSphere("royal-suite-bed-finial",{diameter:.55,segments:12},scene);
    finial.position.set(side*2.5,14.25,suiteZ-7.5);finial.material=castleGold;
    box(scene,"royal-suite-bed-curtain",[side*2.35,13.1,suiteZ-5.7],[.16,3.3,3.6],mats.banner);
    box(scene,"royal-suite-dresser",[side*6.0,9.8,suiteZ+2.2],[2.1,1.6,1.0],mats.wood);
    box(scene,"royal-suite-dresser-top",[side*6.0,10.65,suiteZ+2.2],[2.3,.16,1.1],castleGold);
    const vase=MeshBuilder.CreateCylinder("royal-suite-vase",{diameterTop:.32,diameterBottom:.65,height:1.2,tessellation:14},scene);
    vase.position.set(side*6.0,11.3,suiteZ+2.2);vase.material=mats.trim;
    box(scene,"royal-suite-sofa",[side*4.8,9.25,suiteZ+6.0],[3.4,.65,1.3],suiteCloth);
    box(scene,"royal-suite-sofa-back",[side*4.8,10.0,suiteZ+6.55],[3.4,1.2,.24],suiteCloth);
  }
  // Writing table, stools, a fireplace and a long runner make this a furnished chamber.
  box(scene,"royal-suite-writing-table",[0,9.7,suiteZ+4.2],[4.4,.22,1.8],mats.wood);
  for(const side of [-1,1]) {
    for(const dz of [-1,1]) box(scene,"royal-suite-table-leg",[side*1.9,9.0,suiteZ+4.2+dz*.65],[.16,1.25,.16],mats.wood);
    box(scene,"royal-suite-stool",[side*2.8,9.15,suiteZ+4.2],[.8,.3,.8],mats.wood);
  }
  box(scene,"royal-suite-hearth-surround",[0,12.2,suiteZ-9.25],[4.4,4.6,.8],castleGold);
  box(scene,"royal-suite-hearth-opening",[0,11.0,suiteZ-8.8],[2.5,2.2,.08],castleShadow);
  const suiteFire=MeshBuilder.CreateSphere("royal-suite-fire",{diameter:1.1,segments:12},scene);
  suiteFire.position.set(0,11.0,suiteZ-8.65);suiteFire.scaling.set(1,.8,.18);suiteFire.material=mats.lantern;
  box(scene,"royal-suite-carpet",[0,8.79,suiteZ+1.0],[4.2,.05,13],mats.banner);

  // Tall arched windows, inset dark glass, stone frames and carved horizontal courses.
  for(let floor=0;floor<3;floor++) for(let col=-2;col<=2;col++) {
    const x=col*3.45,y=20+floor*8.2;
    box(scene,"keep-window-recess",[x,y,-74.35],[1.45,3.0,.12],castleShadow);
    box(scene,"keep-window-glass",[x,y,-74.27],[.82,2.15,.08],mats.glass);
    box(scene,"keep-window-mullion",[x,y,-74.18],[.10,2.2,.08],castleGold);
    box(scene,"keep-window-sill",[x,y-1.58,-74.18],[1.8,.22,.32],mats.trim);
    const arch=MeshBuilder.CreateTorus("keep-window-arch",{diameter:1.1,thickness:.16,tessellation:16},scene);
    arch.scaling.y=1.1;arch.position.set(x,y+1.05,-74.17);arch.material=mats.trim;
  }
  for(let y of [15.2,23.2,31.2,39.1]) box(scene,"keep-stone-stringcourse",[0,y,-74.25],[21.6,.28,.42],castleGold);
  // Flanking towers: stepped bases, ring courses, machicolations and conical slate roofs.
  for(let i=0;i<7;i++) {
    const x=-23+i*7.5, height=19+(i%3)*3.5, baseY=12+height/2;
    const tower=MeshBuilder.CreateCylinder("castle-tower",{diameter:6.2,height,tessellation:24},scene);
    tower.position.set(x,baseY,-77);tower.material=castleStone;
    for(let ringY of [baseY-height*.36,baseY,baseY+height*.37]) {
      const ring=MeshBuilder.CreateTorus("castle-tower-course",{diameter:6.3,thickness:.22,tessellation:24},scene);
      ring.position.set(x,ringY,-77);ring.material=castleGold;
    }
    cylinder(scene,"castle-tower-foot",[x,12.5,-77],7.1,.9,mats.trim,16);
    const roof=MeshBuilder.CreateCylinder("castle-spire",{diameterTop:0,diameterBottom:7.2,height:8,tessellation:16},scene);
    roof.position.set(x,baseY+height/2+4,-77);roof.material=castleRoof;
    for(let j=0;j<4;j++) {
      const slit=box(scene,"castle-tower-arrow-slit",[x-1.15+j*.75,baseY+1,-73.82],[.16,1.8,.08],castleShadow);
    }
    const finial=cylinder(scene,"castle-roof-finial",[x,baseY+height/2+8.35,-77],.18,.8,castleGold,8);
  }
  // A monumental gate arch with recessed portcullis, voussoirs and a carved royal crest.
  // The royal gate is permanently open: deep arch, carved voussoirs and two leaves folded back.
  box(scene,"gate-shadow",[0,14,-74.9],[8.4,11,.2],castleShadow);
  for(let side of [-1,1]) {
    const openLeaf=box(scene,"royal-gate-open-leaf",[side*4.15,13.5,-74.42],[.34,8.2,1.0],mats.wood);
    openLeaf.rotation.y=side*.18;
    for(let y=10;y<=17.1;y+=1.15) {
      const hinge=box(scene,"royal-gate-gold-strapping",[side*4.15,y,-73.88],[.42,.12,.10],castleGold);
      hinge.rotation.y=side*.18;
    }
    for(let y=9.2;y<=18.4;y+=1.0) {
      const stone=box(scene,"gate-arch-inner-voussoir",[side*(4.05+(18.4-y)*.10),y,-74.72],[.82,.88,.65],mats.trim);
      stone.rotation.z=side*.08;
    }
  }
  for(let side of [-1,1]) {
    box(scene,"gate-pier",[side*5,16,-74.7],[1.8,15,2.2],castleStone);
    for(let row=0;row<9;row++) {
      const block=box(scene,"gate-arch-stone",[side*(4.1+row*.48),21.2-row*.72,-74.5],[1.0,.82,1.0],mats.trim);
      block.rotation.z=side*.08;
    }
    addBanner(scene,side*8,18,-73.8,castleGold,mats.banner,side);
  }
  const royalGateCrest=MeshBuilder.CreateCylinder("royal-crest-medallion",{diameter:2.2,height:.22,tessellation:12},scene);
  royalGateCrest.position.set(0,23.3,-74.6);royalGateCrest.rotation.x=Math.PI/2;royalGateCrest.material=castleGold;
  // Fine-grained royal architecture: corner quoins, balconies, reliefs and lit windows.
  for(let floor=0;floor<4;floor++) {
    const y=14+floor*7.7;
    for(let side of [-1,1]) {
      for(let row=0;row<9;row++) {
        const block=box(scene,"citadel-corner-quoin",[side*(26.65),y+row*.78,-75.05],[.62,.68,.5],mats.trim);
        block.rotation.y=side*.08;
      }
      const balcony=box(scene,"keep-window-balcony",[side*6.9,34.5,-73.9],[2.7,.22,.9],castleGold);
      box(scene,"keep-balcony-front",[side*6.9,35.05,-73.48],[2.7,.72,.12],castleStone);
      for(let k=-2;k<=2;k++) box(scene,"keep-baluster",[side*6.9+k*.52,35.0,-73.48],[.10,.58,.10],castleGold);
    }
  }
  // A long, walkable royal stair climbs from the city approach to the elevated gate.
  // Each visible tread is a real individual stone step; player height follows the stair profile.
  const stairStartZ=-57, stairEndZ=-82, stairRise=8.25, stairCount=40;
  for(let step=0;step<stairCount;step++) {
    const rise=stairRise/stairCount, tread= (stairStartZ-stairEndZ)/stairCount;
    const top=(step+1)*rise, z=stairStartZ-(step+.5)*tread;
    const treadMesh=box(scene,"castle-approach-step",[0,top-rise/2,z],[15.8,rise,tread+.08],castleStone);
    treadMesh.receiveShadows=true;
    box(scene,"castle-step-nosing",[0,top-.045,z+tread*.43],[15.95,.09,.12],mats.trim);
    for(let side of [-1,1]) {
      const baluster=box(scene,"castle-stair-side-parapet",[side*8.15,top/2,z],[.48,Math.max(.5,top),tread+.08],castleStone);
      baluster.receiveShadows=true;
    }
  }
  // Broad upper landing, paired urns and a ceremonial carpet lead to the open gate.
  box(scene,"royal-gate-landing",[0,8.34,-73.0],[18,.36,3.2],mats.trim);
  box(scene,"royal-gate-carpet",[0,8.54,-72.95],[5.6,.035,2.8],mats.banner);
  for(let side of [-1,1]) {
    cylinder(scene,"royal-stair-urn-foot",[side*7.2,8.7,-72.8],1.0,.35,castleGold,16);
    const urn=MeshBuilder.CreateCylinder("royal-stair-urn",{diameterTop:.45,diameterBottom:.85,height:1.2,tessellation:12},scene);
    urn.position.set(side*7.2,9.45,-72.8);urn.material=mats.trim;
  }
  for(let side of [-1,1]) {
    for(let level=0;level<4;level++) {
      const y=13+level*3.1;
      box(scene,"gatehouse-side-stringcourse",[side*11,y,-74.15],[6.0,.22,.42],castleGold);
    }
    for(let k=0;k<5;k++) {
      const slit=box(scene,"gatehouse-tower-window",[side*11,9+k*2.65,-40.18],[.48,1.35,.08],castleShadow);
      const sill=box(scene,"gatehouse-window-sill",[side*11,8.3+k*2.65,-40.12],[.95,.16,.28],mats.trim);
    }
    const balcony=box(scene,"gatehouse-tower-balcony",[side*11,18,-40.0],[5.2,.28,1.1],castleGold);
    for(let k=-3;k<=3;k++) box(scene,"gatehouse-baluster",[side*11+k*.68,18.55,-39.48],[.12,.72,.12],castleStone);
  }
  // Gold roof ridges and small finials catch the late-afternoon light.
  for(let x=-8;x<=8;x+=2) {
    const finial=cylinder(scene,"keep-roof-gold-finial",[x,52.2,-82],.12,.7,castleGold,8);
  }
  for(let side of [-1,1]) {
    const rose=MeshBuilder.CreateCylinder("royal-wall-relief",{diameter:2.0,height:.16,tessellation:12},scene);
    rose.position.set(side*17,18,-74.85);rose.rotation.x=Math.PI/2;rose.material=castleGold;
  }
  // Corner turrets and rooftop details break up the large keep silhouette.
  for(let side of [-1,1]) {
    const turret=cylinder(scene,"keep-corner-turret",[side*8.2,44,-82],3.1,11,castleStone,20);
    const cap=MeshBuilder.CreateCylinder("keep-corner-roof",{diameterTop:0,diameterBottom:4.0,height:5.5,tessellation:12},scene);
    cap.position.set(side*8.2,52.1,-82);cap.material=castleRoof;
    for(let j=0;j<4;j++) {
      const slit=box(scene,"keep-turret-window",[side*8.2,43,-80.35+j*.0],[.42,1.6,.08],castleShadow);
    }
  }
  const waterfall=MeshBuilder.CreatePlane("distant-waterfall",{width:7,height:15},scene);
  waterfall.position.set(27,7,-68);waterfall.material=new StandardMaterial("waterfall-material",scene);
  waterfall.material.diffuseColor=new Color3(.45,.75,.82);waterfall.material.alpha=.72;waterfall.material.emissiveColor=new Color3(.12,.2,.22);

  // Set the keep behind the curtain wall, creating a genuine arrival courtyard.
  for(const mesh of scene.meshes) {
    if(/^(royal-keep|royal-hall|royal-throne|keep-|castle-tower|castle-spire|castle-roof|castle-tower-foot)/.test(mesh.name)) mesh.position.z-=12;
  }
  // Formal garden courtyard between the open gate and the palace entrance.
  box(scene,"citadel-courtyard-paving",[0,8.48,-81.4],[17.5,.18,8.8],pavingLight);
  box(scene,"citadel-courtyard-runner",[0,8.60,-81.5],[4.8,.035,8.2],mats.banner);
  for(let side of [-1,1]) {
    box(scene,"citadel-courtyard-flowerbed",[side*6.15,8.82,-81.4],[2.2,.5,5.6],mats.trim);
    box(scene,"citadel-courtyard-soil",[side*6.15,9.09,-81.4],[1.85,.08,5.2],mats.floor);
    for(let j=0;j<9;j++) {
      const flower=MeshBuilder.CreateSphere("citadel-courtyard-rose",{diameter:.48,segments:10},scene);
      flower.position.set(side*6.15+(Math.random()-.5)*1.5,9.48,-83.7+j*.58);
      flower.scaling.y=1.25;flower.material=j%3===0?mats.gold:mats.flowers;
    }
    for(let j=0;j<3;j++) {
      cylinder(scene,"courtyard-arcade-pillar",[side*8.2,11.1,-79.4+j*2.8],.62,5.2,mats.trim,16);
      cylinder(scene,"courtyard-pillar-cap",[side*8.2,13.75,-79.4+j*2.8],1.0,.28,castleGold,16);
    }
    const crest=MeshBuilder.CreateCylinder("courtyard-royal-crest",{diameter:1.25,height:.16,tessellation:12},scene);
    crest.position.set(side*5.9,12.2,-77.25);crest.rotation.x=Math.PI/2;crest.material=castleGold;
    addLantern(scene,side*7.0,11.2,-77.15,mats.gold,mats.lantern);
  }

  // The royal citadel sits farther back beyond the city approach.
  for(const mesh of scene.meshes) {
    if(mesh.name.startsWith("citadel-") || mesh.name.startsWith("castle-cliff") ||
       mesh.name.startsWith("castle-approach-") || mesh.name.startsWith("castle-step-") ||
       mesh.name.startsWith("royal-gate-") || mesh.name.startsWith("gate-shadow") ||
       mesh.name.startsWith("gate-pier") || mesh.name.startsWith("gate-arch-") ||
       mesh.name.startsWith("gatehouse-side-") || mesh.name.startsWith("gatehouse-tower-") ||
       mesh.name.startsWith("gatehouse-window-") || mesh.name.startsWith("gatehouse-balcony") ||
       mesh.name.startsWith("gatehouse-baluster") || mesh.name.startsWith("royal-wall-") ||
       mesh.name.startsWith("royal-keep") || mesh.name.startsWith("royal-hall") ||
       mesh.name.startsWith("royal-throne") || mesh.name.startsWith("keep-") ||
       mesh.name.startsWith("castle-tower") || mesh.name.startsWith("castle-spire") ||
       mesh.name.startsWith("castle-roof") || mesh.name.startsWith("castle-stair-") ||
       mesh.name.startsWith("royal-stair-") || mesh.name.startsWith("courtyard-") ||
       mesh.name.startsWith("citadel-courtyard-")) mesh.position.z-=10;
  }

  // Yggdrasil is deliberately far to the LEFT of the palace skyline (world +X from this camera).
  // It now floats on a vast suspended island, rather than growing out of the castle grounds.
  // The extra depth keeps its silhouette clear of the keep even on a narrow phone screen.
  const treeX=34,treeZ=-165,treeLift=18;
  const islandStone=mat(scene,"world-tree-floating-stone",new Color3(.28,.31,.29),.98);
  const islandFace=mat(scene,"world-tree-floating-stone-face",new Color3(.39,.40,.34),.96);
  const islandMoss=mat(scene,"world-tree-island-moss",new Color3(.15,.27,.16),.98);
  const island=MeshBuilder.CreateCylinder("world-tree-floating-island",{diameterTop:49,diameterBottom:31,height:13,tessellation:16},scene);
  island.position.set(treeX,11.5,treeZ);island.material=islandStone;
  const islandTop=MeshBuilder.CreateCylinder("world-tree-island-grass-cap",{diameter:46,height:.65,tessellation:32},scene);
  islandTop.position.set(treeX,18.05,treeZ);islandTop.material=islandMoss;
  for(let i=0;i<18;i++) {
    const a=i*Math.PI*2/18,r=16+Math.random()*5;
    const rock=MeshBuilder.CreateSphere("world-tree-island-rock",{diameter:5+Math.random()*5,segments:10},scene);
    rock.position.set(treeX+Math.cos(a)*r,8+Math.random()*7,treeZ+Math.sin(a)*r*.72);
    rock.scaling.set(1.2,.9,1.0);rock.material=i%3===0?islandFace:islandStone;
  }
  const underGlow=mat(scene,"world-tree-island-underside-glow",new Color3(.44,.70,.55),.3,.12);
  underGlow.emissiveColor=new Color3(.16,.34,.22);
  const islandHalo=MeshBuilder.CreateTorus("world-tree-floating-island-halo",{diameter:42,thickness:.24,tessellation:96},scene);
  islandHalo.position.set(treeX,17.7,treeZ);islandHalo.material=underGlow;
  const bark=mat(scene,"world-tree-bark",new Color3(.18,.115,.065),.96);
  const barkLight=mat(scene,"world-tree-bark-ridge",new Color3(.39,.27,.14),.9);
  cylinder(scene,"world-tree-trunk",[treeX,treeLift+24,treeZ],8.2,48,bark,32);
  for(let i=0;i<16;i++) {
    const a=i*Math.PI*2/16;
    const root=MeshBuilder.CreateCylinder("world-tree-buttress-root",{diameterTop:.35,diameterBottom:2.0,height:12,tessellation:12},scene);
    root.position.set(treeX+Math.cos(a)*4.8,treeLift+1.0,treeZ+Math.sin(a)*4.8);
    root.rotation.z=Math.cos(a)*.5;root.rotation.x=Math.sin(a)*.5;
    root.material=i%3===0?barkLight:bark;
  }
  for(let i=0;i<22;i++) {
    const a=i*Math.PI*2/22,level=treeLift+25+(i%7)*4.2;
    const branch=MeshBuilder.CreateCylinder("world-tree-branch",{diameterTop:.24,diameterBottom:1.25,height:17+(i%4)*2.5,tessellation:14},scene);
    branch.position.set(treeX+Math.cos(a)*8,level,treeZ+Math.sin(a)*6);
    branch.rotation.z=-Math.cos(a)*.86;branch.rotation.x=Math.sin(a)*.74;
    branch.material=i%4===0?barkLight:bark;
  }
  for(let i=0;i<12;i++) {
    const rib=MeshBuilder.CreateCylinder("world-tree-bark-rib",{diameterTop:.12,diameterBottom:.26,height:39,tessellation:8},scene);
    const a=i*Math.PI*2/12;
    rib.position.set(treeX+Math.cos(a)*3.65,treeLift+24,treeZ+Math.sin(a)*3.65);
    rib.rotation.z=Math.cos(a)*.035;rib.rotation.x=Math.sin(a)*.035;
    rib.material=barkLight;
  }
  const canopyMats=[
    mat(scene,"canopy-deep",new Color3(.035,.16,.095),.9),
    mat(scene,"canopy-mid",new Color3(.075,.28,.15),.84),
    mat(scene,"canopy-light",new Color3(.18,.39,.19),.8),
    mat(scene,"canopy-sunlit",new Color3(.52,.52,.27),.72)
  ];
  const canopy=[];
  for(let i=0;i<190;i++) {
    const a=Math.random()*Math.PI*2,ring=7+Math.random()*19,y=treeLift+38+Math.random()*33;
    const leaf=MeshBuilder.CreateSphere("world-tree-foliage",{diameter:3.5+Math.random()*4.2,segments:14},scene);
    leaf.position.set(treeX+Math.cos(a)*ring,y,treeZ+Math.sin(a)*ring*.62);
    leaf.scaling.set(.95+Math.random()*.5,.78+Math.random()*.5,.9+Math.random()*.45);
    leaf.material=canopyMats[i%canopyMats.length];
    canopy.push({mesh:leaf,phase:Math.random()*Math.PI*2,base:leaf.rotation.z,baseY:y});
  }
  const seedGlow=mat(scene,"world-tree-seedlight",new Color3(.84,.76,.43),.24,.04);
  seedGlow.emissiveColor=new Color3(.42,.31,.10);
  for(let i=0;i<46;i++) {
    const a=Math.random()*Math.PI*2,ring=8+Math.random()*19;
    const seed=MeshBuilder.CreateSphere("world-tree-luminous-seed",{diameter:.18+Math.random()*.24,segments:10},scene);
    seed.position.set(treeX+Math.cos(a)*ring,treeLift+39+Math.random()*34,treeZ+Math.sin(a)*ring*.62);
    seed.material=seedGlow;
  }
  for(const y of [treeLift+31,treeLift+47,treeLift+64]) {
    const halo=MeshBuilder.CreateTorus("world-tree-sacred-halo",{diameter:y===treeLift+31?25:39,thickness:.13,tessellation:96},scene);
    halo.position.set(treeX,y,treeZ);halo.material=seedGlow;
  }
  const rootRing=MeshBuilder.CreateTorus("world-tree-root-rune",{diameter:25,thickness:.13,tessellation:96},scene);
  rootRing.position.set(treeX,treeLift+.1,treeZ);rootRing.material=seedGlow;
  // Hanging roots and slender streams of sacred light make the island feel suspended.
  for(let i=0;i<12;i++) {
    const a=i*Math.PI*2/12;
    const root=MeshBuilder.CreateCylinder("world-tree-hanging-root",{diameterTop:.18,diameterBottom:.8,height:9,tessellation:8},scene);
    root.position.set(treeX+Math.cos(a)*8,6.0,treeZ+Math.sin(a)*7);
    root.rotation.z=Math.cos(a)*.28;root.rotation.x=Math.sin(a)*.28;root.material=bark;
  }
  for(let i=0;i<4;i++) {
    const beam=MeshBuilder.CreateCylinder("world-tree-sacred-lightfall",{diameter:.10,height:10+ i*2,tessellation:8},scene);
    beam.position.set(treeX+Math.cos(i*Math.PI/2)*17,1.5,treeZ+Math.sin(i*Math.PI/2)*14);
    beam.material=underGlow;
  }

  // Detailed CC0 models add leaf geometry and a merchant wagon.
  const modelJobs = [
    addCC0Model(scene,"Prop_Vine1",[-26.6,2.1,11.24],[1.35,1.35,1.35],0),
    addCC0Model(scene,"Prop_Vine1",[-15.4,2.0,11.24],[1.15,1.25,1.15],0),
    addCC0Model(scene,"Prop_Vine2",[-13.9,2.3,-11.1],[1.2,1.2,1.2],0),
    addCC0Model(scene,"Prop_Vine4",[-28.2,2.0,11.2],[1.0,1.1,1.0],0),
    addCC0Model(scene,"Prop_Vine5",[-13.9,2.0,-20.5],[1.0,1.0,1.0],0),
    addCC0Model(scene,"Roof_Dormer_RoundTile",[-24.5,9.4,6.2],[1.15,1.15,1.15],0),
    addCC0Model(scene,"Roof_Dormer_RoundTile",[-18.0,9.4,6.2],[1.15,1.15,1.15],0),
    addCC0Model(scene,"Prop_Crate",[13.4,0.02,-7.4],[.85,.85,.85],.2),
    addCC0Model(scene,"Prop_Crate",[17.6,0.02,-14.2],[.85,.85,.85],-.15),
    addCC0Model(scene,"Prop_Crate",[26.8,0.02,-11.0],[.85,.85,.85],.3),
    addCC0Model(scene,"Prop_Wagon",[32.2,0.02,-18.0],[1.25,1.25,1.25],Math.PI*.5),
  ];
  await Promise.all(modelJobs);
  addObstacle(32.2,-18.0,1.8);
  addObstacle(13.4,-7.4,.72);
  addObstacle(17.6,-14.2,.72);
  addObstacle(26.8,-11.0,.72);

  // Old trees, clipped hedges and flower planters around the outer square.
  for(const [x,z,s] of [[-37,20,1.8],[36,19,1.6],[-39,-20,1.5],[38,-28,1.7],[-8,27,1.1],[29,28,1.3]]) {
    addObstacle(x,z,1.0*s);
    cylinder(scene,"plaza-tree-trunk",[x,2.4*s,z],.75*s,4.8*s,mats.trunk,12);
    for(let j=0;j<5;j++) {
      const crown=MeshBuilder.CreateSphere("plaza-tree-crown",{diameter:4.6*s,segments:10},scene);
      crown.position.set(x+(Math.random()-.5)*2*s,4.2*s+Math.random()*1.8*s,z+(Math.random()-.5)*2*s);
      crown.material=mats.leaves;
    }
  }
  addPlanter(scene,8,15,mats.trim,mats.green,mats.flowers);
  addPlanter(scene,25,13,mats.trim,mats.green,mats.flowers);
  addObstacle(8,15,1.15);addObstacle(25,13,1.15);

  // Ambient decorative street lamps and benches.
  for(const [x,z] of [[-7,20],[7,20],[-8,-27],[8,-27],[30,2],[-32,-2]]) {
    addObstacle(x,z,.5);
    cylinder(scene,"street-lamp-post",[x,2.1,z],.16,4.2,mats.wood,12);
    box(scene,"street-lamp-top",[x,4.2,z],[.9,.18,.9],mats.gold);
    const glow=MeshBuilder.CreateSphere("street-lamp-glow",{diameter:.38,segments:10},scene);
    glow.position.set(x,3.8,z);glow.material=mats.lantern;
  }

  // Full-height townspeople are assembled locally so their proportions never depend
  // on third-party model downloads. Head height is kept close to one-seventh of stature.
  const people=[];
  const npcSkin=mat(scene,"npc-natural-skin",new Color3(.72,.51,.38),.94);
  const npcSkinLight=mat(scene,"npc-fair-skin",new Color3(.88,.69,.54),.94);
  const npcHair=[new Color3(.10,.055,.035),new Color3(.28,.12,.055),new Color3(.58,.36,.12),new Color3(.16,.13,.10)].map((color,i)=>mat(scene,"npc-hair-"+i,color,.9));
  const npcCloth=[
    new Color3(.16,.25,.34),new Color3(.43,.16,.12),new Color3(.22,.31,.20),
    new Color3(.48,.35,.20),new Color3(.34,.22,.34),new Color3(.65,.57,.40)
  ].map((color,i)=>mat(scene,"npc-cloth-"+i,color,.96));
  const npcLeather=mat(scene,"npc-leather",new Color3(.19,.105,.055),.94);
  const npcMetal=mat(scene,"npc-metal",new Color3(.48,.43,.32),.58,.45);
  const npcGold=mat(scene,"npc-gold",new Color3(.68,.48,.19),.45,.55);
  const npcWhite=mat(scene,"npc-eye-white",new Color3(.88,.83,.72),.8);
  const npcDark=mat(scene,"npc-eye-dark",new Color3(.075,.045,.03),.8);
  const npcBeard=mat(scene,"npc-beard",new Color3(.20,.095,.045),.96);

  function makeTownsperson(x,z,role="villager",phase=0,heading=0,walking=false) {
    const root=new TransformNode("townsperson-root",scene);
    const baseY=role==="guard"&&z<-70?7.63:0;
    root.position.set(x,baseY,z);root.rotation.y=heading;
    const outfit=role==="guard"?npcCloth[0]:role==="merchant"?npcCloth[3]:npcCloth[Math.abs(Math.floor(phase*3))%npcCloth.length];
    const skin=phase%2?npcSkin:npcSkinLight;
    const hair=npcHair[Math.abs(Math.floor(phase*5))%npcHair.length];
    const part=(name,pos,size,material,kind="box")=>{
      let mesh;
      if(kind==="sphere") mesh=MeshBuilder.CreateSphere(name,{diameter:1,segments:14},scene);
      else if(kind==="cylinder") mesh=MeshBuilder.CreateCylinder(name,{diameter:1,height:1,tessellation:12},scene);
      else mesh=MeshBuilder.CreateBox(name,{size:1},scene);
      mesh.position.set(pos[0],pos[1],pos[2]);mesh.scaling.set(size[0],size[1],size[2]);
      mesh.material=material;mesh.parent=root;mesh.isPickable=false;return mesh;
    };
    // Boots, legs and hips: long lower body, not a compressed toy silhouette.
    for(const side of [-1,1]) {
      part("npc-boot",[side*.115,.105,.035],[.22,.20,.37],npcLeather);
      part("npc-trouser",[side*.115,.49,0],[.205,.69,.23],npcLeather,"sphere");
      part("npc-knee",[side*.115,.69,0],[.205,.22,.23],outfit,"sphere");
      part("npc-sleeve",[side*.34,1.23,0],[.19,.52,.20],outfit,"sphere");
      part("npc-hand",[side*.35,.91,.015],[.13,.16,.13],skin,"sphere");
      if(role==="guard") {
        part("npc-shoulder-plate",[side*.34,1.48,0],[.29,.18,.28],npcMetal,"sphere");
        part("npc-bracer",[side*.35,1.03,0],[.22,.22,.22],npcMetal);
      }
    }
    part("npc-hips",[0,.86,0],[.43,.25,.28],npcLeather,"sphere");
    part("npc-tunic",[0,1.23,0],[.58,.70,.34],outfit,"sphere");
    part("npc-tunic-hem",[0,.91,0],[.59,.12,.35],outfit);
    part("npc-belt",[0,1.00,-.012],[.56,.085,.37],npcLeather);
    part("npc-belt-buckle",[0,1.01,-.205],[.09,.10,.035],npcGold);
    part("npc-neck",[0,1.61,0],[.14,.16,.14],skin,"cylinder");
    // Compact head with distinct hairline, ears, eyes and nose.
    part("npc-head",[0,1.78,0],[.34,.39,.31],skin,"sphere");
    part("npc-ear-left",[-.175,1.78,0],[.075,.12,.09],skin,"sphere");
    part("npc-ear-right",[.175,1.78,0],[.075,.12,.09],skin,"sphere");
    part("npc-hair-cap",[0,1.94,.005],[.365,.19,.34],hair,"sphere");
    part("npc-hair-back",[0,1.80,.105],[.32,.28,.18],hair,"sphere");
    for(const side of [-1,1]) {
      part("npc-eye",[side*.075,1.80,-.148],[.045,.035,.025],npcWhite,"sphere");
      part("npc-pupil",[side*.075,1.80,-.168],[.019,.025,.012],npcDark,"sphere");
    }
    part("npc-nose",[0,1.755,-.17],[.055,.075,.055],skin,"sphere");
    if(role==="guard") {
      part("npc-helmet-rim",[0,2.00,0],[.39,.075,.36],npcMetal);
      part("npc-helmet-crown",[0,2.09,.015],[.29,.15,.28],npcMetal,"sphere");
      part("npc-chest-armor",[0,1.28,-.18],[.49,.48,.075],npcMetal);
      part("npc-armor-crest",[0,1.30,-.226],[.13,.20,.025],npcGold);
      part("npc-cloak",[0,1.28,.19],[.48,.67,.055],npcCloth[4]);
    } else if(role==="merchant") {
      part("npc-apron",[0,1.17,-.19],[.43,.53,.045],npcCloth[5]);
      part("npc-hat-brim",[0,2.00,0],[.43,.07,.40],npcCloth[3]);
      part("npc-hat-top",[0,2.10,0],[.27,.18,.25],npcCloth[3],"sphere");
    } else {
      part("npc-cloak",[0,1.25,.19],[.49,.65,.06],npcCloth[(Math.floor(phase*7)+2)%npcCloth.length]);
    }
    if(phase%3===0) part("npc-beard",[0,1.66,-.12],[.20,.17,.12],npcBeard,"sphere");
    if(walking) {
      const actor={root,walking:true,phase,home:new Vector3(x,0,z),radius:1.25+(phase%3)*.35};
      people.push(actor);return actor;
    }
    return root;
  }

  // A varied crowd around the square, market, guild and tavern.
  makeTownsperson(-5,24,"villager",1.2,.4,true);
  makeTownsperson(3,25,"villager",2.1,-.6,true);
  makeTownsperson(31,4,"guard",3.3,1.2,true);
  makeTownsperson(29,22,"merchant",4.4,Math.PI,false);
  makeTownsperson(4,-17,"villager",5.6,Math.PI/2,false);
  makeTownsperson(29,-20,"villager",6.8,-1.1,true);
  makeTownsperson(-34,1,"villager",8.0,.8,true);
  makeTownsperson(-2,-29,"merchant",9.2,Math.PI,false);
  makeTownsperson(35,12,"guard",10.4,2.2,true);
  makeTownsperson(6,31,"villager",11.6,-.3,true);
  makeTownsperson(-18.8,0,"villager",12.7,0,false);
  makeTownsperson(-23,0,"merchant",13.8,0,false);
  makeTownsperson(-5.1,-80.4,"guard",14.9,0,false);
  makeTownsperson(5.1,-80.4,"guard",16.0,0,false);
  // Extra residents make the fountain square feel like a lived-in town.
  makeTownsperson(17,17,"merchant",17.1,Math.PI/2,false);
  makeTownsperson(21,-4,"villager",18.2,-.7,true);
  makeTownsperson(-9,-12,"villager",19.3,.5,true);
  makeTownsperson(2,8,"villager",20.4,Math.PI,false);

  // A properly rigged and animated palomino stands beside the merchant's timber cart.
  let horseRoot=null;
  try {
    const horse=await SceneLoader.ImportMeshAsync("","https://files.innerscene.com/library/standing-horse-01d8563f/0107d59ef4ff275f0158/","horse-original.glb",scene);
    horseRoot=horse.meshes.find(m=>m.name==="__root__")||horse.meshes[0];
    if(horseRoot) {
      // Harness the sole horse directly in front of the sole merchant wagon.
      horseRoot.position.set(32.2,0,-24.6);horseRoot.rotation.y=0;
      horseRoot.computeWorldMatrix(true);
      let bounds=horseRoot.getHierarchyBoundingVectors(true);
      const height=Math.max(.01,bounds.max.y-bounds.min.y);
      const horseScale=0.95;
      horseRoot.scaling.scaleInPlace(horseScale);
      horseRoot.computeWorldMatrix(true);
      bounds=horseRoot.getHierarchyBoundingVectors(true);
      horseRoot.position.y-=bounds.min.y;horseRoot.computeWorldMatrix(true);
      // Leather tack and a groomed mane give the mount a lived-in stable-yard silhouette.
      const tackRoot=new TransformNode("palomino-tack",scene);tackRoot.parent=horseRoot;tackRoot.scaling.setAll(1/horseScale);
      const leather=new StandardMaterial("horse-oiled-leather",scene);leather.diffuseColor=new Color3(.19,.075,.035);
      const brass=new StandardMaterial("horse-brass",scene);brass.diffuseColor=new Color3(.65,.43,.16);brass.metallic=.72;
      const mane=new StandardMaterial("horse-mane",scene);mane.diffuseColor=new Color3(.28,.15,.07);
      const saddle=MeshBuilder.CreateBox("horse-saddle",{width:.82,height:.16,depth:1.0},scene);
      saddle.parent=tackRoot;saddle.position.set(0,1.15,-.05);saddle.material=leather;
      const saddlePad=MeshBuilder.CreateBox("horse-saddle-cloth",{width:1.02,height:.08,depth:1.15},scene);
      saddlePad.parent=tackRoot;saddlePad.position.set(0,1.08,-.05);saddlePad.material=mats.banner;
      for(const side of [-1,1]) {
        const stirrup=MeshBuilder.CreateTorus("horse-stirrup",{diameter:.32,thickness:.055,tessellation:12},scene);
        stirrup.parent=tackRoot;stirrup.position.set(side*.52,.72,-.12);stirrup.rotation.x=Math.PI/2;stirrup.material=brass;
        const eye=MeshBuilder.CreateSphere("horse-eye",{diameter:.11,segments:12},scene);
        eye.parent=tackRoot;eye.position.set(side*.22,1.53,.78);eye.material=leather;
        const cheek=MeshBuilder.CreateTube("horse-bridle-cheek",{path:[new Vector3(side*.23,1.65,.48),new Vector3(side*.27,1.48,.73),new Vector3(side*.2,1.32,.88)],radius:.035,tessellation:8},scene);
        cheek.parent=tackRoot;cheek.material=leather;
      }
      const brow=MeshBuilder.CreateTube("horse-bridle-brow",{path:[new Vector3(-.23,1.67,.49),new Vector3(0,1.7,.55),new Vector3(.23,1.67,.49)],radius:.035},scene);
      brow.parent=tackRoot;brow.material=brass;
      const maneLine=MeshBuilder.CreateTube("horse-mane-line",{path:[new Vector3(0,1.68,.25),new Vector3(0,1.84,.48),new Vector3(0,1.78,.72),new Vector3(0,1.55,.93)],radius:.095,tessellation:8},scene);
      maneLine.parent=tackRoot;maneLine.material=mane;
      for(let i=0;i<5;i++) {
        const lock=MeshBuilder.CreateSphere("horse-mane-lock",{diameter:.22,segments:8},scene);
        lock.parent=tackRoot;lock.position.set((i%2?-.07:.07),1.78-i*.045,.3+i*.12);lock.scaling.set(.75,1.35,.8);lock.material=mane;
      }
      const reins=MeshBuilder.CreateTube("horse-reins",{path:[new Vector3(-.25,1.35,.82),new Vector3(-.42,1.15,.25),new Vector3(-.46,1.15,-.12)],radius:.022,tessellation:6},scene);
      reins.parent=tackRoot;reins.material=leather;
      const gait=horse.animationGroups.find(g=>g.name.toLowerCase()==="idle")
        ||horse.animationGroups.find(g=>g.name.toLowerCase().includes("idle"));
      if(gait) gait.start(true);
    }
  } catch(error) {
    console.warn("Animated horse model could not be loaded:",error);
  }
  addObstacle(32.2,-24.6,1.35);
  // Paired leather traces visibly connect the horse to the wagon shafts.
  const harnessLeather=new StandardMaterial("wagon-harness-leather",scene);
  harnessLeather.diffuseColor=new Color3(.20,.075,.035);
  for(const side of [-1,1]) {
    const shaft=MeshBuilder.CreateTube("wagon-horse-shaft",{
      path:[new Vector3(32.2+side*.62,.92,-22.2),new Vector3(32.2+side*.62,.86,-20.0),new Vector3(32.2+side*.62,.82,-18.5)],
      radius:.075,tessellation:8
    },scene);
    shaft.material=harnessLeather;
  }

    // Camera, collision and interaction.
  const camera=new UniversalCamera("first-person-explorer",new Vector3(0,1.72,27),scene);
  camera.minZ=.08;camera.fov=.92;camera.inputs.clear();camera.rotation.y=Math.PI;
  // A restrained cinematic pass: soft highlight bloom and edge smoothing.
  // Kept deliberately light so Safari on recent iPhones can sustain the frame rate.
  const cinematic=new DefaultRenderingPipeline("erinvale-cinematic",true,scene,[camera]);
  cinematic.samples=2;
  cinematic.fxaaEnabled=true;
  cinematic.bloomEnabled=true;
  cinematic.bloomThreshold=.88;
  cinematic.bloomWeight=.12;
  cinematic.bloomKernel=64;
  cinematic.imageProcessingEnabled=false;
  let yaw=0,pitch=0,moveSource=()=>Vector3.Zero();
  const velocity=new Vector3();
  const collides=(x,z)=>{
    if(Math.abs(x)>112||Math.abs(z)>116)return true;
    for(const c of colliders) {
      if(x>c.minX-.5&&x<c.maxX+.5&&z>c.minZ-.5&&z<c.maxZ+.5) {
        const insideRoom=c.interior&&x>c.minX+.55&&x<c.maxX-.55&&z>c.minZ+.55&&z<c.maxZ-.55;
        const gatePassage=c.passThrough&&Math.abs(x-c.doorX)<c.doorWidth/2;
        if(insideRoom||gatePassage)continue;
        const inDoor=Math.abs(x-c.doorX)<c.doorWidth/2 && z<c.doorZ+.7 && z>c.doorZ-1.5;
        if(!inDoor)return true;
      }
    }
    // Fountain basin, market counters, and castle cliff are solid.
    if(Math.hypot(x-13,z-5)<8.0)return true;
    for(const o of obstacles) if(Math.hypot(x-o.x,z-o.z)<o.r+.42)return true;
    // Keep the central stair corridor open; the cliff shoulders remain solid.
    if(z<-78 && Math.abs(x)>7.5 && Math.abs(x)<32)return true;
    return false;
  };
  const location=document.querySelector("#location-name");
  function getLocation(x,z) {
    if(x<-12&&z>0)return "銅鹿亭 — Copper Stag Tavern";
    if(x<-8&&z<-8&&z>-26)return "冒険者ギルド";
    if(x>10&&z<-5&&z>-29)return "王都の市場";
    if(x>34&&z>-3&&z<35)return "酒場通り — The Lantern Quarter";
    if(z<-72)return "王宮 — 王城の中庭";
    if(z<-45)return "王城への大通り";
    if(Math.hypot(x-13,z-5)<16)return "皇帝の噴水広場";
    return "王都エリンヴェイル";
  }
  function interact() {
    const x=camera.position.x,z=camera.position.z;
    let message="石畳の広場。遠くに王城と世界樹が見える。";
    if(Math.hypot(x+21,z-6)<13)message="銅鹿亭。旅人たちが集う酒場。扉を通って中も見てみよう。";
    else if(Math.hypot(x+21,z+16)<13)message="冒険者ギルド。掲示板には依頼書が並んでいる。";
    else if(Math.hypot(x-13,z-5)<16)message="石造りの大噴水広場。水音を聞きながら、街の人々がベンチで語らう憩いの場所。";
    else if(z<-45)message="王城へ続く大門。街の喧騒が遠のき、王宮の静けさが近づいてくる。";
    else if(x>34&&z>-3&&z<35)message="酒場通り。旅人や商人、冒険者たちが夜まで集う街の一角。";
    else if(x>10&&z<-5)message="市場の屋台。果物や旅の道具が並んでいる。";
    document.querySelector("#hint").textContent=message;
  }

  const shadowNames = /facade-|side-wall-|rear-wall|roof-|ridge|corner-post|oak-barrel|old-tree-trunk|plaza-tree-trunk|world-tree-|gatehouse-tower|castle-tower|street-lamp-post|market-post|emperor-statue/;
  for (const mesh of scene.meshes) {
    if (shadowNames.test(mesh.name)) shadow.addShadowCaster(mesh, false);
  }

  return {
    scene,
    setMovementSource(fn){moveSource=fn;},
    onMovement:null,
    turn(dx,dy){yaw+=dx;pitch=Scalar.Clamp(pitch+dy,-1.05,1.05);camera.rotation.y=Math.PI-yaw;camera.rotation.x=pitch;},
    interact,
    update(dt){
      const input=moveSource();
      const step=Math.min(dt,.045);
      const speed=4.4;
      const forward=camera.getDirection(new Vector3(0,0,1));
      forward.y=0;
      if(forward.lengthSquared()>0.0001) forward.normalize();
      const right=Vector3.Cross(forward,Vector3.Up()).normalize();
      // controls.js stores forward/back input on Vector3.z (not Vector3.y).
      // Reading input.y here silently discarded every forward/back command,
      // which is why only strafing worked.
      const forwardInput=input.z;
      const dx=(forward.x*forwardInput+right.x*input.x)*speed*step;
      const dz=(forward.z*forwardInput+right.z*input.x)*speed*step;
      const nx=camera.position.x+dx,nz=camera.position.z+dz;
      if(!collides(nx,camera.position.z))camera.position.x=nx;
      if(!collides(camera.position.x,nz))camera.position.z=nz;
      // Walk the player up the stepped approach instead of pinning the camera to flat ground.
      const onRoyalStair=Math.abs(camera.position.x)<7.1 && camera.position.z<=stairStartZ && camera.position.z>=stairEndZ;
      const stairProgress=onRoyalStair?(stairStartZ-camera.position.z)/(stairStartZ-stairEndZ):0;
      const stairFloor=onRoyalStair?Math.min(stairRise,Math.floor(stairProgress*stairCount)*stairRise/stairCount):0;
      const onLanding=Math.abs(camera.position.x)<8.6 && camera.position.z<stairEndZ && camera.position.z>-102;
      camera.position.y=1.72+(onRoyalStair?stairFloor:(onLanding?stairRise:0));
      camera.rotation.y=Math.PI-yaw;camera.rotation.x=pitch;
      location.textContent=getLocation(camera.position.x,camera.position.z);
      const moving=input.lengthSquared()>.025 && (Math.abs(camera.position.x-(camera._lastFootX??camera.position.x)) + Math.abs(camera.position.z-(camera._lastFootZ??camera.position.z))>.001);
      camera._lastFootX=camera.position.x;camera._lastFootZ=camera.position.z;
      if(this.onMovement)this.onMovement(moving,camera.position,getLocation(camera.position.x,camera.position.z));
      const time=performance.now()*.001;
      canopy.forEach(o=>{o.mesh.rotation.z=o.base+Math.sin(time*.35+o.phase)*.025;o.mesh.position.y=o.baseY+Math.sin(time*.35+o.phase)*.16;});
      // Subtle fountain ripples and falling droplets keep the water from feeling static.
      waterRing.scaling.x=1+Math.sin(time*1.2)*.025;
      basinInnerBand.scaling.x=1+Math.sin(time*.9)*.012;
      people.forEach(person=>{
        if(!person.walking)return;
        const t=time*.12+person.phase;
        person.root.position.x=person.home.x+Math.sin(t)*person.radius;
        person.root.position.z=person.home.z+Math.cos(t*.72)*person.radius*.55;
        person.root.rotation.y=Math.atan2(Math.cos(t)*person.radius*.72,Math.cos(t)*person.radius)+Math.PI/2;
      });
    }
  };
}
