import {
  UniversalCamera, Color3, Color4, DirectionalLight, HemisphericLight,
  MeshBuilder, PBRMaterial, Scene, ShadowGenerator, StandardMaterial,
  DynamicTexture, Vector3, Animation, Scalar,
} from "@babylonjs/core";

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
  const flag=MeshBuilder.CreatePlane("royal-banner",{width:1.55,height:2.25,sideOrientation:MeshBuilder.DOUBLESIDE},scene);
  flag.position.set(x+0.82,y-1.25,z);
  flag.material=cloth;
  flag.rotation.y=Math.PI/2;
  flag.metadata={windPhase:phase};
  return flag;
}

function addBuilding(scene, cfg, mats, shadows, colliders) {
  const {x,z,w,d,h,name,sign,interior=false} = cfg;
  const front=z-d/2;
  // Split the front wall around the entrance so the doorway is physically walkable.
  const sideWidth=(w-2.25)/2;
  box(scene,name+"-facade-left",[x-(w+2.25)/4,h/2,z],[sideWidth,h,d],mats.wall).receiveShadows=true;
  box(scene,name+"-facade-right",[x+(w+2.25)/4,h/2,z],[sideWidth,h,d],mats.wall).receiveShadows=true;
  box(scene,name+"-facade-over-door",[x,h-0.52,z],[2.25,1.04,d],mats.wall).receiveShadows=true;
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
    box(scene,name+"-inside-back-wall",[x,h/2,z+d*.32],[w-.5,h-.3,.2],mats.wall);
    box(scene,name+"-inside-floor",[x,.08,z],[w-.5,.12,d-.5],mats.floor);
    for(let i=0;i<3;i++) {
      box(scene,name+"-interior-table",[x-3+i*3,.95,z+1],[1.6,.18,1.2],mats.wood);
      for(const dx of [-.6,.6]) for(const dz of [-.4,.4])
        box(scene,name+"-table-leg",[x-3+i*3+dx,.48,z+1+dz],[.13,.8,.13],mats.wood);
    }
    box(scene,name+"-counter",[x+3,1.25,z+1.6],[2.8,1.5,.85],mats.woodLight);
    for(let i=0;i<4;i++) box(scene,name+"-shelf",[x+2.6+i*.18,3.2,z+d*.18],[.12,2.3,.55],mats.wood);
    // Interior side walls leave a clear path through the doorway.
    box(scene,name+"-interior-left",[x-w/2+.12,h/2,z],[.2,h-.3,d],mats.wall);
    box(scene,name+"-interior-right",[x+w/2-.12,h/2,z],[.2,h-.3,d],mats.wall);
  }
  colliders.push({minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,doorX:x,doorWidth:1.9,doorZ:front,interior});
  return wall;
}

export async function createRoyalCity(engine, canvas) {
  const scene=new Scene(engine);
  scene.clearColor=new Color4(.58,.74,.84,1);
  scene.fogMode=Scene.FOGMODE_EXP2;scene.fogDensity=.0028;scene.fogColor=new Color3(.68,.78,.84);
  const sky=new HemisphericLight("sky-fill",new Vector3(0,1,0),scene);sky.intensity=.86;sky.groundColor=new Color3(.29,.25,.20);
  const sun=new DirectionalLight("golden-sun",new Vector3(-.45,-1,.3),scene);sun.position=new Vector3(45,70,-20);sun.intensity=2.0;
  const shadow=new ShadowGenerator(1536,sun);shadow.useBlurExponentialShadowMap=true;shadow.blurKernel=24;
  shadow.setDarkness(.25);

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

  // Cobblestone plaza with a repeating hand-laid pattern.
  const ground=MeshBuilder.CreateGround("plaza-ground",{width:150,height:150,subdivisions:2},scene);
  ground.position.y=-.12;ground.material=texturedMat(scene,"cobblestone",new Color3(.53,.50,.43),"#8c8475","#39362f");
  for(let z=-42;z<=34;z+=3.2) for(let x=-42;x<=42;x+=3.2) {
    const p=MeshBuilder.CreateBox("individual-cobble",{width:3.08,height:.075,depth:3.08},scene);
    p.position.set(x,-.055,z);p.material=(Math.floor((x+42)/3.2+z/3.2)%5===0)?mats.trim:ground.material;
  }

  const colliders=[];
  addBuilding(scene,{x:-21,z:6,w:15,d:10,h:9,name:"The Copper Stag Tavern",sign:"THE COPPER STAG",interior:true},{...mats},shadow,colliders);
  addBuilding(scene,{x:-21,z:-16,w:14,d:9,h:9.5,name:"Adventurers Guild",sign:"ADVENTURERS GUILD",interior:true},{...mats},shadow,colliders);
  addBuilding(scene,{x:22,z:-18,w:15,d:10,h:8.5,name:"Royal Market Hall",sign:"MARKET HALL"},{...mats},shadow,colliders);

  // Tavern outdoor terrace: benches, tables, barrels, flower boxes and striped awning.
  for(let i=0;i<3;i++) {
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

  // Guild notice board and a cluster of posted parchment sheets.
  box(scene,"quest-board-frame",[-12,2.25,-10],[4.2,3.4,.35],mats.wood);
  box(scene,"quest-board-face",[-12,2.25,-10.22],[3.75,2.95,.06],mats.woodLight);
  for(let i=0;i<5;i++) {
    const paper=box(scene,"guild-notice",[-13.3+(i%3)*1.25,2.45+Math.floor(i/3)*.6,-10.28],[.8,1.05,.035],mats.trim);
    paper.rotation.z=(i%2?-.08:.05);
  }

  // Imperial fountain with layered stone basin, animated water and crown-like jets.
  const basin=cylinder(scene,"imperial-fountain-basin",[13,.58,5],12,1.1,mats.trim,64);
  const inner=cylinder(scene,"fountain-inner-water",[13,1.18,5],10.7,.16,mat(scene,"turquoise-water",C.water,.14,.25),64);
  const plinth=cylinder(scene,"fountain-plinth",[13,2.05,5],2.5,1.8,mats.wall,32);
  cylinder(scene,"statue-collar",[13,3.12,5],1.65,.38,mats.gold,32);
  const statue=MeshBuilder.CreateSphere("emperor-statue-torso",{diameter:1.55,segments:24},scene);
  statue.position.set(13,4.2,5);statue.scaling.y=1.6;statue.material=mats.gold;
  const head=MeshBuilder.CreateSphere("emperor-statue-head",{diameter:.78,segments:20},scene);
  head.position.set(13,5.45,5);head.material=mats.gold;
  for(let i=0;i<5;i++) {
    const spike=MeshBuilder.CreateCylinder("crown-point",{diameterTop:0,diameterBottom:.22,height:.75,tessellation:8},scene);
    spike.position.set(12.55+i*.22,5.95+(i===2?.18:0),5);spike.material=mats.gold;
  }
  for(let i=0;i<12;i++) {
    const a=i*Math.PI/6;
    const jet=MeshBuilder.CreateCylinder("fountain-water-jet",{diameterTop:.04,diameterBottom:.12,height:1.15,tessellation:8},scene);
    jet.position.set(13+Math.cos(a)*3.8,1.9,5+Math.sin(a)*3.8);
    jet.rotation.z=Math.cos(a)*-.25;jet.rotation.x=Math.sin(a)*.25;jet.material=mats.glass;
  }
  const waterRing=MeshBuilder.CreateTorus("fountain-ripple",{diameter:7.6,thickness:.035,tessellation:64},scene);
  waterRing.position.set(13,1.29,5);waterRing.material=mat(scene,"water-ripple",new Color3(.55,.82,.88),.15,.2);

  // Market stalls, cloth roofs, produce crates and baskets.
  for(let i=0;i<4;i++) {
    const x=14+i*4.5,z=-10-(i%2)*3;
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
  addBuilding(scene,{x:0,z:-43,w:22,d:10,h:14,name:"Royal Gatehouse",sign:"THE CROWN GATE"},{...mats},shadow,colliders);
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
  // Cliff, castle towers and distant waterfall.
  const cliff=MeshBuilder.CreateBox("castle-cliff",{width:64,height:17,depth:17},scene);
  cliff.position.set(0,7.5,-77);cliff.material=mat(scene,"cliff-rock",new Color3(.34,.36,.35));
  for(let i=0;i<7;i++) {
    const tower=MeshBuilder.CreateCylinder("castle-tower",{diameter:5.5,height:17+(i%3)*4,tessellation:16},scene);
    tower.position.set(-23+i*7.5,19+(i%2)*1.5,-77);tower.material=mats.trim;
    const roof=MeshBuilder.CreateCylinder("castle-spire",{diameterTop:0,diameterBottom:6.5,height:7,tessellation:12},scene);
    roof.position.set(tower.position.x,31+(i%3)*2,-77);roof.material=mats.roof;
  }
  const waterfall=MeshBuilder.CreatePlane("distant-waterfall",{width:7,height:15},scene);
  waterfall.position.set(27,7,-68);waterfall.material=new StandardMaterial("waterfall-material",scene);
  waterfall.material.diffuseColor=new Color3(.45,.75,.82);waterfall.material.alpha=.72;waterfall.material.emissiveColor=new Color3(.12,.2,.22);

  // Yggdrasil-like world tree behind the castle, layered boughs and leaf masses.
  cylinder(scene,"world-tree-trunk",[0,20,-93],5.8,40,mat(scene,"world-tree-bark",new Color3(.25,.16,.095)),16);
  for(let i=0;i<9;i++) {
    const branch=MeshBuilder.CreateCylinder("world-tree-branch",{diameterTop:.35,diameterBottom:1.25,height:13,tessellation:10},scene);
    branch.position.set((i%2?1:-1)*(3+i%3*2),25+i*2,-93);branch.rotation.z=(i%2?-.9:.9);branch.material=mats.trunk;
  }
  const canopyMats=[mat(scene,"canopy-deep",new Color3(.12,.28,.18)),mat(scene,"canopy-mid",new Color3(.18,.38,.22)),mat(scene,"canopy-light",new Color3(.28,.46,.25))];
  const canopy=[];
  for(let i=0;i<32;i++) {
    const leaf=MeshBuilder.CreateSphere("world-tree-crown",{diameter:9+Math.random()*5,segments:12},scene);
    leaf.position.set((Math.random()-.5)*26,30+Math.random()*20,-93+(Math.random()-.5)*10);
    leaf.scaling.y=.72+Math.random()*.5;leaf.material=canopyMats[i%3];canopy.push({mesh:leaf,phase:Math.random()*Math.PI*2,base:leaf.rotation.z,baseY:leaf.position.y});
  }

  // Old trees, clipped hedges and flower planters around the outer square.
  for(const [x,z,s] of [[-37,20,1.8],[36,19,1.6],[-39,-20,1.5],[38,-28,1.7],[-8,27,1.1],[29,28,1.3]]) {
    cylinder(scene,"plaza-tree-trunk",[x,2.4*s,z],.75*s,4.8*s,mats.trunk,12);
    for(let j=0;j<5;j++) {
      const crown=MeshBuilder.CreateSphere("plaza-tree-crown",{diameter:4.6*s,segments:10},scene);
      crown.position.set(x+(Math.random()-.5)*2*s,4.2*s+Math.random()*1.8*s,z+(Math.random()-.5)*2*s);
      crown.material=mats.leaves;
    }
  }
  addPlanter(scene,8,15,mats.trim,mats.green,mats.flowers);
  addPlanter(scene,25,13,mats.trim,mats.green,mats.flowers);

  // Ambient decorative street lamps and benches.
  for(const [x,z] of [[-7,20],[7,20],[-8,-27],[8,-27],[30,2],[-32,-2]]) {
    cylinder(scene,"street-lamp-post",[x,2.1,z],.16,4.2,mats.wood,12);
    box(scene,"street-lamp-top",[x,4.2,z],[.9,.18,.9],mats.gold);
    const glow=MeshBuilder.CreateSphere("street-lamp-glow",{diameter:.38,segments:10},scene);
    glow.position.set(x,3.8,z);glow.material=mats.lantern;
  }

  // Camera, collision and interaction.
  const camera=new UniversalCamera("first-person-explorer",new Vector3(0,1.72,27),scene);
  camera.minZ=.08;camera.fov=.92;camera.inputs.clear();camera.rotation.y=Math.PI;
  let yaw=0,pitch=0,moveSource=()=>Vector3.Zero();
  const velocity=new Vector3();
  const collides=(x,z)=>{
    if(Math.abs(x)>69||Math.abs(z)>69)return true;
    for(const c of colliders) {
      if(x>c.minX-.5&&x<c.maxX+.5&&z>c.minZ-.5&&z<c.maxZ+.5) {
        const insideRoom=c.interior&&x>c.minX+.55&&x<c.maxX-.55&&z>c.minZ+.55&&z<c.maxZ-.55;
        if(insideRoom)continue;
        const inDoor=Math.abs(x-c.doorX)<c.doorWidth/2 && z<c.doorZ+.7 && z>c.doorZ-1.5;
        if(!inDoor)return true;
      }
    }
    // Fountain basin, market counters, and castle cliff are solid.
    if(Math.hypot(x-13,z-5)<6.1)return true;
    if(z<-68 && Math.abs(x)<32)return true;
    return false;
  };
  const location=document.querySelector("#location-name");
  function getLocation(x,z) {
    if(x<-12&&z>0)return "銅鹿亭 — Copper Stag Tavern";
    if(x<-12&&z<-8&&z>-26)return "冒険者ギルド";
    if(x>10&&z<-5&&z>-29)return "王都の市場";
    if(Math.hypot(x-13,z-5)<9)return "皇帝の噴水広場";
    if(z<-35)return "王城への大通り";
    return "王都エリンヴェイル";
  }
  function interact() {
    const x=camera.position.x,z=camera.position.z;
    let message="石畳の広場。遠くに王城と世界樹が見える。";
    if(Math.hypot(x+21,z-6)<13)message="銅鹿亭。旅人たちが集う酒場。扉を通って中も見てみよう。";
    else if(Math.hypot(x+21,z+16)<13)message="冒険者ギルド。掲示板には依頼書が並んでいる。";
    else if(Math.hypot(x-13,z-5)<10)message="皇帝の像を囲む噴水。水面が陽光を反射している。";
    else if(z<-35)message="王城へ続く大門。崖の上に王城、その背後には世界樹がそびえる。";
    else if(x>10&&z<-5)message="市場の屋台。果物や旅の道具が並んでいる。";
    document.querySelector("#hint").textContent=message;
  }

  return {
    scene,
    setMovementSource(fn){moveSource=fn;},
    turn(dx,dy){yaw+=dx;pitch=Scalar.Clamp(pitch+dy,-1.05,1.05);camera.rotation.y=Math.PI+yaw;camera.rotation.x=pitch;},
    interact,
    update(dt){
      const input=moveSource();
      const step=Math.min(dt,.045);
      const speed=8.2;
      const fx=Math.sin(yaw),fz=-Math.cos(yaw),rx=Math.cos(yaw),rz=Math.sin(yaw);
      const dx=(fx*input.y+rx*input.x)*speed*step;
      const dz=(fz*input.y+rz*input.x)*speed*step;
      const nx=camera.position.x+dx,nz=camera.position.z+dz;
      if(!collides(nx,camera.position.z))camera.position.x=nx;
      if(!collides(camera.position.x,nz))camera.position.z=nz;
      camera.position.y=1.72;
      camera.rotation.y=Math.PI+yaw;camera.rotation.x=pitch;
      location.textContent=getLocation(camera.position.x,camera.position.z);
      const time=performance.now()*.001;
      canopy.forEach(o=>{o.mesh.rotation.z=o.base+Math.sin(time*.35+o.phase)*.025;o.mesh.position.y=o.baseY+Math.sin(time*.35+o.phase)*.16;});
      waterRing.scaling.x=1+Math.sin(time*1.2)*.025;
      inner.position.y=1.17+Math.sin(time*1.6)*.018;
    }
  };
}
