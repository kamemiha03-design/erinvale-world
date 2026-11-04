import {
  UniversalCamera, Color3, Color4, DirectionalLight, HemisphericLight,
  MeshBuilder, PBRMaterial, Scene, ShadowGenerator, StandardMaterial, TransformNode,
  DynamicTexture, Texture, Vector3, Animation, Scalar, ImageProcessingConfiguration,
} from "@babylonjs/core";
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
  signFace.position.set(x+w*.28,h*.9-.65,front-.98);signFace.rotation.y=Math.PI;signFace.material=signMat;
  addLantern(scene,x-w*.34,3.9,front-.7,mats.gold,mats.lantern);
  addLantern(scene,x+w*.34,3.9,front-.7,mats.gold,mats.lantern);
  // Small upper-storey dormers and chimney silhouettes.
  cylinder(scene,name+"-chimney",[x-w*.32,h+1.75,z+d*.25],.62,2.1,mats.trim,8);
  for(let i=0;i<5;i++) box(scene,name+"-chimney-course",[x-w*.32,h+1.05+i*.35,z+d*.25],[.75,.08,.75],mats.dark);
  // Interior is deliberately furnished and open through the front doorway.
  if(interior) {
    box(scene,name+"-inside-floor",[x,.08,z],[w-.5,.12,d-.5],mats.floor);
    for(let i=0;i<3;i++) {
      box(scene,name+"-interior-table",[x-3+i*3,.95,z+1],[1.6,.18,1.2],mats.wood);
      for(const dx of [-.6,.6]) for(const dz of [-.4,.4])
        box(scene,name+"-table-leg",[x-3+i*3+dx,.48,z+1+dz],[.13,.8,.13],mats.wood);
    }
    box(scene,name+"-counter",[x+3,1.25,z+1.6],[2.8,1.5,.85],mats.woodLight);
    obstacles.push({x:x+3,z:z+1.6,r:1.55});
    for(let i=0;i<3;i++) obstacles.push({x:x-3+i*3,z:z+1,r:1.05});
    for(let i=0;i<4;i++) box(scene,name+"-shelf",[x+2.6+i*.18,3.2,z+d*.18],[.12,2.3,.55],mats.wood);
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
  const ground=MeshBuilder.CreateGround("plaza-ground",{width:240,height:240,subdivisions:2},scene);
  ground.position.y=-.12;ground.material=texturedMat(scene,"cobblestone",new Color3(.53,.50,.43),"#8c8475","#39362f");
  surfaceMaps(ground.material,"T_UnevenBrick_BaseColor.png","T_UnevenBrick_Normal.png",9,9);
  for(let z=-39;z<=33;z+=6) for(let x=-39;x<=39;x+=6) {
    const p=MeshBuilder.CreateBox("individual-cobble",{width:5.78,height:.055,depth:5.78},scene);
    p.position.set(x,-.055,z);p.material=(Math.floor((x+39)/6+z/6)%6===0)?mats.trim:ground.material;
  }

  const colliders=[];
  const obstacles=[];
  const addObstacle=(x,z,r)=>obstacles.push({x,z,r});
  addBuilding(scene,{x:-21,z:6,w:15,d:10,h:9,name:"The Copper Stag Tavern",sign:"THE COPPER STAG",interior:true},{...mats},shadow,colliders,obstacles);
  addBuilding(scene,{x:-21,z:-16,w:14,d:9,h:9.5,name:"Adventurers Guild",sign:"ADVENTURERS GUILD",interior:true},{...mats},shadow,colliders,obstacles);
  addBuilding(scene,{x:22,z:-18,w:15,d:10,h:8.5,name:"Royal Market Hall",sign:"MARKET HALL"},{...mats},shadow,colliders,obstacles);

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

  // Guild notice board and a cluster of posted parchment sheets.
  box(scene,"quest-board-frame",[-12,2.25,-10],[4.2,3.4,.35],mats.wood);
  addObstacle(-12,-10,1.35);
  box(scene,"quest-board-face",[-12,2.25,-10.22],[3.75,2.95,.06],mats.woodLight);
  for(let i=0;i<5;i++) {
    const paper=box(scene,"guild-notice",[-13.3+(i%3)*1.25,2.45+Math.floor(i/3)*.6,-10.28],[.8,1.05,.035],mats.trim);
    paper.rotation.z=(i%2?-.08:.05);
  }

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
  // Circular paving, benches and flower beds turn the fountain into a place to linger.
  for(let i=0;i<12;i++) {
    const a=i*Math.PI/6;
    const bench=box(scene,"plaza-curved-bench",[13+Math.cos(a)*11.2,.62,5+Math.sin(a)*11.2],[3.1,.24,.72],mats.woodLight);
    bench.rotation.y=-a;
    const back=box(scene,"plaza-bench-back",[13+Math.cos(a)*11.2,1.12,5+Math.sin(a)*11.2],[3.1,.82,.18],fountainStone);
    back.rotation.y=-a;
    const planter=box(scene,"plaza-stone-flower-trough",[13+Math.cos(a)*13.0,.42,5+Math.sin(a)*13.0],[2.2,.72,1.1],fountainStone);
    planter.rotation.y=-a;
    addObstacle(13+Math.cos(a)*11.2,5+Math.sin(a)*11.2,1.35);
    for(let j=0;j<3;j++) {
      const bloom=MeshBuilder.CreateSphere("plaza-flower",{diameter:.22,segments:8},scene);
      bloom.position.set(13+Math.cos(a)*13.0+(Math.random()-.5)*1.1,.95,5+Math.sin(a)*13.0+(Math.random()-.5)*.55);
      bloom.material=j%2?mats.flowers:mats.gold;
    }
  }
  const waterRing=lowerRipple;

  // Warm civic square details: radial stone paving, carved edging, lanterns and places to sit.
  const plazaGold=mat(scene,"plaza-warm-brass",new Color3(.62,.43,.19),.38,.62);
  const pavingLight=texturedMat(scene,"sun-warmed-paving",new Color3(.72,.67,.56),"#b7aa91","#6d6251",.94);
  const pavingDark=mat(scene,"paving-joint-shadow",new Color3(.32,.30,.26),.98);
  for(const radius of [17.2,19.0,22.5]) {
    const ring=MeshBuilder.CreateTorus("plaza-stone-inlay",{diameter:radius*2,thickness:.12,tessellation:96},scene);
    ring.position.set(13,.015,5);ring.material=radius===19?plazaGold:pavingLight;
  }
  // Radial flagstones make the square feel like a carefully laid public place, not an empty floor.
  for(let i=0;i<32;i++) {
    const a=i*Math.PI/16;
    const tile=box(scene,"radial-plaza-flagstone",[13+Math.cos(a)*20.6,.012,5+Math.sin(a)*20.6],[3.65,.045,1.42],i%4===0?pavingLight:mats.trim);
    tile.rotation.y=-a;
  }
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
  // Carved stone drinking trough and little flower urns along the approach.
  for(let side of [-1,1]) {
    const x=13+side*27;
    box(scene,"plaza-drinking-trough",[x,.58,5],[2.6,1.05,1.35],fountainStone);
    box(scene,"plaza-trough-water",[x,.98,5],[2.05,.08,.82],fountainWater);
    for(let j=0;j<3;j++) {
      const urn=cylinder(scene,"plaza-flower-urn",[x+side*(j-1)*2.0,.72,8],.8,1.25,fountainStone,12);
      const bloom=MeshBuilder.CreateSphere("plaza-urn-flowers",{diameter:1.1,segments:10},scene);
      bloom.position.set(x+side*(j-1)*2.0,1.45,8);bloom.material=j%2?mats.flowers:mats.green;
    }
  }

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
  addBuilding(scene,{x:0,z:-43,w:22,d:10,h:14,name:"Royal Gatehouse",sign:"THE CROWN GATE",passThrough:true},{...mats},shadow,colliders,obstacles);
  for(let side of [-1,1]) {
    const tower=cylinder(scene,"gatehouse-tower",[side*11,9,-43],5.4,18,mats.wall,16);
    const cap=MeshBuilder.CreateCylinder("gatehouse-turret-roof",{diameterTop:0,diameterBottom:6.4,height:4.8,tessellation:12},scene);
    cap.position.set(side*11,20.4,-43);cap.material=mats.roof;
    box(scene,"gate-banner-bracket",[side*11,14,-46],[.2,.2,1],mats.gold);
    addBanner(scene,side*11,17,-46,mats.gold,mats.banner,side);
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
  box(scene,"royal-keep-back-wall",[0,17.0,-89.35],[21,17,1.0],castleStone);
  box(scene,"royal-keep-upper",[0,40.2,-82],[16.8,7.5,12.2],mats.trim);
  // Palace hall floor, pale columns, crimson runner and a visible throne.
  box(scene,"royal-hall-floor",[0,8.62,-82],[15.2,.24,13.0],mats.trim);
  box(scene,"royal-hall-carpet",[0,8.78,-82],[4.2,.06,12.5],mats.banner);
  for(let side of [-1,1]) for(let z=-87;z<=-77;z+=3.3) {
    cylinder(scene,"royal-hall-column-base",[side*6.2,9.05,z],1.25,.48,castleGold,16);
    const col=cylinder(scene,"royal-hall-column",[side*6.2,14.0,z],.62,9.5,mats.trim,20);
    cylinder(scene,"royal-hall-column-capital",[side*6.2,18.9,z],1.15,.55,castleGold,16);
  }
  const throne=box(scene,"royal-throne-seat",[0,10.2,-87.6],[3.4,.55,2.0],castleGold);
  box(scene,"royal-throne-back",[0,12.1,-88.4],[3.3,4.0,.55],castleStone);
  for(let side of [-1,1]) {
    box(scene,"royal-throne-arm",[side*1.65,11.0,-87.7],[.42,1.4,1.8],castleGold);
    const finial=MeshBuilder.CreateSphere("royal-throne-finial",{diameter:.42,segments:12},scene);
    finial.position.set(side*1.65,14.2,-88.4);finial.material=castleGold;
  }
  // Tall jewel-toned stained-glass panels glow behind the throne.
  for(let i=0;i<5;i++) {
    const pane=box(scene,"royal-hall-stained-glass",[-4+i*2,16.2,-88.72],[1.1,4.8,.08],i%2?mats.banner:mats.glass);
    pane.material.emissiveColor=new Color3(.08,.12,.18);
  }
  box(scene,"royal-keep-roof-base",[0,44.3,-82],[18.5,.65,13.8],castleGold);
  const keepRoof=MeshBuilder.CreateCylinder("royal-keep-pitched-roof",{diameterTop:0,diameterBottom:18.5,height:8.5,tessellation:4},scene);
  keepRoof.position.set(0,48.6,-82);keepRoof.rotation.y=Math.PI/4;keepRoof.material=castleRoof;
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
  const crest=MeshBuilder.CreateCylinder("royal-crest-medallion",{diameter:2.2,height:.22,tessellation:12},scene);
  crest.position.set(0,23.3,-74.6);crest.rotation.x=Math.PI/2;crest.material=castleGold;
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
  const stairStartZ=-47, stairEndZ=-72, stairRise=8.25, stairCount=40;
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

  // Yggdrasil stands distinctly LEFT of the keep, framed against the open sky.
  // Its sacred silhouette is intentionally separated from every castle roof and tower.
  const treeX=57,treeZ=-101;
  const bark=mat(scene,"world-tree-bark",new Color3(.18,.115,.065),.96);
  const barkLight=mat(scene,"world-tree-bark-ridge",new Color3(.39,.27,.14),.9);
  cylinder(scene,"world-tree-trunk",[treeX,24,treeZ],7.2,48,bark,32);
  for(let i=0;i<16;i++) {
    const a=i*Math.PI*2/16;
    const root=MeshBuilder.CreateCylinder("world-tree-buttress-root",{diameterTop:.35,diameterBottom:2.0,height:12,tessellation:12},scene);
    root.position.set(treeX+Math.cos(a)*4.8,1.0,treeZ+Math.sin(a)*4.8);
    root.rotation.z=Math.cos(a)*.5;root.rotation.x=Math.sin(a)*.5;
    root.material=i%3===0?barkLight:bark;
  }
  for(let i=0;i<22;i++) {
    const a=i*Math.PI*2/22,level=25+(i%7)*4.2;
    const branch=MeshBuilder.CreateCylinder("world-tree-branch",{diameterTop:.24,diameterBottom:1.25,height:17+(i%4)*2.5,tessellation:14},scene);
    branch.position.set(treeX+Math.cos(a)*8,level,treeZ+Math.sin(a)*6);
    branch.rotation.z=-Math.cos(a)*.86;branch.rotation.x=Math.sin(a)*.74;
    branch.material=i%4===0?barkLight:bark;
  }
  for(let i=0;i<12;i++) {
    const rib=MeshBuilder.CreateCylinder("world-tree-bark-rib",{diameterTop:.12,diameterBottom:.26,height:39,tessellation:8},scene);
    const a=i*Math.PI*2/12;
    rib.position.set(treeX+Math.cos(a)*3.25,24,treeZ+Math.sin(a)*3.25);
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
  for(let i=0;i<156;i++) {
    const a=Math.random()*Math.PI*2,ring=7+Math.random()*16,y=38+Math.random()*31;
    const leaf=MeshBuilder.CreateSphere("world-tree-foliage",{diameter:3.2+Math.random()*3.2,segments:12},scene);
    leaf.position.set(treeX+Math.cos(a)*ring,y,treeZ+Math.sin(a)*ring*.58);
    leaf.scaling.set(.95+Math.random()*.5,.78+Math.random()*.5,.9+Math.random()*.45);
    leaf.material=canopyMats[i%canopyMats.length];
    canopy.push({mesh:leaf,phase:Math.random()*Math.PI*2,base:leaf.rotation.z,baseY:y});
  }
  const seedGlow=mat(scene,"world-tree-seedlight",new Color3(.84,.76,.43),.24,.04);
  seedGlow.emissiveColor=new Color3(.42,.31,.10);
  for(let i=0;i<34;i++) {
    const a=Math.random()*Math.PI*2,ring=8+Math.random()*17;
    const seed=MeshBuilder.CreateSphere("world-tree-luminous-seed",{diameter:.18+Math.random()*.24,segments:10},scene);
    seed.position.set(treeX+Math.cos(a)*ring,39+Math.random()*29,treeZ+Math.sin(a)*ring*.58);
    seed.material=seedGlow;
  }
  // Two quiet rings of ancient light suggest a sacred presence without hiding the branches.
  for(const y of [31,47]) {
    const halo=MeshBuilder.CreateTorus("world-tree-sacred-halo",{diameter:y===31?22:35,thickness:.10,tessellation:96},scene);
    halo.position.set(treeX,y,treeZ);halo.material=seedGlow;
  }
  const rootRing=MeshBuilder.CreateTorus("world-tree-root-rune",{diameter:22,thickness:.11,tessellation:96},scene);
  rootRing.position.set(treeX,.05,treeZ);rootRing.material=seedGlow;

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
    addCC0Model(scene,"Prop_Wagon",[32.2,0.02,-14.8],[1.25,1.25,1.25],Math.PI*.5),
  ];
  await Promise.all(modelJobs);
  addObstacle(32.2,-14.8,1.8);
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

  // Rigged, animated CC0 fantasy residents replace the primitive mannequin figures.
  const people=[];
  const faceSkin=new StandardMaterial("npc-face-skin",scene);faceSkin.diffuseColor=new Color3(.72,.49,.34);faceSkin.roughness=.92;
  const faceSkinLight=new StandardMaterial("npc-face-skin-light",scene);faceSkinLight.diffuseColor=new Color3(.88,.68,.52);
  const eyeWhite=new StandardMaterial("npc-eye-white",scene);eyeWhite.diffuseColor=new Color3(.92,.88,.78);
  const irisMat=new StandardMaterial("npc-iris",scene);irisMat.diffuseColor=new Color3(.18,.11,.07);
  const pupilMat=new StandardMaterial("npc-pupil",scene);pupilMat.diffuseColor=new Color3(.025,.018,.015);
  const hairBrown=new StandardMaterial("npc-hair-brown",scene);hairBrown.diffuseColor=new Color3(.12,.055,.025);
  const hairChestnut=new StandardMaterial("npc-hair-chestnut",scene);hairChestnut.diffuseColor=new Color3(.32,.105,.045);
  const hairBlonde=new StandardMaterial("npc-hair-blonde",scene);hairBlonde.diffuseColor=new Color3(.72,.48,.16);
  const beardMat=new StandardMaterial("npc-beard",scene);beardMat.diffuseColor=new Color3(.19,.085,.035);
  function addFaceAndHair(root, skeleton, file) {
    const headBone=skeleton?.bones?.find(b=>/head/i.test(b.name)&&!/end|tip/i.test(b.name));
    if(!headBone) return;
    const anchorNode=new TransformNode("npc-head-details",scene);
    headBone.linkTransformNode(anchorNode,root);
    const makeSphere=(name,position,scale,material)=>{
      const mesh=MeshBuilder.CreateSphere(name,{diameter:1,segments:12},scene);
      mesh.parent=anchorNode;mesh.position.set(...position);mesh.scaling.set(...scale);mesh.material=material;mesh.isPickable=false;return mesh;
    };
    // Small sculpted facial features sit on the front of the head and follow its rig.
    makeSphere("npc-face-overlay",[0,.015,.105],[.255,.29,.105],file==="Priestess"?faceSkinLight:faceSkin);
    for(const side of [-1,1]) {
      makeSphere("npc-eye-sclera",[side*.067,.055,.194],[.052,.064,.025],eyeWhite);
      makeSphere("npc-iris",[side*.067,.052,.216],[.027,.036,.012],irisMat);
      makeSphere("npc-pupil",[side*.067,.052,.226],[.013,.022,.008],pupilMat);
      makeSphere("npc-eyebrow",[side*.067,.112,.197],[.062,.018,.018],hairBrown);
    }
    makeSphere("npc-nose",[0,-.015,.215],[.035,.052,.045],faceSkin);
    makeSphere("npc-mouth",[0,-.09,.202],[.064,.014,.012],beardMat);
    // Individual silhouettes: fringe, crown and back locks stop the NPCs reading as blank mannequins.
    const hair=file==="Priestess"?hairBlonde:(file==="Scout"?hairChestnut:hairBrown);
    if(file!=="Footman") {
      makeSphere("npc-hair-cap",[0,.145,-.005],[.29,.16,.27],hair);
      makeSphere("npc-fringe",[0,.105,.115],[.25,.075,.12],hair);
      if(file==="Priestess") {
        for(const side of [-1,1]) makeSphere("npc-long-hair-lock",[side*.19,-.075,-.035],[.095,.30,.13],hair);
      } else if(file==="King") {
        makeSphere("npc-royal-beard",[0,-.19,.13],[.15,.19,.09],beardMat);
      } else if(file==="PeasantMilitia" || file==="Scout") {
        makeSphere("npc-side-hair-left",[-.19,.015,.015],[.09,.18,.16],hair);
        makeSphere("npc-side-hair-right",[.19,.015,.015],[.09,.18,.16],hair);
      }
    } else {
      // Narrow eye opening under the guard's helmet.
      makeSphere("npc-helmet-brow",[0,.145,.13],[.25,.055,.08],hairBrown);
    }
  }
  async function addTownsperson(file,x,z,walking,phase,heading=0,groundY=0) {
    try {
      const imported=await SceneLoader.ImportMeshAsync("","https://gobkit.com/freebies/human003/",file+".glb",scene);
      const root=imported.meshes.find(m=>m.name==="__root__")||imported.meshes[0];
      if(!root) return null;
      root.position.set(x,groundY,z);root.rotation.y=heading;
      root.computeWorldMatrix(true);
      let bounds=root.getHierarchyBoundingVectors(true);
      const height=Math.max(.01,bounds.max.y-bounds.min.y);
      root.scaling.scaleInPlace(1.78/height);
      root.computeWorldMatrix(true);
      bounds=root.getHierarchyBoundingVectors(true);
      root.position.y-=bounds.min.y-groundY;
      root.computeWorldMatrix(true);
      addFaceAndHair(root,imported.skeletons?.[0],file);
      const wanted=walking?"walk":"idle";
      const group=imported.animationGroups.find(g=>g.name.toLowerCase()===wanted)
        || imported.animationGroups.find(g=>g.name.toLowerCase().includes(wanted));
      if(group) group.start(true);
      const actor={root,walking,phase,home:new Vector3(x,0,z),radius:walking?1.6+(phase%3)*.5:0};
      people.push(actor);return actor;
    } catch(error) {
      console.warn("Townsperson model could not be loaded:",file,error);
      return null;
    }
  }
  await Promise.all([
    addTownsperson("PeasantMilitia",-5,12,true,1.1,.5),
    addTownsperson("Priestess",5,8,false,2.4,Math.PI),
    addTownsperson("Scout",18,18,true,3.8,-.8),
    addTownsperson("Footman",29,5,true,5.2,1.4),
    addTownsperson("King",-2,15,false,6.6,-.6),
    addTownsperson("PeasantMilitia",7,-3,true,8.1,.2),
    addTownsperson("Footman",-5.1,-70.4,false,9.3,0,7.63),
    addTownsperson("Footman",5.1,-70.4,false,10.7,Math.PI,7.63)
  ]);
  // A properly rigged and animated palomino stands beside the merchant's timber cart.
  let horseRoot=null;
  try {
    const horse=await SceneLoader.ImportMeshAsync("","https://gobkit.com/freebies/animal012/","PalominoHorse.glb",scene);
    horseRoot=horse.meshes.find(m=>m.name==="__root__")||horse.meshes[0];
    if(horseRoot) {
      horseRoot.position.set(34,0,-22);horseRoot.rotation.y=-Math.PI/2;
      horseRoot.computeWorldMatrix(true);
      let bounds=horseRoot.getHierarchyBoundingVectors(true);
      const height=Math.max(.01,bounds.max.y-bounds.min.y);
      const horseScale=2.05/height;
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
  addObstacle(34,-22,1.35);
  // Timber merchant cart with iron-rimmed wheels and a piled cargo bed.
  const cart=MeshBuilder.CreateBox("market-handcart-bed",{width:2.3,height:.25,depth:2.8},scene);
  cart.position.set(34,.9,-25);cart.material=mats.wood;
  for(let side of [-1,1]) {
    const wheel=MeshBuilder.CreateCylinder("market-handcart-wheel",{diameter:1.35,height:.18,tessellation:24},scene);
    wheel.position.set(34+side*1.18,.82,-25);wheel.rotation.z=Math.PI/2;wheel.material=mats.dark;
    const hub=MeshBuilder.CreateCylinder("market-handcart-hub",{diameter:.34,height:.24,tessellation:16},scene);
    hub.position.copyFrom(wheel.position);hub.rotation.z=Math.PI/2;hub.material=mats.gold;
    box(scene,"market-handcart-rail",[34+side*.9,1.55,-25],[.12,.9,2.8],mats.woodLight);
  }
  for(let z=-25;z<=-23;z+=2) box(scene,"market-handcart-board",[34,1.48,z],[2.0,.12,.12],mats.woodLight);
  for(let i=0;i<5;i++) {
    const sack=MeshBuilder.CreateSphere("market-cart-cargo",{diameter:.82,segments:10},scene);
    sack.position.set(33.55+(i%2)*.78,1.45+Math.floor(i/2)*.25,-24.6+Math.floor(i/2)*.6);
    sack.scaling.y=.72;sack.material=i%2?mats.trim:mats.green;
  }

    // Camera, collision and interaction.
  const camera=new UniversalCamera("first-person-explorer",new Vector3(0,1.72,27),scene);
  camera.minZ=.08;camera.fov=.92;camera.inputs.clear();camera.rotation.y=Math.PI;
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
    if(z<-68 && Math.abs(x)>7.5 && Math.abs(x)<32)return true;
    return false;
  };
  const location=document.querySelector("#location-name");
  function getLocation(x,z) {
    if(x<-12&&z>0)return "銅鹿亭 — Copper Stag Tavern";
    if(x<-12&&z<-8&&z>-26)return "冒険者ギルド";
    if(x>10&&z<-5&&z>-29)return "王都の市場";
    if(Math.hypot(x-13,z-5)<16)return "皇帝の噴水広場";
    if(z<-35)return "王城への大通り";
    return "王都エリンヴェイル";
  }
  function interact() {
    const x=camera.position.x,z=camera.position.z;
    let message="石畳の広場。遠くに王城と世界樹が見える。";
    if(Math.hypot(x+21,z-6)<13)message="銅鹿亭。旅人たちが集う酒場。扉を通って中も見てみよう。";
    else if(Math.hypot(x+21,z+16)<13)message="冒険者ギルド。掲示板には依頼書が並んでいる。";
    else if(Math.hypot(x-13,z-5)<16)message="石造りの大噴水広場。水音を聞きながら、街の人々がベンチで語らう憩いの場所。";
    else if(z<-35)message="王城へ続く大門。崖の上に王城、その背後には世界樹がそびえる。";
    else if(x>10&&z<-5)message="市場の屋台。果物や旅の道具が並んでいる。";
    document.querySelector("#hint").textContent=message;
  }

  const shadowNames = /facade-|side-wall-|rear-wall|roof-|ridge|corner-post|oak-barrel|old-tree-trunk|plaza-tree-trunk|world-tree-trunk|world-tree-branch|gatehouse-tower|castle-tower|street-lamp-post|market-post|emperor-statue/;
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
