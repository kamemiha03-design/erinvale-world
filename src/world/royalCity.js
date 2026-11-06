import {
  UniversalCamera, Color3, Color4, DirectionalLight, HemisphericLight, PointLight,
  Mesh, MeshBuilder, PBRMaterial, Scene, ShadowGenerator, StandardMaterial, TransformNode,
  DynamicTexture, Texture, Vector3, Curve3, Animation, Scalar, ImageProcessingConfiguration,
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

// Reuse immutable vertex buffers for repeated box/cylinder dimensions.
// Each placed object remains an independent mesh with its own transform and material.
const primitiveGeometryCaches = new WeakMap();
function sharedPrimitive(scene, cacheName, name, kind, options) {
  let caches=primitiveGeometryCaches.get(scene);
  if(!caches){caches=new Map();primitiveGeometryCaches.set(scene,caches);}
  let cache=caches.get(cacheName);
  if(!cache){cache=new Map();caches.set(cacheName,cache);}
  const key=Object.keys(options).sort().map(k=>k+":"+options[k]).join("|");
  let template=cache.get(key);
  if(!template){
    template=kind==="box"
      ?MeshBuilder.CreateBox("shared-"+cacheName+"-geometry",options,scene)
      :MeshBuilder.CreateCylinder("shared-"+cacheName+"-geometry",options,scene);
    template.isVisible=false;
    template.isPickable=false;
    template.setEnabled(false);
    cache.set(key,template);
  }
  const mesh=template.clone(name,null,true);
  mesh.isVisible=true;
  mesh.isPickable=false;
  mesh.setEnabled(true);
  return mesh;
}

function box(scene, name, pos, size, material, opts = {}) {
  const mesh=sharedPrimitive(scene,"boxes",name,"box",{width:size[0],height:size[1],depth:size[2]});
  mesh.position.set(pos[0],pos[1],pos[2]);
  mesh.material=material;
  if(opts.rotation)mesh.rotation.y=opts.rotation;
  if(opts.castShadow)mesh.receiveShadows=true;
  return mesh;
}

function cylinder(scene, name, pos, diameter, height, material, tessellation = 24) {
  const mesh=sharedPrimitive(scene,"cylinders",name,"cylinder",{diameter,height,tessellation});
  mesh.position.set(pos[0],pos[1],pos[2]);
  mesh.material=material;
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


function addAntiqueDoor(scene,name,x,y,z,width,height,mats,angle=0.98,axis="z") {
  const leafW=width*.49,leafH=height*.91,cy=y+height*.455;
  scene.metadata=scene.metadata||{};
  scene.metadata.doorLeaves=scene.metadata.doorLeaves||[];
  for(const side of [-1,1]) {
    const hinge=new TransformNode(name+"-hinge-"+side,scene);
    hinge.position.set(axis==="x"?x:x+side*width*.5,cy,axis==="x"?z+side*width*.5:z);
    hinge.rotation.y=(axis==="x"?Math.PI/2:0);
    const leaf=box(scene,name+"-leaf",[0,0,0],[leafW,leafH,.22],mats.woodLight);
    leaf.parent=hinge;leaf.position.set(-side*leafW*.5,0,0);
    const localX=-side*leafW*.5;
    for(const level of [-1,1]) {
      const panel=box(scene,name+"-raised-panel",[0,0,0],[leafW*.70,leafH*.28,.055],mats.wood);
      panel.parent=hinge;panel.position.set(localX,level*leafH*.23,-.135);
      const inset=box(scene,name+"-panel-inset",[0,0,0],[leafW*.52,leafH*.19,.035],mats.woodLight);
      inset.parent=hinge;inset.position.set(localX,level*leafH*.23,-.17);
      const mould=box(scene,name+"-panel-moulding",[0,0,0],[leafW*.78,.075,.045],mats.gold);
      mould.parent=hinge;mould.position.set(localX,level*leafH*.39,-.17);
    }
    for(const yy of [-leafH*.36,0,leafH*.36]) {
      const strap=box(scene,name+"-forged-iron-strap",[0,0,0],[leafW*.94,.105,.065],mats.gold);
      strap.parent=hinge;strap.position.set(localX,yy,-.19);
      for(let n=0;n<5;n++) {
        const rivet=MeshBuilder.CreateSphere(name+"-iron-rivet",{diameter:.065,segments:8},scene);
        rivet.parent=hinge;rivet.position.set(localX-leafW*.39+n*leafW*.195,yy,-.235);rivet.material=mats.trim;
      }
    }
    const handle=MeshBuilder.CreateTorus(name+"-ring-handle",{diameter:.24,thickness:.045,tessellation:20},scene);
    handle.parent=hinge;handle.position.set(localX-side*.12,0,-.25);handle.rotation.x=Math.PI/2;handle.material=mats.gold;
    const backplate=MeshBuilder.CreateCylinder(name+"-handle-backplate",{diameter:.32,height:.045,tessellation:16},scene);
    backplate.parent=hinge;backplate.position.set(localX-side*.12,.18,-.22);backplate.rotation.x=Math.PI/2;backplate.material=mats.gold;
    for(const yy of [-leafH*.42,leafH*.42]) {
      const hingeBar=box(scene,name+"-hinge-plate",[0,0,0],[.18,.42,.07],mats.gold);
      hingeBar.parent=hinge;hingeBar.position.set(-side*leafW*.43,yy,-.17);
      const hingePin=MeshBuilder.CreateCylinder(name+"-hinge-pin",{diameter:.095,height:.5,tessellation:10},scene);
      hingePin.parent=hinge;hingePin.position.set(-side*leafW*.43,yy,-.20);hingePin.material=mats.trim;
    }
    hinge.rotation.y+=(side*angle);
    scene.metadata.doorLeaves.push({pivot:hinge,home:hinge.rotation.y,open:false,position:hinge.position.clone(),name});
  }
  for(const side of [-1,1]) box(scene,name+"-carved-stone-jamb",
    axis==="x"?[x,y+height*.46,z+side*width*.53]:[x+side*width*.53,y+height*.46,z],
    axis==="x"?[.62,height+.35,.32]:[.32,height+.35,.62],mats.trim);
  box(scene,name+"-carved-stone-lintel",[x,y+height+.20,z],
    axis==="x"?[.72,.42,width+1]:[width+1,.42,.72],mats.trim);
  for(let i=0;i<7;i++) {
    const rosette=MeshBuilder.CreateSphere(name+"-lintel-carving",{diameter:.11,segments:8},scene);
    rosette.position.set(x-width*.38+i*width*.127,y+height+.22,z-.39);rosette.scaling.y=.55;rosette.material=mats.gold;
  }
  const crest=MeshBuilder.CreateCylinder(name+"-door-crest",{diameter:Math.min(.82,width*.34),height:.14,tessellation:8},scene);
  crest.position.set(axis==="x"?x-.25:x,y+height+.68,axis==="x"?z-.25:z-.25);crest.rotation.x=Math.PI/2;crest.material=mats.gold;
}
function addBarrel(scene, x, z, wood, hoop) {
  const b = cylinder(scene, "oak-barrel", [x,0.65,z], 0.9, 1.3, wood, 16);
  b.scaling.x = 0.82;
  cylinder(scene, "barrel-hoop-top", [x,1.03,z], 0.79, 0.08, hoop, 24);
  cylinder(scene, "barrel-hoop-bottom", [x,0.28,z], 0.79, 0.08, hoop, 24);
  cylinder(scene, "barrel-lid", [x,1.32,z], 0.7, 0.06, wood, 20);
}

function addPlanter(scene,x,z,stone,greens,flowers) {
  box(scene,"stone-planter",[x,.38,z],[1.8,.72,1.35],stone);
  box(scene,"planter-soil",[x,.76,z],[1.52,.08,1.08],mat(scene,"rich-soil",new Color3(.16,.12,.08)));
  for(let i=0;i<8;i++) {
    const px=x+((i%4)-1.5)*.31,pz=z+(Math.floor(i/4)? .22:-.22);
    const stemTop=new Vector3(px,.98+(i%3)*.18,pz);
    const stem=MeshBuilder.CreateTube("planter-flower-stem",{path:[new Vector3(px,.82,pz),stemTop],radius:.018,tessellation:5},scene);
    stem.material=greens;
    for(let l=0;l<4;l++) {
      const a=l*Math.PI*.5+i*.6;
      const base=new Vector3(px,.9+(l%2)*.12,pz);
      const tip=base.add(new Vector3(Math.cos(a)*.28,.12,Math.sin(a)*.24));
      const mid=Vector3.Lerp(base,tip,.5).add(new Vector3(0,.05,0));
      const side=Vector3.Cross(tip.subtract(base),new Vector3(.2,1,.1)).normalize().scale(.075);
      const blade=MeshBuilder.CreateRibbon("planter-individual-leaf",{pathArray:[
        [base,Vector3.Lerp(base,mid,.5).add(side),mid.add(side.scale(.4)),tip],
        [base,Vector3.Lerp(base,mid,.5).subtract(side),mid.subtract(side.scale(.4)),tip]
      ],sideOrientation:2},scene);
      blade.material=greens;
    }
    // Five separate petals around a small central flower.
    for(let petal=0;petal<5;petal++) {
      const a=petal*Math.PI*2/5+i*.3,center=new Vector3(px,stemTop.y,pz);
      const left=[],right=[];
      for(let k=0;k<4;k++) {
        const t=k/3,r=.03+t*.15,spread=.015+Math.sin(t*Math.PI)*.065;
        const cx=center.x+Math.cos(a)*r,cz=center.z+Math.sin(a)*r,cy=center.y+Math.sin(t*Math.PI)*.055;
        left.push(new Vector3(cx-Math.sin(a)*spread,cy,cz+Math.cos(a)*spread));
        right.push(new Vector3(cx+Math.sin(a)*spread,cy,cz-Math.cos(a)*spread));
      }
      const petalMesh=MeshBuilder.CreateRibbon("planter-flower-petal",{pathArray:[left,right],sideOrientation:2},scene);
      petalMesh.material=flowers;
    }
  }
}

function addTree(scene,x,z,scale,trunk,leaves) {
  cylinder(scene,"old-tree-trunk",[x,2.2*scale,z],.85*scale,4.4*scale,trunk,12);
  // Branches carry individually modeled leaf blades; no spherical canopy clusters.
  for(let branch=0;branch<9;branch++) {
    const a=branch*Math.PI*2/9,level=3.0+((branch*7)%5)*.34;
    const spread=(1.0+((branch*3)%4)*.22)*scale;
    const origin=new Vector3(x,level*scale,z);
    const end=new Vector3(x+Math.cos(a)*spread,level*scale+(.9+(branch%3)*.22)*scale,z+Math.sin(a)*spread);
    const twig=MeshBuilder.CreateTube("tree-branch",{path:[origin,Vector3.Lerp(origin,end,.55),end],radius:.12*scale,tessellation:7},scene);
    twig.material=trunk;
    for(let leaf=0;leaf<12;leaf++) {
      const t=.16+(leaf%4)*.20;
      const anchor=Vector3.Lerp(origin,end,t);
      const side=(leaf%2?1:-1);
      const direction=new Vector3(Math.cos(a+side*.9),.20+(leaf%3)*.10,Math.sin(a+side*.9)).normalize();
      const tip=anchor.add(direction.scale((.48+(leaf%3)*.10)*scale));
      const axis=tip.subtract(anchor),perp=Vector3.Cross(axis,new Vector3(.12,1,.18)).normalize().scale(.18*scale);
      const mid=Vector3.Lerp(anchor,tip,.5).add(new Vector3(0,.10*scale,0));
      const left=[anchor,Vector3.Lerp(anchor,mid,.5).add(perp.scale(.7)),mid.add(perp.scale(.42)),tip];
      const right=[anchor,Vector3.Lerp(anchor,mid,.5).subtract(perp.scale(.7)),mid.subtract(perp.scale(.42)),tip];
      const blade=MeshBuilder.CreateRibbon("individual-tree-leaf",{pathArray:[left,right],sideOrientation:2},scene);
      blade.material=leaves;blade.isPickable=false;
      const vein=MeshBuilder.CreateTube("tree-leaf-vein",{path:[anchor,mid,tip],radius:.012*scale,tessellation:4},scene);
      vein.material=trunk;vein.isPickable=false;
    }
  }
}


function addPetalBloom(scene,name,center,radius,material,count=7) {
  // Keep every sculpted petal as real geometry, but batch the petals into one draw call.
  // This preserves the flower silhouette while greatly reducing Safari's scene overhead.
  const petalMeshes=[];
  for(let p=0;p<count;p++) {
    const a=p*Math.PI*2/count;
    const left=[],right=[];
    for(let k=0;k<5;k++) {
      const t=k/4,r=radius*(.12+t*.88),spread=radius*(.025+Math.sin(t*Math.PI)*.24);
      const x=center.x+Math.cos(a)*r,z=center.z+Math.sin(a)*r,y=center.y+Math.sin(t*Math.PI)*radius*.22;
      left.push(new Vector3(x-Math.sin(a)*spread,y,z+Math.cos(a)*spread));
      right.push(new Vector3(x+Math.sin(a)*spread,y,z-Math.cos(a)*spread));
    }
    const petal=MeshBuilder.CreateRibbon(name+"-separate-petal",{pathArray:[left,right],sideOrientation:2},scene);
    petal.material=material;petal.isPickable=false;petalMeshes.push(petal);
  }
  if(petalMeshes.length>1) {
    const flowerMesh=Mesh.MergeMeshes(petalMeshes,true,true);
    if(flowerMesh){flowerMesh.name=name+"-individual-petals-batched";flowerMesh.material=material;flowerMesh.isPickable=false;}
  }
  const heart=MeshBuilder.CreateDisc(name+"-flower-heart",{radius:radius*.18,tessellation:12},scene);
  heart.position.copyFrom(center);heart.position.y+=radius*.12;heart.material=material;
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
  const roofL=box(scene,name+"-roof-left",[x-w*.24,h+.72,z],[w*.58,0.22,d+1.0],mats.roof,{rotation:-.42});
  roofL.rotation.z=.42;
  const roofR=box(scene,name+"-roof-right",[x+w*.24,h+.72,z],[w*.58,0.42,d+1.0],mats.roof,{rotation:.42});
  roofR.rotation.z=-.42;
  box(scene,name+"-ridge",[x,h+1.42,z],[.35,.35,d+1.1],mats.trim);
  // Overlapping slate shingles and deep eaves finish the medieval street roofs.
  const roofTileMeshes=[],roofSpan=w*.58,roofCols=Math.max(4,Math.min(7,Math.round(roofSpan/1.45))),roofRows=Math.max(5,Math.min(9,Math.round((d+1)/1.65)));
  for(const side of [-1,1]) {
    const roofCenterX=x+side*w*.24,roofAngle=side<0?.42:-.42;
    for(let row=0;row<roofRows;row++)for(let col=0;col<roofCols;col++){
      const tx=roofCenterX+(col-(roofCols-1)/2+(row%2)*.18)*(roofSpan/roofCols),tz=z-(d+1)*.43+row*((d+1)*.86/Math.max(1,roofRows-1));
      const slopeY=side<0?Math.sin(.42)*(tx-(x-w*.24)):-Math.sin(.42)*(tx-(x+w*.24));
      const tile=MeshBuilder.CreateBox(name+"-individual-roof-shingle",{width:roofSpan/roofCols*1.08,height:.055,depth:(d+1)/roofRows*1.12},scene);
      tile.position.set(tx,h+.82+slopeY,tz);tile.rotation.z=roofAngle;tile.material=mats.roof;tile.isPickable=false;roofTileMeshes.push(tile);
    }
    box(scene,name+"-roof-eave",[x+side*w*.53,h+.72-Math.sin(.42)*w*.29-.08,z],[.28,.18,d+1.3],mats.wood);
    for(const zEnd of [-1,1])box(scene,name+"-gable-roof-fascia",[x+side*w*.26,h+.74,z+zEnd*(d/2+.48)],[w*.62,.12,.22],mats.wood);
  }
  const tiledRoof=Mesh.MergeMeshes(roofTileMeshes,true,true,undefined,false,false);
  if(tiledRoof){tiledRoof.name=name+"-medieval-shingle-roof";tiledRoof.material=mats.roof;tiledRoof.isPickable=false;}
  for(let i=-3;i<=3;i++){const seam=box(scene,name+"-roof-seam",[x+i*w*.105,h+.91,z-d*.42],[.055,.055,d*.45],mats.trim);seam.rotation.z=.42;}
  // Main arched entrance: stone piers, lintel, deep shadow and timber door.
  box(scene,name+"-door-shadow",[x,1.35,front-.20],[1.75,2.7,.12],mats.dark);
  box(scene,name+"-door-left",[x-.93,1.35,front-.28],[.16,2.9,.45],mats.trim);
  box(scene,name+"-door-right",[x+.93,1.35,front-.28],[.16,2.9,.45],mats.trim);
  box(scene,name+"-door-lintel",[x,2.82,front-.28],[2.05,.22,.45],mats.trim);
  addAntiqueDoor(scene,name+"-antique-entry",x,.12,front-.48,1.95,2.72,mats,.98);
  // The entrance stays walkable between the open door leaves.
  const windowY=h*.67;
  addWindow(scene,x-w*.27,windowY,front-.16,mats.wood,mats.glass);
  addWindow(scene,x+w*.27,windowY,front-.16,mats.wood,mats.glass);
  // Broad side-facing leaded windows make the taverns and guild read as lived-in buildings.
  for(const side of [-1,1]) for(const zz of [z-d*.24,z+d*.24]) {
    const wx=x+side*(w/2+.12);
    box(scene,name+"-side-window-recess",[wx,windowY,zz],[.12,1.9,1.65],mats.wood);
    box(scene,name+"-side-window-glass",[wx+side*.075,windowY,zz],[.055,1.42,1.18],mats.glass);
    box(scene,name+"-side-window-mullion-v",[wx+side*.12,windowY,zz],[.07,1.46,.09],mats.wood);
    box(scene,name+"-side-window-mullion-h",[wx+side*.12,windowY,zz],[.07,.09,1.22],mats.wood);
    box(scene,name+"-side-window-sill",[wx+side*.15,windowY-.98,zz],[.28,.15,1.82],mats.trim);
    for(const shutterSide of [-1,1]) {
      const shutter=box(scene,name+"-side-window-shutter",[wx+side*.12,windowY,zz+shutterSide*.77],[.12,1.48,.24],mats.woodLight);
      shutter.rotation.x=shutterSide*.06;
    }
  }
  // The Velvet Rose deliberately has no exterior sign; its discreet lantern-lit entrance
  // is meant to be discovered from the warm windows and red canopy instead.
  if(name!=="The Velvet Rose") {
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
  
  }
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
    if(name!=="The Velvet Rose") {
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
    }
    if(name==="The Velvet Rose") {
      // A mysterious candlelit lounge with velvet, antique brass and private curtained alcoves.
      const wine=mat(scene,"velvet-rose-wine",new Color3(.24,.018,.055),.72);
      const wineLight=mat(scene,"velvet-rose-highlight",new Color3(.48,.055,.12),.62);
      const plum=mat(scene,"velvet-rose-plum",new Color3(.105,.045,.105),.48);
      const black=mat(scene,"velvet-rose-ebony",new Color3(.035,.027,.034),.36,.25);
      const brass=mat(scene,"velvet-rose-brass",new Color3(.66,.43,.19),.28,.78);
      const candleGlow=mat(scene,"velvet-rose-candle-glow",new Color3(1,.29,.09),.25);
      candleGlow.emissiveColor=new Color3(.95,.16,.035);
      const mirror=mat(scene,"velvet-rose-smoked-mirror",new Color3(.12,.075,.095),.12,.85);
      mirror.emissiveColor=new Color3(.045,.012,.025);
      box(scene,"velvet-rose-carpet",[x,.17,z+1.0],[w-1,.10,d-1.1],wine);
      box(scene,"velvet-rose-runner",[x,.235,z+1.0],[3.2,.035,d-1.5],wineLight);
      for(let zz=z-d*.34;zz<z+d*.30;zz+=1.35)
        box(scene,"velvet-rose-runner-motif",[x,.26,zz],[2.55,.025,.045],brass);
      box(scene,"velvet-rose-reception-desk",[x,1.18,z-d*.34],[5.8,1.45,.95],black);
      box(scene,"velvet-rose-desk-inlay",[x,1.12,z-d*.34-.49],[4.9,.72,.055],brass);
      box(scene,"velvet-rose-desk-top",[x,1.96,z-d*.34],[6.2,.16,1.18],wineLight);
      for(let j=-2;j<=2;j++) box(scene,"velvet-rose-desk-lattice",[x+j*.86,1.18,z-d*.34-.53],[.055,.92,.06],brass);
      // Four private lounge bays with deep sofas and heavy curtains.
      for(let side of [-1,1]) for(let row=0;row<2;row++) {
        const ax=x+(side<0?0.3:5.35), az=z-1.1-row*4.25;
        box(scene,"velvet-rose-alcove-platform",[ax,.36,az],[5.0,.22,3.25],black);
        box(scene,"velvet-rose-settee-seat",[ax,.78,az+.25],[3.5,.58,1.25],wine);
        // The settee and its bay are solid to the first-person visitor.
        obstacles.push({x:ax,z:az+.05,r:2.05});
        box(scene,"velvet-rose-settee-back",[ax,1.35,az-.28],[3.55,1.05,.42],wineLight);
        for(let dx of [-1.35,1.35]) {
          box(scene,"velvet-rose-settee-arm",[ax+dx,1.02,az+.25],[.42,.72,1.28],wine);
          cylinder(scene,"velvet-rose-brass-foot",[ax+dx,.43,az+.25],.075,.5,brass,8);
        }
        box(scene,"velvet-rose-low-table",[ax,.68,az+1.45],[1.35,.16,.8],brass);
        obstacles.push({x:ax,z:az+1.45,r:.92});
        box(scene,"velvet-rose-table-inset",[ax,.775,az+1.45],[1.08,.035,.58],black);
        box(scene,"velvet-rose-screen-frame",[ax+side*2.35,2.05,az-.1],[.16,3.6,2.8],brass);
        obstacles.push({x:ax+side*2.35,z:az-.1,r:1.35});
        box(scene,"velvet-rose-screen-panel",[ax+side*2.35,2.05,az-.1],[.10,3.35,2.55],plum);
        box(scene,"velvet-rose-curtain-valance",[ax,3.65,az-1.0],[4.9,.22,.35],brass);
        for(let fold=0;fold<9;fold++)
          box(scene,"velvet-rose-curtain-fold",[ax-2.1+fold*.525,2.55,az-1.0],[.48,2.15,.16],wine);
      }
      // Smoked mirrors and gilt sconces along both side walls.
      for(let side of [-1,1]) for(let row=0;row<3;row++) {
        const mx=x+side*(w/2-.42), mz=z-4.3+row*3.7;
        box(scene,"velvet-rose-mirror-frame",[mx,3.9,mz],[.22,2.45,1.75],brass);
        box(scene,"velvet-rose-mirror-glass",[mx-side*.13,3.9,mz],[.055,2.12,1.42],mirror);
        box(scene,"velvet-rose-wall-sconce-base",[mx-side*.25,3.35,mz+1.05],[.22,.55,.22],brass);
        const glow=MeshBuilder.CreateSphere("velvet-rose-wall-sconce-glow",{diameter:.27,segments:10},scene);
        glow.position.set(mx-side*.42,3.55,mz+1.05);glow.material=candleGlow;
      }
      // Sideboard, decanters and a warm chandelier.
      box(scene,"velvet-rose-sideboard",[x-2.0,1.25,z-d*.28],[4.5,1.55,.85],black);
      box(scene,"velvet-rose-sideboard-top",[x-2.0,2.08,z-d*.28],[4.8,.16,1.0],brass);
      for(let j=0;j<6;j++) {
        const bx=x-3.7+j*.68;
        cylinder(scene,"velvet-rose-decanter",[bx,2.48,z-d*.28],.19,.62,j%2?wineLight:plum,12);
        cylinder(scene,"velvet-rose-decanter-neck",[bx,2.88,z-d*.28],.075,.25,brass,10);
      }
      const pendantX=x-6.3,pendantZ=z-1.5;
      const pendant=MeshBuilder.CreateTorus("velvet-rose-pendant-ring",{diameter:2.5,thickness:.12,tessellation:24},scene);
      pendant.position.set(pendantX,h-1.0,pendantZ);pendant.material=brass;
      cylinder(scene,"velvet-rose-pendant-chain",[pendantX,h-.42,pendantZ],.055,1.0,black,10);
      for(let j=0;j<8;j++) {
        const a=j*Math.PI/4;
        const bulb=MeshBuilder.CreateSphere("velvet-rose-pendant-bulb",{diameter:.24,segments:10},scene);
        bulb.position.set(pendantX+Math.cos(a)*1.15,h-1.0,pendantZ+Math.sin(a)*1.15);bulb.material=candleGlow;
      }
      // A modest lower-town character: patched plaster, practical storage and a small
      // service corner keep the house from feeling like a palace.
      const plaster=mat(scene,"velvet-rose-aged-plaster",new Color3(.43,.34,.27),.98);
      const linen=mat(scene,"velvet-rose-worn-linen",new Color3(.72,.59,.48),.96);
      const rosewood=mat(scene,"velvet-rose-dark-rosewood",new Color3(.17,.075,.055),.86);
      const mutedGold=mat(scene,"velvet-rose-aged-brass",new Color3(.43,.29,.15),.48,.55);
      const dustyRose=mat(scene,"velvet-rose-dusty-rose",new Color3(.39,.13,.16),.9);
      // A small hearth and piano make the ground-floor salon feel occupied after dusk.
      box(scene,"velvet-rose-hearth-surround",[x-2.5,.95,z+1.0],[2.55,1.9,.58],mats.trim);
      box(scene,"velvet-rose-hearth-opening",[x-2.5,1.0,z+.67],[1.55,1.05,.07],black);
      box(scene,"velvet-rose-hearth-mantel",[x-2.5,2.0,z+.58],[2.95,.18,.68],rosewood);
      const hearthEmber=mat(scene,"velvet-rose-hearth-ember",new Color3(1,.19,.035),.35);
      hearthEmber.emissiveColor=new Color3(.9,.12,.02);
      const hearthFire=MeshBuilder.CreateSphere("velvet-rose-hearth-fire",{diameter:.72,segments:10},scene);
      hearthFire.position.set(x-2.5,1.02,z+.61);hearthFire.scaling.set(1,.72,.16);hearthFire.material=hearthEmber;
      box(scene,"velvet-rose-piano-body",[x+5.7,.82,z+2.0],[2.65,.72,1.15],black);
      box(scene,"velvet-rose-piano-lid",[x+5.7,1.22,z+1.95],[2.72,.12,1.22],rosewood);
      for(let key=0;key<14;key++)
        box(scene,"velvet-rose-piano-key",[x+4.58+key*.17,1.30,z+1.34],[.145,.055,.34],key%7===0?linen:mats.trim);
      for(const legX of [x+4.65,x+6.75])
        box(scene,"velvet-rose-piano-leg",[legX,.42,z+2.0],[.12,.82,.12],black);
      box(scene,"velvet-rose-piano-stool",[x+5.7,.52,z+3.0],[1.05,.22,.55],wine);
      // A little everyday clutter: stacked wine crates, a handcart and a laundry basket.
      for(let row=0;row<2;row++) for(let col=0;col<2;col++) {
        const cx=x-1.0+col*.72,cz=z+4.6+row*.68;
        box(scene,"velvet-rose-wine-crate",[cx,.48+row*.72,cz],[.66,.72,.62],rosewood);
        for(let slat=0;slat<3;slat++)
          box(scene,"velvet-rose-crate-slat",[cx-.22+slat*.22,.48+row*.72,cz-.33],[.055,.62,.035],mutedGold);
      }
      box(scene,"velvet-rose-laundry-basket",[x+7.0,.43,z+4.7],[1.05,.72,.88],rosewood);
      for(let fold=0;fold<3;fold++)
        box(scene,"velvet-rose-folded-linen",[x+6.8+fold*.18,.84,z+4.68],[.48,.12,.56],linen);
      // Service nook behind the public lounge: washbasin, shelves, pantry jars and a staff bench.
      box(scene,"velvet-rose-service-partition",[x,2.35,z-d*.43],[w-1,.16,.24],rosewood);
      box(scene,"velvet-rose-service-side-partition",[x+6.5,2.1,z-d*.24],[.18,4.0,3.1],plaster);
      box(scene,"velvet-rose-service-worktable",[x+2.2,1.05,z-d*.35],[4.3,.18,1.25],rosewood);
      for(let j=0;j<3;j++) {
        box(scene,"velvet-rose-service-shelf",[x-5.0+j*.2,2.8,z-d*.47],[.14,1.7,.48],rosewood);
        cylinder(scene,"velvet-rose-pantry-jar",[x-5.0+j*.2,3.15,z-d*.43],.22,.48,j%2?plum:linen,12);
      }
      cylinder(scene,"velvet-rose-washbasin-bowl",[x+4.9,.92,z-d*.32],.82,.22,mats.trim,20);
      cylinder(scene,"velvet-rose-washbasin-pedestal",[x+4.9,.47,z-d*.32],.34,.72,rosewood,12);
      box(scene,"velvet-rose-staff-bench",[x+2.0,.56,z-d*.38],[2.7,.24,.68],rosewood);
      // Upper floor: a compact timber gallery with three private chambers, deliberately
      // more modest than the public salon. The staircase and railing make the second
      // storey legible from below, while the rooms carry distinct fabrics and furnishings.
      const upperY=4.45;
      // The stair is tucked along the left-hand side, several metres beyond the
      // entrance, rather than appearing directly in the doorway.
      // A long opening follows the stair flight; the upper landing joins a clear gallery.
      box(scene,"velvet-rose-upper-floor-left",[x-8.05,upperY,z-2.45],[.9,.24,11.0],rosewood);
      box(scene,"velvet-rose-upper-floor-right",[x+2.0,upperY,z-2.45],[13.0,.24,11.0],rosewood);
      box(scene,"velvet-rose-upper-floor-front",[x+2.0,upperY,z+.05],[13.0,.24,.8],rosewood);
      box(scene,"velvet-rose-upper-floor-back",[x+2.0,upperY,z-6.45],[13.0,.24,.8],rosewood);
      box(scene,"velvet-rose-upper-gallery-rug",[x+3.0,upperY+.16,z-3.0],[8.0,.035,5.4],dustyRose);
      box(scene,"velvet-rose-upper-back-wall",[x,upperY+1.7,z-d*.46],[w-1.3,3.3,.22],plaster);
      box(scene,"velvet-rose-upper-left-wall",[x-w*.46,upperY+1.65,z-2.45],[.20,3.2,5.7],rosewood);
      box(scene,"velvet-rose-upper-right-wall",[x+w*.46,upperY+1.65,z-2.45],[.20,3.2,5.7],rosewood);
      const roseStairCenterX=x-6.3;
      const roseStairStartZ=z+1.5;
      const roseStairEndZ=z-6.2;
      // A side stair begins deeper inside the lounge, away from the entrance sightline.
      for(let step=0;step<12;step++) {
        const progress=(step+1)/12;
        const rise=4.45/12;
        const treadZ=roseStairStartZ-progress*7.7;
        const tread=box(scene,"velvet-rose-rebuilt-stair-tread",[roseStairCenterX,(step+1)*rise-.12,treadZ],[2.45,.24,.70],step%2?rosewood:mats.woodLight);
        tread.isPickable=false;
        const nosing=box(scene,"velvet-rose-stair-brass-nosing",[roseStairCenterX,(step+1)*rise+.015,treadZ+.30],[2.38,.055,.075],mutedGold);
        nosing.isPickable=false;
        const riser=box(scene,"velvet-rose-stair-riser",[roseStairCenterX,(step+.5)*rise,treadZ+.30],[2.38,rise,.12],rosewood);
        riser.isPickable=false;
      }
      for(const side of [-1,1]) {
        const stringer=box(scene,"velvet-rose-rebuilt-stair-stringer",[roseStairCenterX+side*1.32,2.22,(roseStairStartZ+roseStairEndZ)/2],[.22,.28,8.0],rosewood);
        stringer.rotation.x=.524;
        for(let rail=0;rail<12;rail++) {
          const progress=rail/11;
          box(scene,"velvet-rose-rebuilt-stair-post",[roseStairCenterX+side*1.32,.525+progress*4.45,roseStairStartZ-progress*7.7],[.13,.95,.13],mutedGold);
        }
        const handrail=box(scene,"velvet-rose-rebuilt-stair-handrail",[roseStairCenterX+side*1.32,3.225,(roseStairStartZ+roseStairEndZ)/2],[.18,.18,7.85],rosewood);
        handrail.rotation.x=.524;
      }
      box(scene,"velvet-rose-rebuilt-stair-top-landing",[roseStairCenterX,upperY-.06,roseStairEndZ-.35],[3.0,.22,1.8],rosewood);
      // Keep the stair-to-gallery mouth completely open: no cross-rail blocks the landing.
      // Guard the exposed front edge of the upper gallery instead.
      for(let rail=0;rail<16;rail++) {
        const gx=x-4.25+rail*.85;
        box(scene,"velvet-rose-upper-edge-guard-post",[gx,upperY+.55,z+.45],[.11,1.05,.11],mutedGold);
      }
      box(scene,"velvet-rose-upper-edge-guard-top",[x+2.125,upperY+1.08,z+.45],[13.0,.14,.16],rosewood);
      box(scene,"velvet-rose-upper-edge-guard-mid",[x+2.125,upperY+.42,z+.45],[13.0,.09,.12],mutedGold);
      // Two clearly readable private suites replace the cramped row of three bays.
      // Each has an unmistakable bed, bedside lamps, wardrobe, vanity and a named entrance.
      for(let room=0;room<2;room++) {
        const rx=room===0?89.0:95.0,rz=z-2.85;
        const bedFabric=room===0?wine:plum;
        const roomRug=room===0?dustyRose:wine;
        box(scene,"velvet-rose-suite-rug",[rx,upperY+.17,rz+.1],[5.0,.045,5.0],roomRug);
        // Layered bed frame, stitched mattress edge, pillows and a carved headboard.
        box(scene,"velvet-rose-upper-bed-base",[rx,upperY+.48,rz],[2.9,.42,2.3],rosewood);
        box(scene,"velvet-rose-upper-bed-base-inlay",[rx,upperY+.70,rz],[2.72,.075,2.12],mutedGold);
        for(const dx of [-1.22,1.22]) for(const dz of [-.92,.92]) {
          box(scene,"velvet-rose-upper-bed-foot",[rx+dx,upperY+.34,rz+dz],[.20,.62,.20],rosewood);
          cylinder(scene,"velvet-rose-upper-bed-foot-cap",[rx+dx,upperY+.62,rz+dz],.24,.12,brass,10);
        }
        box(scene,"velvet-rose-upper-mattress",[rx,upperY+.82,rz+.08],[2.62,.34,2.02],linen);
        box(scene,"velvet-rose-upper-mattress-piping",[rx,upperY+1.0,rz+.08],[2.66,.055,2.06],wineLight);
        box(scene,"velvet-rose-upper-coverlet",[rx,upperY+1.04,rz+.42],[2.52,.16,1.28],bedFabric);
        box(scene,"velvet-rose-upper-coverlet-fold",[rx,upperY+1.14,rz-.12],[2.52,.10,.30],wineLight);
        box(scene,"velvet-rose-upper-bed-runner",[rx,upperY+1.14,rz+.94],[2.45,.08,.30],roomRug);
        box(scene,"velvet-rose-upper-pillow-left",[rx-.63,upperY+1.12,rz-.62],[.92,.22,.52],linen);
        box(scene,"velvet-rose-upper-pillow-right",[rx+.63,upperY+1.12,rz-.62],[.92,.22,.52],linen);
        for(const px of [-.63,.63]) {
          box(scene,"velvet-rose-upper-pillow-piping",[rx+px,upperY+1.24,rz-.62],[.86,.035,.46],wineLight);
          box(scene,"velvet-rose-upper-pillow-tassel",[rx+px-.40,upperY+1.14,rz-.62],[.08,.12,.08],mutedGold);
        }
        box(scene,"velvet-rose-upper-headboard",[rx,upperY+1.45,rz-1.10],[2.85,1.35,.24],bedFabric);
        box(scene,"velvet-rose-upper-headboard-panel",[rx,upperY+1.48,rz-1.245],[2.35,.94,.055],rosewood);
        box(scene,"velvet-rose-upper-headboard-inset",[rx,upperY+1.48,rz-1.28],[2.08,.70,.035],bedFabric);
        for(const dx of [-1.0,1.0])
          cylinder(scene,"velvet-rose-upper-headboard-rosette",[rx+dx,upperY+1.48,rz-1.33],.22,.08,brass,12);
        // Four turned uprights, a complete canopy frame and gathered velvet drapes.
        for(const dx of [-1.35,1.35]) for(const dz of [-1.05,1.05]) {
          box(scene,"velvet-rose-upper-canopy-post",[rx+dx,upperY+1.78,rz+dz],[.17,2.9,.17],mutedGold);
          cylinder(scene,"velvet-rose-upper-canopy-finial",[rx+dx,upperY+3.27,rz+dz],.24,.24,brass,12);
          cylinder(scene,"velvet-rose-upper-canopy-post-collar",[rx+dx,upperY+2.85,rz+dz],.22,.12,brass,12);
        }
        box(scene,"velvet-rose-upper-canopy-rail-long-front",[rx,upperY+3.18,rz-1.05],[2.95,.16,.18],mutedGold);
        box(scene,"velvet-rose-upper-canopy-rail-long-back",[rx,upperY+3.18,rz+1.05],[2.95,.16,.18],mutedGold);
        box(scene,"velvet-rose-upper-canopy-rail-side-left",[rx-1.35,upperY+3.18,rz],[.18,.16,2.15],mutedGold);
        box(scene,"velvet-rose-upper-canopy-rail-side-right",[rx+1.35,upperY+3.18,rz],[.18,.16,2.15],mutedGold);
        box(scene,"velvet-rose-upper-canopy-cloth",[rx,upperY+3.08,rz],[2.72,.10,1.92],bedFabric);
        box(scene,"velvet-rose-upper-canopy-inset",[rx,upperY+3.145,rz],[2.34,.035,1.54],roomRug);
        for(const dz of [-.78,.78]) {
          box(scene,"velvet-rose-upper-canopy-curtain-front",[rx,upperY+2.12,rz+dz],[2.55,2.0,.12],bedFabric);
          for(let pleat=0;pleat<9;pleat++)
            box(scene,"velvet-rose-upper-canopy-pleat-front",[rx-1.12+pleat*.28,upperY+2.12,rz+dz*.99],[.045,1.9,.15],wineLight);
        }
        for(const dx of [-1.25,1.25]) {
          box(scene,"velvet-rose-upper-canopy-curtain-side",[rx+dx,upperY+2.12,rz],[.12,2.0,1.78],bedFabric);
          for(let pleat=0;pleat<7;pleat++)
            box(scene,"velvet-rose-upper-canopy-pleat-side",[rx+dx*.99,upperY+2.12,rz-.72+pleat*.24],[.15,1.9,.045],wineLight);
        }
        for(const dx of [-1.25,1.25]) for(const dz of [-.72,.72]) {
          cylinder(scene,"velvet-rose-upper-canopy-curtain-tie",[rx+dx,upperY+1.62,rz+dz],.10,.34,brass,10);
          const tassel=MeshBuilder.CreateSphere("velvet-rose-upper-canopy-tassel",{diameter:.16,segments:8},scene);
          tassel.position.set(rx+dx,upperY+1.38,rz+dz);tassel.material=wineLight;
        }
        for(const dx of [-1.85,1.85]) {
          box(scene,"velvet-rose-upper-nightstand",[rx+dx,upperY+.68,rz-.35],[.72,.95,.72],rosewood);
          box(scene,"velvet-rose-upper-nightstand-top",[rx+dx,upperY+1.18,rz-.35],[.82,.10,.82],mutedGold);
          cylinder(scene,"velvet-rose-upper-bedside-lamp-base",[rx+dx,upperY+1.28,rz-.35],.28,.10,brass,12);
          cylinder(scene,"velvet-rose-upper-bedside-lamp-shade",[rx+dx,upperY+1.57,rz-.35],.36,.42,candleGlow,12);
        }
        box(scene,"velvet-rose-upper-vanity",[rx-1.35,upperY+.92,rz+2.05],[1.75,.18,.68],rosewood);
        box(scene,"velvet-rose-upper-vanity-mirror-frame",[rx-1.35,upperY+2.0,rz+1.72],[1.05,1.55,.16],mutedGold);
        box(scene,"velvet-rose-upper-vanity-mirror",[rx-1.35,upperY+2.0,rz+1.62],[.82,1.3,.055],mirror);
        for(let bottle=0;bottle<4;bottle++)
          cylinder(scene,"velvet-rose-upper-perfume-bottle",[rx-.85+bottle*.27,upperY+1.12,rz+2.05],.11,.32,bottle%2?wineLight:plum,10);
        box(scene,"velvet-rose-upper-chair",[rx+1.25,upperY+.52,rz+2.1],[.82,.18,.82],bedFabric);
        box(scene,"velvet-rose-upper-chair-back",[rx+1.25,upperY+1.12,rz+2.48],[.82,1.1,.16],bedFabric);
        box(scene,"velvet-rose-upper-wardrobe",[rx+2.0,upperY+1.45,rz-.15],[.62,2.65,1.25],rosewood);
        for(let door=0;door<2;door++) {
          box(scene,"velvet-rose-upper-wardrobe-panel",[rx+1.83+door*.34,upperY+1.45,rz-.80],[.29,2.35,.055],mutedGold);
          cylinder(scene,"velvet-rose-upper-wardrobe-knob",[rx+1.97+door*.34,upperY+1.4,rz-.87],.09,.08,brass,10);
        }
        // Large brass-framed name plaque above the open suite entrance.
        box(scene,"velvet-rose-upper-suite-signboard",[rx,upperY+2.45,z+.75],[3.2,.82,.16],rosewood);
        box(scene,"velvet-rose-upper-suite-sign-trim",[rx,upperY+2.45,z+.65],[3.0,.64,.045],mutedGold);
        const suiteTex=new DynamicTexture("velvet-rose-suite-title-"+room,{width:512,height:128},scene,false);
        const suiteCtx=suiteTex.getContext();
        suiteCtx.fillStyle="#24131a";suiteCtx.fillRect(0,0,512,128);
        suiteCtx.strokeStyle="#c99c58";suiteCtx.lineWidth=7;suiteCtx.strokeRect(7,7,498,114);
        suiteCtx.fillStyle="#f2dfc2";suiteCtx.font="bold 46px Georgia";suiteCtx.textAlign="center";suiteCtx.textBaseline="middle";
        suiteCtx.fillText(room===0?"THE ROSE SUITE":"THE GARNET SUITE",256,66);
        suiteTex.update();
        const suiteMat=new StandardMaterial("velvet-rose-suite-title-mat-"+room,scene);
        suiteMat.diffuseTexture=suiteTex;suiteMat.emissiveColor=new Color3(.24,.13,.07);
        const suiteFace=MeshBuilder.CreatePlane("velvet-rose-suite-title-face",{width:3.0,height:.64},scene);
        suiteFace.position.set(rx,upperY+2.45,z+.61);suiteFace.material=suiteMat;suiteFace.isPickable=false;
      }
      // A small shared dressing gallery makes the upper floor read as a real inn suite.
      box(scene,"velvet-rose-upper-gallery-console",[x+3.0,upperY+.78,z+.8],[2.6,1.35,.62],rosewood);
      box(scene,"velvet-rose-upper-gallery-console-top",[x+3.0,upperY+1.5,z+.8],[2.85,.12,.78],mutedGold);
      for(let vase=0;vase<3;vase++) {
        cylinder(scene,"velvet-rose-upper-gallery-vase",[x+2.2+vase*.8,upperY+1.78,z+.8],.24,.48,vase===1?wineLight:plum,12);
      }
      // A clearly marked landing rail and a warm pendant light identify the stair arrival.
      box(scene,"velvet-rose-upper-landing-post",[x-6.3,upperY+.55,z-15.25],[.14,1.0,.14],mutedGold);
      box(scene,"velvet-rose-upper-landing-rail",[x-6.3,upperY+1.05,z-15.25],[2.6,.12,.14],mutedGold);
      // Thick curtains soften the small upper windows; their warm glow is visible from the alley.
      for(const wx of [x-5.2,x,x+5.2]) {
        box(scene,"velvet-rose-upper-window-curtain-left",[wx-.55,upperY+2.25,z+d*.47],[.38,2.5,.16],wine);
        box(scene,"velvet-rose-upper-window-curtain-right",[wx+.55,upperY+2.25,z+d*.47],[.38,2.5,.16],wine);
      }
      // No hanging sign: a discreet rose motif is set into the door surround instead.
      const roseCrest=MeshBuilder.CreateTorus("velvet-rose-door-rose-crest",{diameter:.72,thickness:.09,tessellation:16},scene);
      roseCrest.position.set(x,3.25,z+d/2-.52);roseCrest.rotation.x=Math.PI/2;roseCrest.material=mutedGold;
      for(let petal=0;petal<5;petal++) {
        const a=petal*Math.PI*2/5;
        const petalMesh=MeshBuilder.CreateSphere("velvet-rose-door-rose-petal",{diameter:.18,segments:8},scene);
        petalMesh.position.set(x+Math.cos(a)*.22,3.25+Math.sin(a)*.22,z+d/2-.53);
        petalMesh.material=wineLight;
      }
      // Closed private-room doors hint at a larger establishment beyond the lounge.
      for(let side of [-1,1]) {
        const dx=x+side*3.8, dz=z-d/2+.55;
        box(scene,"velvet-rose-private-door-frame",[dx,2.05,dz],[2.5,4.0,.28],brass);
        box(scene,"velvet-rose-private-door",[dx,2.0,dz+.18],[2.18,3.72,.16],wine);
        box(scene,"velvet-rose-private-door-panel",[dx,2.0,dz+.075],[1.55,2.8,.08],black);
        const knob=MeshBuilder.CreateSphere("velvet-rose-private-door-knob",{diameter:.16,segments:10},scene);
        knob.position.set(dx+.72,1.8,dz-.02);knob.material=brass;
      }
      obstacles.push({x:x,z:z-d*.34,r:2.5});
    } else if(name==="The Copper Stag Tavern" || name==="The Lantern and Lark" || name==="The Fox and Fir") {
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
      // Add the lived-in details of a busy coaching inn: carved table runners,
      // plates, bread, wall trophies, iron pot hooks and warm timber rafters.
      const tavernOak=mat(scene,name+"-aged-oak",new Color3(.22,.125,.067),.86);
      const tavernLeather=mat(scene,name+"-oxblood-leather",new Color3(.30,.075,.055),.92);
      const tavernCopper=mat(scene,name+"-hammered-copper",new Color3(.58,.31,.13),.38,.7);
      const tavernParchment=mat(scene,name+"-menu-parchment",new Color3(.83,.72,.53),.96);
      box(scene,name+"-hearth-rug",[hx+3.7,.105,hz+3.7],[5.4,.055,3.0],tavernLeather);
      for(let i=0;i<3;i++) {
        const tx=x-4.5+i*3.0,tz=z+1.25;
        box(scene,name+"-table-runner",[tx,1.095,tz],[1.52,.025,1.12],tavernLeather);
        cylinder(scene,name+"-bread-board",[tx-.34,1.19,tz+.20],.48,.045,tavernOak,16);
        box(scene,name+"-fresh-loaf",[tx-.34,1.32,tz+.20],[.46,.17,.24],tavernParchment);
        cylinder(scene,name+"-stew-bowl",[tx+.38,1.20,tz-.20],.38,.12,mats.trim,16);
        for(let side of [-1,1]) {
          const stoolX=tx+side*1.18;
          box(scene,name+"-stool-leather-seat",[stoolX,.76,tz],[.72,.18,.72],tavernLeather);
          for(const dx of [-.25,.25])for(const dz of [-.25,.25])
            box(scene,name+"-stool-leg",[stoolX+dx,.38,tz+dz],[.10,.72,.10],tavernOak);
        }
      }
      // A proper menu, framed inn emblem and iron pot rack distinguish each inn.
      box(scene,name+"-menu-frame",[x+w*.31,4.15,z+d*.34],[.18,2.35,1.65],tavernOak);
      box(scene,name+"-menu-sheet",[x+w*.31-.11,4.15,z+d*.34],[.055,1.95,1.25],tavernParchment);
      for(let row=0;row<5;row++)
        box(scene,name+"-menu-ink-line",[x+w*.31-.15,3.55+row*.28,z+d*.34],[.035,.035,.82-(row%2)*.18],tavernOak);
      for(let side of [-1,1]) {
        const sx=x+side*(w/2-.35),sz=z+1.2;
        box(scene,name+"-iron-wall-sconce-arm",[sx-side*.22,5.1,sz],[.52,.12,.12],tavernOak);
        const sconce=MeshBuilder.CreateSphere(name+"-iron-wall-sconce-glow",{diameter:.30,segments:8},scene);
        sconce.position.set(sx-side*.38,5.18,sz);sconce.material=mats.lantern;sconce.isPickable=false;
        box(scene,name+"-timber-wall-beam",[x+side*(w/2-.55),h*.55,z],[.18,.22,d-.8],tavernOak);
      }
      for(let zz=z-d*.30;zz<=z+d*.30;zz+=4.2)
        box(scene,name+"-exposed-ceiling-rafter",[x,h-.32,zz],[w-.7,.30,.38],tavernOak);
      for(let j=0;j<3;j++) {
        const pot=MeshBuilder.CreateCylinder(name+"-hanging-copper-pot",{diameterTop:.38,diameterBottom:.58,height:.52,tessellation:12},scene);
        pot.position.set(x-2.8+j*1.0,5.65,z-d*.12);pot.material=tavernCopper;
        cylinder(scene,name+"-pot-hook",[x-2.8+j*1.0,6.0,z-d*.12],.045,.55,tavernOak,8);
      }
    } else if(name==="Adventurers Guild") {
      // A bustling, warm timber guild inspired by classic fantasy adventurer halls:
      // a broad reception counter, crowded quest wall, long communal tables and trophies.
      box(scene,"guild-reception-counter",[x,1.35,z-d/2+2.4],[9.2,1.7,1.15],mats.woodLight);
      obstacles.push({x,z:z-d/2+2.4,r:3.2});
      box(scene,"guild-counter-front-panel",[x,1.35,z-d/2+1.80],[8.0,.95,.08],mats.gold);
      for(let i=0;i<5;i++) {
        box(scene,"guild-counter-post",[x-4+i*2,2.0,z-d/2+1.78],[.12,1.25,.12],mats.wood);
        const ledger=box(scene,"guild-counter-ledger",[x-3.2+i*1.6,2.24,z-d/2+2.0],[.55,.05,.38],mats.trim);
      }
      // Oversized wooden quest board with parchment notices, seals and crossed swords.
      box(scene,"guild-interior-mission-board",[x,7.0,z-d/2+.42],[10.0,5.4,.32],mats.wood);
      box(scene,"guild-quest-board-inner",[x,7.0,z-d/2+.22],[9.2,4.65,.08],mats.floor);
      for(let i=0;i<5;i++) {
        const px=x-3.8+(i%3)*3.8, py=6.5+Math.floor(i/3)*1.45;
        box(scene,"guild-mission-paper",[px,py,z-d/2+.13],[2.2,2.1,.05],mats.trim);
        box(scene,"guild-mission-red-seal",[px+.72,py-.58,z-d/2+.08],[.24,.24,.07],mats.flowers);
        box(scene,"guild-mission-ink-line",[px,py+.18,z-d/2+.075],[1.45,.045,.04],mats.wood);
      }
      // A broad map table sits to the left; adventurers can gather around it.
      box(scene,"guild-map-table",[x-8,1.05,z+1.0],[4.2,.28,3.0],mats.wood);
      box(scene,"guild-map-table-map",[x-8,1.22,z+1.0],[3.65,.035,2.4],mats.banner);
      for(let side of [-1,1]) {
        // Trophy racks, shields and weapon displays along the side walls.
        box(scene,"guild-weapon-rack",[x+side*12.1,3.0,z],[.35,4.4,.5],mats.wood);
        for(let j=0;j<4;j++) {
          const blade=box(scene,"guild-display-sword",[x+side*12.1,2.8,z-2.1+j*1.35],[.11,2.65,.14],mats.gold);
          blade.rotation.z=(j%2?-.10:.10);
          box(scene,"guild-sword-crossguard",[x+side*12.1,2.25,z-2.1+j*1.35],[.85,.13,.2],mats.woodLight);
        }
        const shield=MeshBuilder.CreateCylinder("guild-wall-shield",{diameter:1.65,height:.22,tessellation:6},scene);
        shield.position.set(x+side*12.0,6.0,z+5.1);shield.rotation.x=Math.PI/2;shield.material=mats.banner;
        const crest=MeshBuilder.CreateCylinder("guild-shield-crest",{diameter:.68,height:.25,tessellation:6},scene);
        crest.position.set(x+side*12.0,6.0,z+4.95);crest.rotation.x=Math.PI/2;crest.material=mats.gold;
        box(scene,"guild-hall-banner",[x+side*11.4,8.3,z-1.0],[1.35,4.4,.14],mats.banner);
      }
      // A broad hearth gives the hall the welcoming, tavern-like atmosphere of a fantasy guild.
      box(scene,"guild-hearth-surround",[x+8.8,2.1,z+7.8],[4.8,4.2,.75],mats.trim);
      box(scene,"guild-hearth-opening",[x+8.8,1.9,z+7.36],[3.0,2.25,.08],mats.dark);
      box(scene,"guild-hearth-mantel",[x+8.8,4.35,z+7.25],[5.3,.28,1.0],mats.woodLight);
      const guildFire=MeshBuilder.CreateSphere("guild-hearth-fire",{diameter:1.2,segments:12},scene);
      guildFire.position.set(x+8.8,1.95,z+7.22);guildFire.scaling.set(1.2,1.0,.22);guildFire.material=mats.lantern;
      // Heavy exposed rafters and a large iron chandelier make the ceiling feel lofty.
      for(let zz=z-d/2+4;zz<z+d/2-1;zz+=4.0) {
        box(scene,"guild-ceiling-rafter",[x,h-.28,zz],[w-.8,.42,.55],mats.wood);
      }
      const guildRing=MeshBuilder.CreateTorus("guild-grand-chandelier",{diameter:4.4,thickness:.16,tessellation:24},scene);
      guildRing.position.set(x, h-1.5,z);guildRing.material=mats.gold;
      for(let i=0;i<8;i++) {
        const angle=i*Math.PI/4;
        const candle=MeshBuilder.CreateCylinder("guild-chandelier-candle",{diameter:.16,height:.75,tessellation:8},scene);
        candle.position.set(x+Math.cos(angle)*2.0,h-1.25,z+Math.sin(angle)*2.0);candle.material=mats.trim;
        const flame=MeshBuilder.CreateSphere("guild-chandelier-flame",{diameter:.2,segments:8},scene);
        flame.position.set(x+Math.cos(angle)*2.0,h-.82,z+Math.sin(angle)*2.0);flame.material=mats.lantern;
      }
      // Framed notices and trophy plaques fill the high walls without cluttering walkways.
      for(let side of [-1,1]) for(let i=0;i<3;i++) {
        box(scene,"guild-framed-notice",[x+side*13.25,5.8,z-5+i*4.2],[.12,1.8,2.2],mats.gold);
      }
      // Rich, lived-in guild interior: communal tables, bench seating, food, drink and gear.
      const guildOak=mat(scene,"guild-dark-oak",new Color3(.19,.105,.058),.82);
      const guildLeather=mat(scene,"guild-worn-leather",new Color3(.28,.105,.055),.9);
      const guildIron=mat(scene,"guild-blackened-iron",new Color3(.12,.13,.13),.42,.72);
      const guildParchment=mat(scene,"guild-aged-parchment",new Color3(.79,.68,.48),.98);
      const guildCopper=mat(scene,"guild-copper",new Color3(.55,.29,.12),.34,.72);
      // Four communal tables form the social heart of the guild, leaving a central aisle.
      for(let row=0;row<2;row++) for(let side of [-1,1]) {
        const tx=x+side*4.0, tz=z+2.0-row*6.2;
        box(scene,"guild-communal-table-top",[tx,1.08,tz],[3.9,.24,1.75],guildOak);
        box(scene,"guild-table-inlay",[tx,1.205,tz],[3.35,.025,1.28],mats.woodLight);
        for(let dx of [-1.55,1.55]) for(let dz of [-.62,.62])
          box(scene,"guild-table-leg",[tx+dx,.55,tz+dz],[.2,1.0,.2],guildOak);
        for(let side2 of [-1,1]) {
          box(scene,"guild-long-bench-seat",[tx, .66,tz+side2*1.28],[3.55,.22,.48],guildOak);
          for(let dx of [-1.35,0,1.35])
            box(scene,"guild-bench-support",[tx+dx,.34,tz+side2*1.28],[.16,.65,.16],guildOak);
        }
        // Tankards, plates, bread and a small candle make the tables feel occupied.
        for(let place=0;place<3;place++) {
          const px=tx-1.25+place*1.25;
          const mug=MeshBuilder.CreateCylinder("guild-pewter-tankard",{diameterTop:.28,diameterBottom:.22,height:.42,tessellation:12},scene);
          mug.position.set(px,1.43,tz-.36);mug.material=guildCopper;
          const handle=MeshBuilder.CreateTorus("guild-tankard-handle",{diameter:.22,thickness:.055,tessellation:12},scene);
          handle.position.set(px+.17,1.46,tz-.36);handle.rotation.y=Math.PI/2;handle.material=guildCopper;
          const plate=MeshBuilder.CreateCylinder("guild-ceramic-plate",{diameter:.52,height:.055,tessellation:16},scene);
          plate.position.set(px,1.25,tz+.35);plate.material=mats.trim;
          box(scene,"guild-loaf-of-bread",[px,1.39,tz+.35],[.42,.18,.2],guildParchment);
        }
        const candle=MeshBuilder.CreateCylinder("guild-table-candle",{diameter:.10,height:.42,tessellation:8},scene);
        candle.position.set(tx,1.43,tz);candle.material=mats.trim;
        const glow=MeshBuilder.CreateSphere("guild-table-candle-flame",{diameter:.14,segments:8},scene);
        glow.position.set(tx,1.70,tz);glow.material=mats.lantern;
      }
      // A side-wall drinks cabinet with casks, bottles and shelves.
      box(scene,"guild-drinks-cabinet",[x+12.65,3.0,z+1.4],[.48,5.5,5.8],guildOak);
      for(let level=0;level<3;level++) {
        box(scene,"guild-drinks-shelf",[x+12.3,1.35+level*1.65,z+1.4],[.8,.16,5.6],mats.woodLight);
        for(let bottle=0;bottle<5;bottle++) {
          const bx=x+12.05, bz=z-.65+bottle*1.0;
          const bottleMesh=MeshBuilder.CreateCylinder("guild-potion-bottle",{diameterTop:.16,diameterBottom:.28,height:.72,tessellation:10},scene);
          bottleMesh.position.set(bx,1.82+level*1.65,bz);bottleMesh.material=[mats.green,mats.glass,guildCopper][(bottle+level)%3];
          const stopper=MeshBuilder.CreateSphere("guild-bottle-stopper",{diameter:.16,segments:8},scene);
          stopper.position.set(bx,2.22+level*1.65,bz);stopper.material=guildOak;
        }
      }
      // A proper guildmaster's desk beside the reception, with ledgers and a bell.
      box(scene,"guildmaster-writing-desk",[x-9.0,1.05,z-d/2+5.4],[3.5,.24,1.65],guildOak);
      for(let dx of [-1.45,1.45]) for(let dz of [-.62,.62])
        box(scene,"guildmaster-desk-leg",[x-9+dx,.52,z-d/2+5.4+dz],[.16,1.0,.16],guildOak);
      box(scene,"guildmaster-ledger",[x-9,1.22,z-d/2+5.25],[.8,.12,.62],guildParchment);
      const bell=MeshBuilder.CreateSphere("guildmaster-bell",{diameter:.24,segments:12},scene);
      bell.position.set(x-7.9,1.38,z-d/2+5.65);bell.material=guildCopper;
      // Fireplace details: stone hearth, stacked logs, iron tools and a carved mantel crest.
      for(let log=0;log<3;log++) {
        const woodLog=MeshBuilder.CreateCylinder("guild-hearth-log",{diameter:.18,height:1.6,tessellation:8},scene);
        woodLog.position.set(x+8.8+(log-1)*.25,1.12,z+7.0);woodLog.rotation.z=Math.PI/2;woodLog.material=guildOak;
      }
      for(let side of [-1,1]) {
        const poker=MeshBuilder.CreateCylinder("guild-fireplace-tool",{diameter:.055,height:1.75,tessellation:8},scene);
        poker.position.set(x+8.8+side*2.5,1.45,z+7.05);poker.rotation.z=side*.12;poker.material=guildIron;
      }
      box(scene,"guild-fireplace-stone-hearth",[x+8.8,.32,z+7.1],[5.0,.35,1.5],mats.trim);
      const crest=MeshBuilder.CreateCylinder("guild-hearth-crest",{diameter:1.25,height:.18,tessellation:6},scene);
      crest.position.set(x+8.8,5.35,z+7.28);crest.rotation.x=Math.PI/2;crest.material=mats.gold;
      // Carved timber trusses, diagonal braces and a high central ridge.
      for(let zz=z-d/2+2.8;zz<=z+d/2-2.8;zz+=4.5) {
        for(let side of [-1,1]) {
          const brace=box(scene,"guild-roof-truss-brace",[x+side*5.2,h-2.0,zz],[.28,4.2,.32],guildOak);
          brace.rotation.z=side*.62;
        }
        box(scene,"guild-roof-truss-crossbeam",[x,h-3.9,zz],[w-1.2,.32,.42],guildOak);
      }
      // Hanging iron lanterns and warm wall sconces add pools of amber light.
      for(let side of [-1,1]) for(let zz of [z-5,z+2,z+7]) {
        box(scene,"guild-wall-sconce-bracket",[x+side*13.1,5.4,zz],[.8,.14,.14],guildIron);
        const sconce=MeshBuilder.CreateSphere("guild-wall-sconce-glow",{diameter:.38,segments:10},scene);
        sconce.position.set(x+side*12.7,5.05,zz);sconce.material=mats.lantern;
      }
      for(let i=0;i<3;i++) {
        const chain=MeshBuilder.CreateCylinder("guild-pendant-chain",{diameter:.055,height:2.2,tessellation:8},scene);
        chain.position.set(x-7+i*7,h-2.0,z-1.5);chain.material=guildIron;
        const lamp=MeshBuilder.CreateCylinder("guild-pendant-lantern",{diameterTop:.35,diameterBottom:.72,height:.72,tessellation:8},scene);
        lamp.position.set(x-7+i*7,h-3.25,z-1.5);lamp.material=mats.gold;
        const lampGlow=MeshBuilder.CreateSphere("guild-pendant-glow",{diameter:.26,segments:8},scene);
        lampGlow.position.set(x-7+i*7,h-3.72,z-1.5);lampGlow.material=mats.lantern;
      }
      // Trophy details: monster claws, horns and a framed adventurer's map.
      for(let side of [-1,1]) {
        const trophyPlaque=box(scene,"guild-trophy-plaque",[x+side*13.0,8.6,z+5.0],[.18,1.5,2.2],guildOak);
        for(let horn=0;horn<2;horn++) {
          const tusk=MeshBuilder.CreateCylinder("guild-monster-trophy-horn",{diameterTop:.025,diameterBottom:.22,height:1.15,tessellation:8},scene);
          tusk.position.set(x+side*12.82,8.8,z+4.55+horn*.85);tusk.rotation.z=horn===0?.28:-.28;tusk.material=guildParchment;
        }
      }
      // A campaign map, marked with brass route pins, makes the guild feel actively used.
      box(scene,"guild-war-map-frame",[x-8,1.42,z+1.0],[3.65,.08,2.42],guildOak);
      for(let pin=0;pin<9;pin++) {
        const px=x-9.25+(pin%3)*1.25,pz=z+.25+Math.floor(pin/3)*.68;
        const marker=MeshBuilder.CreateSphere("guild-map-brass-route-pin",{diameter:.13,segments:8},scene);
        marker.position.set(px,1.50,pz);marker.material=guildCopper;marker.isPickable=false;
      }
      // Decorative timber posts and carved capitals frame the quest wall.
      for(let side of [-1,1]) {
        box(scene,"guild-quest-wall-pillar",[x+side*5.4,7.0,z-d/2+.75],[.34,9.5,.42],guildOak);
        box(scene,"guild-quest-wall-capital",[x+side*5.4,11.8,z-d/2+.75],[.8,.35,.72],mats.gold);
      }
      // Scrolls pinned to the board get wooden rollers and colored wax seals.
      for(let i=0;i<5;i++) {
        const px=x-3.8+(i%3)*3.8, py=6.5+Math.floor(i/3)*1.45;
        box(scene,"guild-notice-parchment",[px,py,z-d/2+.095],[1.75,1.55,.055],guildParchment);
        for(let edge of [-1,1]) {
          const roller=MeshBuilder.CreateCylinder("guild-scroll-roller",{diameter:.10,height:1.9,tessellation:8},scene);
          roller.position.set(px,py+edge*.78,z-d/2+.045);roller.rotation.z=Math.PI/2;roller.material=guildOak;
        }
        for(let line=0;line<4;line++)
          box(scene,"guild-scroll-writing",[px-.15,py+.34-line*.22,z-d/2+.04],[.95-(line%2)*.2,.025,.035],guildOak);
      }
    }
    for(let zz=z-d/2+.7;zz<=z+d/2-.7;zz+=1.35) {
      obstacles.push({x:x-w/2+.12,z:zz,r:.68});
      obstacles.push({x:x+w/2-.12,z:zz,r:.68});
    }
    for(let xx=x-w/2+.85;xx<=x+w/2-.85;xx+=1.35) obstacles.push({x:xx,z:z-d/2+.12,r:.68});
    for(let xx=x-w/2+.85;xx<=x+w/2-.85;xx+=1.35) if(Math.abs(xx-x)>1.5) obstacles.push({x:xx,z:z+d/2-.12,r:.68});
  }
  colliders.push({name,minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,doorX:x,doorWidth:1.9,doorZ:front,interior,passThrough:!!cfg.passThrough});
  return null;
}

export async function createRoyalCity(engine, canvas) {
  const scene=new Scene(engine);
  scene.clearColor=new Color4(.58,.74,.84,1);
  scene.fogMode=Scene.FOGMODE_EXP2;scene.fogDensity=.0028;scene.fogColor=new Color3(.68,.78,.84);
  const sky=new HemisphericLight("sky-fill",new Vector3(0,1,0),scene);sky.intensity=.86;sky.groundColor=new Color3(.29,.25,.20);
  const sun=new DirectionalLight("golden-sun",new Vector3(-.45,-1,.3),scene);sun.position=new Vector3(45,70,-20);sun.intensity=2.0;
  const isTouchDevice=matchMedia("(pointer: coarse)").matches||navigator.maxTouchPoints>0;
  // iPhone Safari has repeatedly exhausted its GPU process during scene startup.
  // Keep all world geometry, materials, textures and lighting intact, but omit the
  // real-time shadow-map pass on touch devices. Desktop keeps the full 2048 shadow map.
  const shadow=isTouchDevice?null:new ShadowGenerator(2048,sun);
  if(shadow){
    shadow.useBlurExponentialShadowMap=true;shadow.blurKernel=24;
    shadow.setDarkness(.22);shadow.bias=.0005;shadow.normalBias=.025;
  }
  scene.imageProcessingConfiguration.toneMappingEnabled=true;
  scene.imageProcessingConfiguration.toneMappingType=ImageProcessingConfiguration.TONEMAPPING_ACES;
  scene.imageProcessingConfiguration.exposure=1.12;
  scene.imageProcessingConfiguration.contrast=1.16;

  const mats={
    // These three materials receive real tile maps immediately below; do not
    // allocate temporary DynamicTextures that would be replaced unused.
    wall:mat(scene,"aged-limestone",C.stone,.9),
    trim:mat(scene,"carved-stone",C.paleStone,.92),
    dark:mat(scene,"deep-arch-shadow",new Color3(.09,.085,.075)),
    wood:mat(scene,"weathered-oak",C.wood,.9),
    woodLight:mat(scene,"polished-oak",C.woodLight,.72),
    roof:mat(scene,"whitewashed-limestone-roof",new Color3(.90,.88,.82),.94),
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
  mats.roof.albedoTexture=noiseTexture(scene,"whitewashed-roof-grain","#e9e6dd","#c9c5bb",256);

  // Cobblestone plaza with a repeating hand-laid pattern.
  const ground=MeshBuilder.CreateGround("plaza-ground",{width:380,height:380,subdivisions:2},scene);
  ground.position.y=-.12;ground.material=mat(scene,"cobblestone",new Color3(.53,.50,.43),.96);
  surfaceMaps(ground.material,"T_UnevenBrick_BaseColor.png","T_UnevenBrick_Normal.png",9,9);
  // Preserve every cobble and its alternating stone finish, but combine the
  // static blocks by material. This turns nearly 200 draw calls into two.
  const cobbleGroups=new Map();
  for(let z=-39;z<=33;z+=6) for(let x=-39;x<=39;x+=6) {
    const p=MeshBuilder.CreateBox("individual-cobble",{width:5.78,height:.055,depth:5.78},scene);
    p.position.set(x,-.055,z);
    p.material=(Math.floor((x+39)/6+z/6)%6===0)?mats.trim:ground.material;
    if(!cobbleGroups.has(p.material))cobbleGroups.set(p.material,[]);
    cobbleGroups.get(p.material).push(p);
  }
  for(const [material,parts] of cobbleGroups) {
    const merged=Mesh.MergeMeshes(parts,true,true,undefined,false,false);
    if(merged){merged.name="plaza-cobblestones-batched";merged.material=material;merged.isPickable=false;}
  }

  const colliders=[];
  const obstacles=[];
  const addObstacle=(x,z,r)=>obstacles.push({x,z,r});
  addBuilding(scene,{x:-21,z:6,w:15,d:10,h:9,name:"The Copper Stag Tavern",sign:"COPPER STAG • TAVERN",interior:true},{...mats},shadow,colliders,obstacles);
  addBuilding(scene,{x:-23,z:-20,w:28,d:20,h:15,name:"Adventurers Guild",sign:"ADVENTURERS GUILD",interior:true},{...mats},shadow,colliders,obstacles);
  // Guild identity: a broad home-plate gable, carved timber truss and swallow-tail pennants.
  const guildFront=-10;
  for(const side of [-1,1]) {
    const beam=MeshBuilder.CreateTube("guild-homeplate-gable-beam",{path:[new Vector3(-23+side*13.7,15.1,guildFront-.34),new Vector3(-23,20.1,guildFront-.34)],radius:.22,tessellation:8},scene);
    beam.material=mats.woodLight;
  }
  box(scene,"guild-gable-crossbeam",[-23,15.35,guildFront-.38],[27.8,.28,.34],mats.gold);
  const guildShield=MeshBuilder.CreateCylinder("guild-crest-shield",{diameter:2.0,height:.22,tessellation:6},scene);
  guildShield.position.set(-23,12.2,guildFront-.68);guildShield.rotation.x=Math.PI/2;guildShield.material=mats.banner;
  const guildCrest=MeshBuilder.CreateCylinder("guild-crest-mark",{diameter:.82,height:.25,tessellation:6},scene);
  guildCrest.position.set(-23,12.2,guildFront-.84);guildCrest.rotation.x=Math.PI/2;guildCrest.material=mats.gold;
  for(const side of [-1,1]) {
    const pennant=MeshBuilder.CreatePlane("guild-swallowtail-pennant",{width:1.25,height:2.0,sideOrientation:2},scene);
    pennant.position.set(-23+side*11.4,12.4,guildFront-.42);pennant.rotation.y=Math.PI/2;pennant.material=mats.banner;
    const notch=MeshBuilder.CreateCylinder("guild-pennant-finial",{diameter:.18,height:.24,tessellation:6},scene);
    notch.position.set(-23+side*11.4,11.35,guildFront-.46);notch.rotation.z=Math.PI/2;notch.material=mats.gold;
  }
  addBuilding(scene,{x:22,z:-18,w:15,d:10,h:8.5,name:"Royal Market Hall",sign:"MARKET HALL"},{...mats},shadow,colliders,obstacles);
  // New civic and residential quarter: infirmary, apothecary, bakery and homes.
  const civicRoad=mat(scene,"civic-quarter-road",new Color3(.39,.36,.31),.98);
  for(const [x,z,w,d,rot] of [[-58,1,48,7,0],[-79,8,7,30,0],[37,-28,28,7,0],[91,20,7,28,0]]) {
    const lane=MeshBuilder.CreateGround("civic-quarter-lane",{width:w,height:d,subdivisions:1},scene);
    lane.position.set(x,-.04,z);lane.rotation.y=rot;lane.material=civicRoad;
  }
  addBuilding(scene,{x:-61,z:-12,w:20,d:16,h:12,name:"St Martha Infirmary",sign:"ST MARTHA • INFIRMARY",interior:true},{...mats},shadow,colliders,obstacles);
  addBuilding(scene,{x:38,z:-38,w:15,d:12,h:9,name:"The Royal Apothecary",sign:"ROYAL APOTHECARY",interior:true},{...mats},shadow,colliders,obstacles);
  addBuilding(scene,{x:-51,z:18,w:17,d:13,h:9.5,name:"The Hearthstone Bakery",sign:"HEARTHSTONE BAKERY",interior:true},{...mats},shadow,colliders,obstacles);
  addBuilding(scene,{x:-82,z:18,w:16,d:13,h:9,name:"Westgate Cottages",sign:"WESTGATE COTTAGES"},{...mats},shadow,colliders,obstacles);
  addBuilding(scene,{x:91,z:29,w:16,d:13,h:9,name:"East Quarter Homes",sign:"EAST QUARTER HOMES"},{...mats},shadow,colliders,obstacles);
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



  // Side-mounted wrought-iron inn signs project perpendicular to each street facade.
  // The bracket, hanging chains and double-sided enamel board read clearly from either approach.
  const innSignIron=mat(scene,"inn-wall-sign-black-iron",new Color3(.075,.085,.085),.32,.86);
  const innSignBrass=mat(scene,"inn-wall-sign-antique-brass",new Color3(.68,.48,.22),.3,.78);
  const addIronInnSign=(label,x,frontZ,y=6.15)=>{
    const armZ=frontZ+.78,boardZ=frontZ+1.48;
    box(scene,"iron-inn-sign-wall-socket",[x,y+1.0,frontZ+.12],[.48,.42,.22],innSignIron);
    box(scene,"iron-inn-sign-projecting-arm",[x,y+1.0,frontZ+.72],[.16,.16,1.35],innSignIron);
    for(const side of [-1,1]) {
      const chain=MeshBuilder.CreateCylinder("iron-inn-sign-hanging-chain",{diameter:.045,height:.66,tessellation:8},scene);
      chain.position.set(x,y+.56,boardZ+side*.88);chain.material=innSignIron;
      const finial=MeshBuilder.CreateSphere("iron-inn-sign-chain-finial",{diameter:.13,segments:8},scene);
      finial.position.set(x,y+.18,boardZ+side*.88);finial.material=innSignBrass;
    }
    box(scene,"iron-inn-sign-board-frame",[x,y,boardZ],[.24,1.45,2.35],innSignIron);
    box(scene,"iron-inn-sign-board-inset",[x+.135,y,boardZ],[.055,1.18,2.08],innSignBrass);
    box(scene,"iron-inn-sign-board-face",[x+.17,y,boardZ],[.035,1.08,1.98],mats.wood);
    const texture=new DynamicTexture("iron-inn-sign-lettering-"+label.replace(/[^a-z0-9]/gi,""),{width:512,height:256},scene,false);
    const ctx=texture.getContext();
    ctx.fillStyle="#30251a";ctx.fillRect(0,0,512,256);
    ctx.strokeStyle="#c9a45c";ctx.lineWidth=13;ctx.strokeRect(10,10,492,236);
    ctx.fillStyle="#f4e2bd";ctx.textAlign="center";ctx.textBaseline="middle";
    ctx.font="bold 42px Georgia";ctx.fillText(label,256,112,455);
    ctx.font="24px Georgia";ctx.fillText("INN  •  ALE  •  ROOMS",256,190,455);texture.update();
    const signMat=new StandardMaterial("iron-inn-sign-lettering-mat-"+label.replace(/[^a-z0-9]/gi,""),scene);
    signMat.diffuseTexture=texture;signMat.emissiveColor=new Color3(.12,.09,.045);signMat.backFaceCulling=false;
    const face=MeshBuilder.CreatePlane("iron-inn-sign-readable-face",{width:1.92,height:1.02,sideOrientation:2},scene);
    face.position.set(x+.205,y,boardZ);face.rotation.y=Math.PI/2;face.material=signMat;face.isPickable=false;
    for(const side of [-1,1]) {
      const scroll=MeshBuilder.CreateTorus("iron-inn-sign-forged-scroll",{diameter:.42,thickness:.055,tessellation:12},scene);
      scroll.position.set(x,y+.95,boardZ+side*1.02);scroll.rotation.x=Math.PI/2;scroll.material=innSignIron;
    }
  };
  addIronInnSign("COPPER STAG",-15.5,11.0,6.1);
  addIronInnSign("LANTERN & LARK",54.5,12.5,6.4);
  addIronInnSign("FOX & FIR",78.5,12.5,6.4);
  // The Velvet Rose has no exterior hanging sign by design.

  // A compact inn quarter begins just beyond the eastern edge of the central square.
  const pubLaneMat=texturedMat(scene,"pub-quarter-road",new Color3(.39,.36,.31),"#81796c","#39352f",.96);
  const pubLane=MeshBuilder.CreateGround("pub-street-main-lane",{width:68,height:10,subdivisions:1},scene);
  pubLane.position.set(60,-.035,21);pubLane.material=pubLaneMat;
  const pubLink=MeshBuilder.CreateGround("pub-street-connector",{width:22,height:9,subdivisions:1},scene);
  pubLink.position.set(35,-.03,15);pubLink.rotation.y=-.48;pubLink.material=pubLaneMat;
  addBuilding(scene,{x:48,z:5,w:20,d:15,h:11,name:"The Lantern and Lark",sign:"THE LANTERN & LARK",interior:true},{...mats},shadow,colliders,obstacles);
  addBuilding(scene,{x:72,z:5,w:20,d:15,h:11.5,name:"The Fox and Fir",sign:"THE FOX & FIR",interior:true},{...mats},shadow,colliders,obstacles);
  // New branching lanes behind the fountain square: a discreet lantern-lit pleasure house and artisan row.
  const alleyStone=mat(scene,"old-quarter-alley-stone",new Color3(.31,.29,.25),.98);
  for(const [x,z,w,d] of [[83,-15,18,8],[86,-29,8,22],[63,-30,18,8]]) {
    const lane=MeshBuilder.CreateGround("old-quarter-branching-lane",{width:w,height:d,subdivisions:1},scene);
    lane.position.set(x,-.035,z);lane.material=alleyStone;
  }
  addBuilding(scene,{x:91,z:-12,w:17,d:17,h:10,name:"The Velvet Rose",sign:"THE VELVET ROSE",interior:true},{...mats},shadow,colliders,obstacles);
  addBuilding(scene,{x:66,z:-31,w:17,d:13,h:9.5,name:"The Moonlit Atelier",sign:"MOONLIT ATELIER",interior:true},{...mats},shadow,colliders,obstacles);
  // Carved balconies, stained glass, red velvet awnings and brass lanterns distinguish the night house.
  const velvet=mat(scene,"velvet-awning",new Color3(.34,.035,.095),.78);
  box(scene,"velvet-rose-balcony",[91,6.8,-5.0],[18.2,.22,.95],mats.gold);
  for(let i=0;i<19;i++) {
    const x=82.5+i;
    box(scene,"velvet-rose-baluster",[x,7.35,-5.0],[.09,.92,.10],mats.gold);
  }
  box(scene,"velvet-rose-canopy",[91,8.4,-4.2],[15.5,.22,2.2],velvet);
  for(let i=0;i<9;i++) box(scene,"velvet-rose-canopy-stripe",[83.5+i*1.85,8.42,-4.2],[.06,.24,2.25],mats.trim);
  for(const x of [84,91,98]) addLantern(scene,x,5.2,-4.5,mats.gold,mats.lantern);
  // Decorative shopfronts create a sense that the side streets continue beyond the main square.
  for(const [x,z] of [[57,-28],[76,-29],[102,-31],[101,18],[84,22]]) {
    const frontage=box(scene,"alley-shopfront",[x,3.0,z],[8,6,6],mats.wall);
    const roof=MeshBuilder.CreateCylinder("alley-shop-roof",{diameterTop:0,diameterBottom:10,height:3.2,tessellation:4},scene);
    roof.position.set(x,7.2,z);roof.material=mats.roof;
    box(scene,"alley-shop-door",[x,1.4,z+3.05],[1.5,2.8,.2],mats.wood);
    addLantern(scene,x-2.8,4.0,z+3.4,mats.gold,mats.lantern);
    addLantern(scene,x+2.8,4.0,z+3.4,mats.gold,mats.lantern);
  }
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
      for(let k=0;k<5;k++)
        addPetalBloom(scene,"lower-town-window-geranium",new Vector3(bx+wx-.72+k*.36,y-.69,z-.48),.14,k%2?flowerPink:flowerRed,6);
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
    // Small overflowing flower baskets are fastened beneath each lantern.
    const basketRing=MeshBuilder.CreateTorus("plaza-lamp-flower-basket-ring",{diameter:1.05,thickness:.10,tessellation:20},scene);
    basketRing.position.set(x,2.45,z);basketRing.material=plazaGold;
    cylinder(scene,"plaza-lamp-flower-basket-soil",[x,2.45,z],.86,.18,mats.wood,16);
    for(let bloom=0;bloom<5; bloom++) {
      const a=bloom*Math.PI*2/5,bx=x+Math.cos(a)*.34,bz=z+Math.sin(a)*.34;
      const flowerMat=bloom%3===0?mats.flowers:(bloom%3===1?mats.banner:plazaGold);
      addPetalBloom(scene,"plaza-lamp-flower-bloom",new Vector3(bx,2.78+(bloom%2)*.05,bz),.24,flowerMat,6);
    }
  }
  // Low, richly planted beds soften the entire ring around the imperial fountain.
  const plazaFlowerGreen=mat(scene,"plaza-flower-foliage",new Color3(.13,.31,.15),.92);
  const plazaFlowerPink=mat(scene,"plaza-flower-pink",new Color3(.82,.28,.39),.82);
  const plazaFlowerCream=mat(scene,"plaza-flower-cream",new Color3(.92,.82,.62),.86);
  const plazaFlowerViolet=mat(scene,"plaza-flower-violet",new Color3(.42,.29,.61),.84);
  for(let bed=0;bed<8;bed++) {
    const a=bed*Math.PI/4;
    // Move the two diagonal beds that sat directly on the royal coach's
    // north-south line farther around the fountain, preserving the flower ring.
    const radius=(bed===3||bed===5)?27.5:18.1;
    const px=13+Math.cos(a)*radius,pz=5+Math.sin(a)*radius;
    obstacles.push({x:px,z:pz,r:2.15});
    const planter=box(scene,"fountain-plaza-flower-bed",[px,.28,pz],[3.6,.5,2.25],fountainStone);
    planter.rotation.y=-a;
    const soil=box(scene,"fountain-plaza-flower-soil",[px,.55,pz],[3.28,.08,1.94],fountainShadow);
    soil.rotation.y=-a;
    for(let j=0;j<5;j++) {
      const offset=(j-2)*.54,fx=px+Math.cos(a)*offset,fz=pz+Math.sin(a)*offset;
      const stem=MeshBuilder.CreateTube("fountain-plaza-flower-stem",{path:[new Vector3(fx,.58,fz),new Vector3(fx,.98+(j%2)*.16,fz)],radius:.025,tessellation:5},scene);
      stem.material=plazaFlowerGreen;
      for(const side of [-1,1]) {
        const leaf=MeshBuilder.CreateSphere("fountain-plaza-flower-leaf",{diameter:.34,segments:8},scene);
        leaf.position.set(fx+side*.16,.78,fz);leaf.scaling.set(1,.32,.62);leaf.rotation.z=side*.42;leaf.material=plazaFlowerGreen;
      }
      const petalMat=[plazaFlowerPink,plazaFlowerCream,plazaFlowerViolet][(bed+j)%3];
      addPetalBloom(scene,"fountain-plaza-flower",new Vector3(fx,1.03+(j%2)*.16,fz),.34,petalMat,7);
    }
  }

  // Yield between major districts so mobile Safari can service the page.
  await new Promise(resolve=>setTimeout(resolve,0));
  // A proper market street: ten low stalls flank the central approach to the great bridge.
  // Their fronts face inward toward the shared north-south street axis (x = 0).
  const marketStallRows=[-13,-19,-25,-31,-37];
  const marketLabels=["果物","野菜","焼きたてパン","花とハーブ","チーズ","蜂蜜","香辛料","布と染物","焼き菓子","雑貨"];
  const marketCloths=[mats.banner,mats.flowers,mats.banner,mats.flowers,mats.banner];
  const marketWood=mat(scene,"market-stall-oak",new Color3(.30,.17,.085),.92);
  const marketWoodLight=mat(scene,"market-stall-honey-wood",new Color3(.52,.34,.18),.94);
  const marketLeaf=mat(scene,"market-fruit-leaf",new Color3(.17,.36,.12),.92);
  const marketSignInk=mat(scene,"market-sign-ink",new Color3(.19,.12,.075),.92);
  const marketSphereTemplates=new Map();
  const marketGoodsMats=[
    mat(scene,"goods-green",new Color3(.24,.48,.16),.86),mat(scene,"goods-red",new Color3(.72,.12,.10),.78),
    mat(scene,"goods-gold",new Color3(.88,.58,.16),.82),mat(scene,"goods-cream",new Color3(.91,.78,.54),.9),
    mat(scene,"goods-purple",new Color3(.39,.20,.48),.82),mat(scene,"goods-blue",new Color3(.12,.31,.48),.86),
    mat(scene,"goods-honey",new Color3(.78,.39,.055),.34),mat(scene,"goods-berry",new Color3(.47,.055,.12),.76),
    mat(scene,"goods-iron",new Color3(.17,.19,.20),.38,.62)
  ];
  const marketGoods=[
    {type:"fruit",colors:[1,2,0,4]},{type:"vegetable",colors:[0,0,2,1]},{type:"bread",colors:[2,3,2]},
    {type:"flowers",colors:[1,4,3,2]},{type:"cheese",colors:[2,3]},{type:"honey",colors:[6,2]},
    {type:"spice",colors:[1,4,2,0]},{type:"cloth",colors:[5,4,1,2]},{type:"sweets",colors:[3,1,4,2]},
    {type:"curios",colors:[5,6,4,8]}
  ];
  function makeMarketStall(x,z,side,index) {
    const root=new TransformNode("market-stall-root-"+index,scene);
    root.position.set(x,0,z);
    root.rotation.y=side<0?-Math.PI/2:Math.PI/2;
    // Shared geometry keeps repeated stall props from allocating duplicate vertex buffers.
    const localBox=(name,p,size,material)=>{
      const m=sharedPrimitive(scene,"market-stall-boxes",name,"box",{width:size[0],height:size[1],depth:size[2]});
      m.parent=root;m.position.set(p[0],p[1],p[2]);m.material=material;m.isPickable=false;return m;
    };
    const localSphere=(name,p,size,material,segments=10)=>{
      const key=String(segments);let template=marketSphereTemplates.get(key);
      if(!template){template=MeshBuilder.CreateSphere("market-shared-sphere-"+key,{diameter:1,segments},scene);template.isVisible=false;template.isPickable=false;template.setEnabled(false);marketSphereTemplates.set(key,template);}
      const m=template.clone(name,null,true);
      m.isVisible=true;m.isPickable=false;m.setEnabled(true);
      m.parent=root;m.position.set(p[0],p[1],p[2]);m.scaling.set(size[0],size[1],size[2]);m.material=material;return m;
    };
    const localCylinder=(name,p,diameter,height,material,tess=12)=>{
      const m=sharedPrimitive(scene,"market-stall-cylinders",name,"cylinder",{diameter,height,tessellation:tess});
      m.parent=root;m.position.set(p[0],p[1],p[2]);m.material=material;m.isPickable=false;return m;
    };
    // Lower counter and sturdy carved legs.
    localBox("market-counter-body",[0,.53,0],[3.35,1.02,1.78],marketWood);
    localBox("market-counter-top",[0,1.08,0],[3.55,.14,1.98],marketWoodLight);
    localBox("market-counter-front-panel",[0,.60,-.91],[2.95,.66,.055],mats.wood);
    localBox("market-counter-gilt-rail",[0,.94,-.96],[3.10,.075,.045],mats.gold);
    for(const px of [-1.48,1.48]) {
      for(const pz of [-.78,.78]) {
        localBox("market-counter-carved-leg",[px,.54,pz],[.16,1.0,.16],marketWoodLight);
        for(let k=0;k<2;k++)localBox("market-counter-leg-inlay",[px,.42+k*.28,pz-.085],[.19,.035,.018],mats.gold);
      }
    }
    // A low striped awning, with carved uprights and a scalloped front edge.
    for(const px of [-1.72,1.72])for(const pz of [-1.12,1.12]) {
      localBox("market-awning-post",[px,1.73,pz],[.13,1.95,.13],marketWoodLight);
      localBox("market-awning-post-foot",[px,.82,pz],[.22,.13,.22],mats.gold);
    }
    localBox("market-awning-underframe",[0,2.65,0],[3.85,.12,2.72],marketWood);
    localBox("market-awning-cloth",[0,2.73,0],[3.82,.12,2.68],marketCloths[index%marketCloths.length]);
    for(let stripe=0;stripe<9;stripe++) {
      const sx=-1.68+stripe*.42;
      localBox("market-awning-stripe",[sx,2.805,0],[.19,.025,2.62],stripe%2===0?mats.banner:mats.flowers);
    }
    for(let scallop=0;scallop<9;scallop++) {
      const sx=-1.72+scallop*.43;
      const valance=localBox("market-awning-scallop",[sx,2.64,-1.36],[.36,.20,.10],scallop%2===0?mats.banner:mats.flowers);
      valance.rotation.z=Math.PI/2;
    }
    // Hanging sign faces the shoppers in the central lane.
    localBox("market-sign-frame",[0,2.22,-1.43],[1.92,.52,.12],marketWood);
    localBox("market-sign-inset",[0,2.22,-1.505],[1.70,.34,.025],marketSignInk);
    const signTex=new DynamicTexture("market-sign-texture-"+index,{width:320,height:96},scene,false);
    const ctx=signTex.getContext();ctx.fillStyle="#34271c";ctx.fillRect(0,0,320,96);
    ctx.strokeStyle="#d8b66f";ctx.lineWidth=6;ctx.strokeRect(5,5,310,86);
    ctx.fillStyle="#fff0cc";ctx.textAlign="center";ctx.textBaseline="middle";ctx.font="bold 43px sans-serif";
    ctx.fillText(marketLabels[index],160,49);signTex.update();
    const signFace=MeshBuilder.CreatePlane("market-sign-face-"+index,{width:1.65,height:.29},scene);
    signFace.parent=root;signFace.position.set(0,2.22,-1.525);
    const signMat=new StandardMaterial("market-sign-material-"+index,scene);signMat.diffuseTexture=signTex;signMat.emissiveColor=new Color3(.10,.07,.035);signFace.material=signMat;signFace.isPickable=false;
    // Ten merchants, ten distinct inventories. Their silhouettes differ as much as their colours.
    const goods=marketGoods[index],xs=[-1.22,-.62,0,.62,1.22];
    for(let item=0;item<10;item++) {
      const col=item%5,row=Math.floor(item/5),px=xs[col],pz=row===0?-.42:.43;
      const y=1.30+(item%3)*.025,color=marketGoodsMats[goods.colors[item%goods.colors.length]];
      if(goods.type==="fruit") {
        localSphere("fruit-display",[px,y+.16,pz],[.25,.28,.24],color,10);
        localSphere("fruit-leaf",[px+.04,y+.34,pz],[.11,.035,.065],marketLeaf,8);
      } else if(goods.type==="vegetable") {
        const v=localSphere("vegetable-display",[px,y+.15,pz],[.15,.36,.15],color,8);v.rotation.z=col%2?-.22:.22;
        localSphere("vegetable-leaf",[px+.10,y+.42,pz],[.12,.12,.10],marketLeaf,8);
      } else if(goods.type==="bread") {
        const loaf=localSphere("bread-loaf",[px,y+.13,pz],[.30,.18,.20],color,10);loaf.rotation.z=col%2?-.08:.08;
        if(col%2===0){const baguette=localCylinder("bread-baguette",[px,y+.13,pz+.12],.16,.52,color,8);baguette.rotation.z=Math.PI/2;}
      } else if(goods.type==="flowers") {
        localBox("flower-stem",[px,y+.23,pz],[.035,.48,.035],marketLeaf);
        localSphere("flower-head",[px,y+.49,pz],[.23,.13,.23],color,8);
        localSphere("flower-center",[px,y+.51,pz],[.075,.07,.075],marketGoodsMats[2],8);
      } else if(goods.type==="cheese") {
        localCylinder("cheese-wheel",[px,y+.12,pz],.48,.22,color,12);
        localSphere("cheese-wax-seal",[px+.08,y+.25,pz+.06],[.075,.035,.075],marketGoodsMats[2],8);
      } else if(goods.type==="honey") {
        localCylinder("honey-jar",[px,y+.19,pz],.28,.42,color,10);
        localCylinder("honey-jar-neck",[px,y+.42,pz],.17,.10,marketWoodLight,8);
        localSphere("honey-wax-top",[px,y+.49,pz],[.17,.07,.17],marketGoodsMats[2],8);
      } else if(goods.type==="spice") {
        localCylinder("spice-bowl",[px,y+.07,pz],.42,.14,marketWoodLight,10);
        localSphere("spice-mound",[px,y+.18,pz],[.20,.12,.20],color,8);
      } else if(goods.type==="cloth") {
        const bolt=localCylinder("cloth-bolt",[px,y+.17,pz],.22,.48,color,8);bolt.rotation.z=Math.PI/2;
        localBox("folded-fabric",[px,y+.10,pz+.13],[.38,.12,.25],marketGoodsMats[goods.colors[(item+1)%goods.colors.length]]);
      } else if(goods.type==="sweets") {
        localCylinder("pastry-base",[px,y+.10,pz],.34,.18,marketGoodsMats[3],10);
        localSphere("icing-top",[px,y+.22,pz],[.25,.09,.25],color,8);
        localSphere("berry-topping",[px+.04,y+.31,pz],[.075,.07,.075],marketGoodsMats[1],8);
      } else if(col%2===0) {
        localCylinder("potion-bottle",[px,y+.20,pz],.25,.42,color,8);
        localSphere("potion-neck",[px,y+.44,pz],[.10,.12,.10],marketGoodsMats[2],8);
      } else {
        const crystal=localSphere("arcane-crystal",[px,y+.20,pz],[.16,.42,.16],color,6);crystal.rotation.z=.18;
      }
    }
    // A small hanging lantern adds warmth after dusk.
    localBox("market-lantern-bracket",[0,2.12,1.42],[.48,.08,.10],marketWood);
    const lantern=localBox("market-lantern-frame",[0,1.88,1.47],[.24,.34,.24],mats.gold);
    lantern.material=mats.lantern;
    addObstacle(x,z,1.0);
    const crateWorldX=x+(side<0?-.12:.12);
    const crateWorldZ=z+(side<0?2.05:-2.05);
    addObstacle(crateWorldX,crateWorldZ,.62);
    return {x,z,side,index};
  }
  const marketStalls=[];
  for(let row=0;row<marketStallRows.length;row++) {
    marketStalls.push(makeMarketStall(-7.5,marketStallRows[row],-1,row));
    marketStalls.push(makeMarketStall(7.5,marketStallRows[row],1,row+5));
  }
  // Blacksmith workshop with open forge, anvil, tools and a large wall sign.
  const smithStone=mat(scene,"blacksmith-stone",new Color3(.30,.29,.27),.96),smithWood=mat(scene,"blacksmith-oak",new Color3(.24,.13,.07),.9),smithIron=mat(scene,"blacksmith-iron",new Color3(.16,.18,.19),.42,.72),smithEmber=mat(scene,"blacksmith-embers",new Color3(.95,.28,.045),.35,.1);
  smithEmber.emissiveColor=new Color3(.8,.13,.015);
  box(scene,"blacksmith-back-wall",[57,3.4,-29],[14,6.8,.55],smithStone);box(scene,"blacksmith-side-wall-left",[50.2,3.4,-24],[.55,6.8,10],smithStone);box(scene,"blacksmith-side-wall-right",[63.8,3.4,-24],[.55,6.8,10],smithStone);box(scene,"blacksmith-roof",[57,7.1,-24],[14.6,.55,11],mats.roof);
  for(const x of [50.6,63.4])box(scene,"blacksmith-timber-post",[x,3.4,-18.9],[.42,6.8,.42],smithWood);
  box(scene,"blacksmith-sign-board",[57,5.6,-18.72],[4.4,1.35,.22],smithWood);
  const st=new DynamicTexture("blacksmith-wall-sign",{width:512,height:192},scene,false),sc=st.getContext();sc.fillStyle="#251c18";sc.fillRect(0,0,512,192);sc.strokeStyle="#d5ad63";sc.lineWidth=12;sc.strokeRect(8,8,496,176);sc.fillStyle="#f5dfb4";sc.textAlign="center";sc.textBaseline="middle";sc.font="bold 52px Georgia";sc.fillText("鍛冶屋  ⚒",256,96);st.update();
  const ssm=new StandardMaterial("blacksmith-sign-material",scene);ssm.diffuseTexture=st;ssm.emissiveColor=new Color3(.16,.10,.045);const sf=MeshBuilder.CreatePlane("blacksmith-sign-face",{width:4.15,height:1.12},scene);sf.position.set(57,5.6,-18.86);sf.material=ssm;
  box(scene,"blacksmith-forge-base",[54,1,-27.2],[4.4,1.2,2.5],smithStone);box(scene,"blacksmith-forge-opening",[54,1.35,-25.9],[3.2,.72,.12],smithIron);box(scene,"blacksmith-forge-embers",[54,1.45,-25.82],[2.35,.34,.08],smithEmber);box(scene,"blacksmith-chimney-hood",[54,3.2,-27.4],[4.8,2.8,2.8],smithStone);
  const chimney=MeshBuilder.CreateCylinder("blacksmith-chimney-stack",{diameter:1.5,height:5,tessellation:8},scene);chimney.position.set(54,8,-28.1);chimney.material=smithStone;
  box(scene,"blacksmith-anvil-foot",[59,1,-25.5],[1,.55,.85],smithIron);box(scene,"blacksmith-anvil-body",[59,1.55,-25.5],[1.5,.55,.65],smithIron);
  const horn=MeshBuilder.CreateCylinder("blacksmith-anvil-horn",{diameterTop:.08,diameterBottom:.45,height:.95,tessellation:8},scene);horn.position.set(59.95,1.65,-25.5);horn.rotation.z=-Math.PI/2;horn.material=smithIron;
  box(scene,"blacksmith-workbench",[61.5,1.15,-21.5],[3.2,.22,1.2],smithWood);for(const x of [60.2,62.8])box(scene,"blacksmith-workbench-leg",[x,.58,-21.5],[.16,1.15,.16],smithWood);
  for(let i=0;i<3;i++){const tool=MeshBuilder.CreateCylinder("blacksmith-hanging-tool",{diameter:.10,height:1.5,tessellation:8},scene);tool.position.set(61+i*.8,3.1,-28.55);tool.material=smithIron;}
  // Public stone well with a timber canopy and hand-cranked winch.
  const wellStone=mat(scene,"town-well-stone",new Color3(.58,.54,.46),.94),wellWater=mat(scene,"town-well-water",new Color3(.12,.36,.43),.18,.18);
  cylinder(scene,"town-well-footing",[-5,.18,-5],3.3,.36,wellStone,16);cylinder(scene,"town-well-rim",[-5,.72,-5],2.65,.82,wellStone,16);cylinder(scene,"town-well-opening",[-5,1.15,-5],1.95,.08,mats.dark,16);cylinder(scene,"town-well-water-surface",[-5,1.20,-5],1.62,.06,wellWater,24);
  for(const side of [-1,1])box(scene,"town-well-canopy-post",[-5+side*1.25,2.2,-5],[.22,3.1,.22],smithWood);
  box(scene,"town-well-canopy-roof",[-5,3.85,-5],[3.2,.25,2.7],mats.roof);const axle=MeshBuilder.CreateCylinder("town-well-winch-axle",{diameter:.18,height:2.7,tessellation:12},scene);axle.position.set(-5,2.7,-5);axle.rotation.z=Math.PI/2;axle.material=smithIron;cylinder(scene,"town-well-winch-wheel",[-6.5,2.7,-5],1,.16,smithWood,16);box(scene,"town-well-rope",[-5,1.95,-5],[.05,1.35,.05],smithWood);

  // A monumental carriage-width wrought-iron gate replaces the small gatehouse buildings.
  // Both leaves stand folded back along the boulevard, leaving an unobstructed 16-metre passage.
  const avenueGateIron=mat(scene,"avenue-gate-forged-iron",new Color3(.12,.15,.16),.34,.78);
  const avenueGateGold=mat(scene,"avenue-gate-brass-detail",new Color3(.68,.49,.22),.30,.72);
  for(const side of [-1,1]) {
    const px=side*9.5;
    cylinder(scene,"avenue-gate-pillar-foot",[px,.48,-53],2.8,.9,mats.trim,24);
    box(scene,"avenue-gate-stone-pier",[px,4.45,-53],[2.0,8.0,2.0],mats.wall);
    box(scene,"avenue-gate-pier-cap",[px,8.65,-53],[2.7,.42,2.7],avenueGateGold);
    const finial=MeshBuilder.CreateSphere("avenue-gate-pier-finial",{diameter:.62,segments:20},scene);
    finial.position.set(px,9.15,-53);finial.material=avenueGateGold;
    // Open iron leaf, folded parallel to the road so carts and coaches can pass freely.
    for(let z=-56.6;z<=-49.4;z+=.72) {
      const bar=box(scene,"avenue-gate-vertical-bar",[side*8.35,3.45,z],[.095,6.1,.095],avenueGateIron);
      const spear=MeshBuilder.CreateCylinder("avenue-gate-spearhead",{diameterTop:0,diameterBottom:.22,height:.48,tessellation:4},scene);
      spear.position.set(side*8.35,6.72,z);spear.material=avenueGateGold;
    }
    for(const y of [.72,2.15,4.75,6.2]) {
      const rail=box(scene,"avenue-gate-horizontal-rail",[side*8.35,y,-53],[.16,.18,7.55],avenueGateIron);
      rail.rotation.y=0;
    }
    for(const z of [-56.4,-49.6]) {
      const hinge=box(scene,"avenue-gate-hinge",[side*9.05,3.45,z],[.22,6.25,.28],avenueGateGold);
    }
    box(scene,"avenue-gate-brace",[side*8.35,3.4,-53],[.13,4.4,.13],avenueGateGold);
  }
  // A continuous old limestone boundary wall separates the town from the royal estate.
  // It leaves a broad central opening for the iron carriage gate.
  const boundaryStone=texturedMat(scene,"royal-boundary-aged-stone",new Color3(.62,.58,.49),"#a99f8d","#514a3d",.94);
  const boundaryIvy=mat(scene,"royal-boundary-ivy",new Color3(.075,.22,.105),.96);
  const boundaryIvyLight=mat(scene,"royal-boundary-ivy-light",new Color3(.16,.34,.14),.92);
  for(const side of [-1,1]) {
    const start=side<0?-76:11, end=side<0?-11:76;
    const length=end-start, cx=(start+end)/2;
    box(scene,"royal-boundary-wall-foundation",[cx,.48,-53],[length+.8,.96,2.25],mats.trim);
    box(scene,"royal-boundary-wall-main",[cx,4.25,-53],[length,7.0,1.72],boundaryStone);
    box(scene,"royal-boundary-wall-coping",[cx,7.95,-53],[length+.45,.42,2.05],mats.trim);
    for(let x=start+1.5;x<end;x+=3.1) {
      box(scene,"royal-boundary-wall-merlon",[x,8.55,-53],[1.45,.9,1.9],boundaryStone);
      box(scene,"royal-boundary-wall-buttress",[x,3.8,-54.0],[.62,7.2,.62],mats.trim);
    }
    // Ivy climbs in irregular tendrils from the town-facing side, with small leaf clusters.
    for(let vine=0;vine<8;vine++) {
      const x=start+4.5+vine*(length-9)/7;
      const lean=(vine%2?1:-1)*(.35+(vine%3)*.12);
      const pathPts=[
        new Vector3(x,1.0,-54.0),
        new Vector3(x+lean*.45,2.2,-54.05),
        new Vector3(x-lean*.25,3.5,-54.05),
        new Vector3(x+lean,4.7,-54.05),
        new Vector3(x+lean*.55,6.0,-54.05),
        new Vector3(x+lean*1.25,7.25,-54.05)
      ];
      const tendril=MeshBuilder.CreateTube("royal-wall-ivy-tendril",{path:pathPts,radius:.055,tessellation:7},scene);
      tendril.material=boundaryIvy;
      for(let leaf=0;leaf<11;leaf++) {
        const p=Vector3.Lerp(pathPts[Math.floor(leaf/2)],pathPts[Math.min(5,Math.floor(leaf/2)+1)],leaf%2?.72:.25);
        const blade=MeshBuilder.CreateSphere("royal-wall-ivy-leaf",{diameter:.42,segments:10},scene);
        blade.position.set(p.x+(leaf%2?-.28:.28),p.y,p.z-.08);
        blade.scaling.set(.82,.42,.22);blade.rotation.z=(leaf%2?.55:-.55);blade.material=leaf%3?boundaryIvy:boundaryIvyLight;
      }
    }
  }

  // Yield between major districts so mobile Safari can service the page.
  await new Promise(resolve=>setTimeout(resolve,0));
  // The royal citadel: a layered limestone fortress with a proper keep, curtain walls,
  // crenellations, arched windows, buttresses, rooflines and royal banners.
  const royalPalaceStartIndex=scene.meshes.length;
  const cliffMat=texturedMat(scene,"castle-cliff-rock",new Color3(.34,.36,.35),"#555750","#292b28",.98);
  const castleStone=texturedMat(scene,"castle-cut-limestone",new Color3(.91,.90,.86),"#e5e2d9","#aaa69d",.9);
  const castleShadow=mat(scene,"castle-window-depth",new Color3(.12,.13,.13),.98);
  const castleRoof=texturedMat(scene,"castle-blue-slate",new Color3(.17,.21,.23),"#454d50","#171d20",.82);
  const castleGold=mat(scene,"castle-aged-gold",new Color3(.72,.52,.23),.34,.68);
  // Split the cliff into shoulders, retaining the broad central approach to the World Tree.
  for(const side of [-1,1]) {
    const cliff=MeshBuilder.CreateBox("castle-cliff-shoulder",{width:24,height:17,depth:17},scene);
    cliff.position.set(side*20,7.5,-77);cliff.material=cliffMat;
  }
  const approach=MeshBuilder.CreateGround("world-tree-approach",{width:82,height:66,subdivisions:1},scene);
  approach.position.set(0,-.08,-82);approach.material=mats.floor;
  // The national standard of Erinvale: midnight blue, ivory, forest green and a golden sun-tree.
  const erinvaleFlagTexture=new DynamicTexture("erinvale-national-flag-texture",{width:512,height:320},scene,false);
  const flagCtx=erinvaleFlagTexture.getContext();
  flagCtx.fillStyle="#172b42";flagCtx.fillRect(0,0,512,320);
  flagCtx.fillStyle="#e8dfc7";flagCtx.fillRect(0,112,512,96);
  flagCtx.fillStyle="#31543d";flagCtx.fillRect(0,208,512,112);
  flagCtx.fillStyle="#c89a45";flagCtx.beginPath();flagCtx.arc(256,160,54,0,Math.PI*2);flagCtx.fill();
  flagCtx.fillStyle="#172b42";flagCtx.beginPath();flagCtx.arc(256,160,39,0,Math.PI*2);flagCtx.fill();
  flagCtx.strokeStyle="#c89a45";flagCtx.lineWidth=10;flagCtx.lineCap="round";
  flagCtx.beginPath();flagCtx.moveTo(256,188);flagCtx.lineTo(256,128);flagCtx.moveTo(256,151);flagCtx.lineTo(224,132);flagCtx.moveTo(256,151);flagCtx.lineTo(288,132);flagCtx.stroke();
  for(const side of [-1,1]){flagCtx.beginPath();flagCtx.moveTo(256,137);flagCtx.lineTo(256+side*12,119);flagCtx.lineTo(256+side*7,143);flagCtx.fillStyle="#c89a45";flagCtx.fill();}
  erinvaleFlagTexture.update();
  const erinvaleFlagMat=new StandardMaterial("erinvale-national-flag-material",scene);
  erinvaleFlagMat.diffuseTexture=erinvaleFlagTexture;erinvaleFlagMat.emissiveColor=new Color3(.08,.07,.04);erinvaleFlagMat.backFaceCulling=false;
  const palaceStandard=MeshBuilder.CreatePlane("erinvale-national-standard",{width:3.3,height:2.05,sideOrientation:2},scene);
  palaceStandard.position.set(0,34.5,-74.45);palaceStandard.material=erinvaleFlagMat;
  const gateStandard=MeshBuilder.CreatePlane("erinvale-gate-standard",{width:2.0,height:1.25,sideOrientation:2},scene);
  gateStandard.position.set(0,12.8,-47.75);gateStandard.material=erinvaleFlagMat;
  // Home-plate silhouette and steep blue-slate roof make the royal keep unmistakable.
  const keepFront=-75.7;
  for(const side of [-1,1]) {
    const gable=MeshBuilder.CreateTube("royal-keep-homeplate-gable",{path:[new Vector3(side*8.35,44.1,keepFront),new Vector3(0,49.5,keepFront)],radius:.32,tessellation:10},scene);
    gable.material=castleGold;
  }
  const keepRoofLeft=box(scene,"royal-keep-gabled-roof-left",[-4.1,45.7,-82],[9.3,.65,14.8],castleRoof);keepRoofLeft.rotation.z=.52;
  const keepRoofRight=box(scene,"royal-keep-gabled-roof-right",[4.1,45.7,-82],[9.3,.65,14.8],castleRoof);keepRoofRight.rotation.z=-.52;
  box(scene,"royal-keep-gold-ridge",[0,48.1,-82],[.72,.5,15.2],castleGold);
  const royalCrest=MeshBuilder.CreateCylinder("royal-keep-crown-crest",{diameter:2.2,height:.28,tessellation:8},scene);
  royalCrest.position.set(0,39.8,-75.55);royalCrest.rotation.x=Math.PI/2;royalCrest.material=castleGold;
  // Main curtain wall and its raised central gatehouse.
  // The curtain wall is split around a full-height central carriage gateway.
  box(scene,"citadel-front-wall-left",[-16.5,17,-77],[20,17,3.2],castleStone);
  box(scene,"citadel-front-wall-right",[16.5,17,-77],[20,17,3.2],castleStone);
  box(scene,"citadel-front-wall-over-gate",[0,23.0,-77],[13,5,3.2],castleStone);
  box(scene,"citadel-wall-base-course-left",[-16.5,9.1,-75.25],[20,1.0,.75],mats.trim);
  box(scene,"citadel-wall-base-course-right",[16.5,9.1,-75.25],[20,1.0,.75],mats.trim);
  box(scene,"citadel-wall-cornice-left",[-16.5,25.45,-75.15],[20,.62,3.7],castleGold);
  box(scene,"citadel-wall-cornice-right",[16.5,25.45,-75.15],[20,.62,3.7],castleGold);
  box(scene,"citadel-wall-cornice-over-gate",[0,25.45,-75.15],[13,.62,3.7],castleGold);
  for(let i=0;i<27;i++) {
    const x=-25.5+i*1.96;
    box(scene,"citadel-merlon",[x,26.55,-77],[1.15,1.65,3.25],castleStone);
    if(i%2===0 && Math.abs(x)>5.8) box(scene,"citadel-arrow-slit",[x,18.8,-75.28],[.22,2.0,.08],castleShadow);
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
    const cx=side*19.25, innerX=side*10.45, outerX=side*28.05;
    // Continuous walkable floor and upper cornice define the east and west wings.
    box(scene,"palace-wing-floor",[cx,8.58,-82],[17.6,.24,15.0],wingFloor);
    box(scene,"palace-wing-ceiling",[cx,31.0,-82],[17.6,.42,15.0],castleStone);
    // Steep blue-slate roofs make the two palace wings visible as real exterior volumes.
    const innerRoof=box(scene,"palace-wing-inner-roof",[cx-side*3.2,27.45,-82],[9.8,.62,17.2],castleRoof);
    innerRoof.rotation.z=-side*.36;
    const outerRoof=box(scene,"palace-wing-outer-roof",[cx+side*3.2,27.45,-82],[7.8,.62,17.2],castleRoof);
    outerRoof.rotation.z=side*.36;
    box(scene,"palace-wing-gold-ridge",[cx,29.0,-82],[.58,.38,17.5],castleGold);
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
    box(scene,"palace-wing-front-wall",[cx,20.5,-74.55],[17.6,24,.9],wingWall);
    box(scene,"palace-wing-rear-wall",[cx,20.5,-89.45],[13.6,24,.9],wingWall);
    // A partition separates two rooms; its central opening keeps both rooms connected.
    box(scene,"palace-wing-partition-front",[cx+side*.1,17,-84.85],[16.7,17,.75],castleStone);
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
  // The wing rooms are moved with the complete palace assembly below.
  // Palace hall floor, pale columns, crimson runner and a visible throne.
  box(scene,"royal-hall-floor",[0,8.62,-82],[20.5,.24,15.0],mats.trim);
  box(scene,"royal-hall-carpet",[0,8.78,-82],[5.6,.06,14.5],mats.banner);
  for(let side of [-1,1]) for(let z=-87;z<=-77;z+=3.3) {
    cylinder(scene,"royal-hall-column-base",[side*8.5,9.05,z],1.25,.48,castleGold,16);
    const col=cylinder(scene,"royal-hall-column",[side*8.5,16.5,z],.62,14.5,mats.trim,20);
    cylinder(scene,"royal-hall-column-capital",[side*8.5,24.0,z],1.15,.55,castleGold,16);
  }
  // A raised, layered dais gives the throne hall a clear ceremonial focal point.
  box(scene,"royal-throne-dais-lower",[0,8.98,-87.0],[8.2,.42,4.9],castleStone);
  box(scene,"royal-throne-dais-gilt-step",[0,9.24,-87.55],[7.1,.18,4.2],castleGold);
  box(scene,"royal-throne-dais-upper",[0,9.43,-87.75],[5.8,.28,3.5],castleStone);
  box(scene,"royal-throne-dais-runner",[0,9.59,-86.95],[3.8,.055,2.0],mats.banner);
  const throne=box(scene,"royal-throne-seat",[0,10.2,-87.6],[3.4,.55,2.0],castleGold);
  box(scene,"royal-throne-back",[0,12.1,-88.4],[3.3,4.0,.55],castleStone);
  box(scene,"royal-throne-back-inset",[0,12.35,-88.08],[2.35,3.15,.10],mats.banner);
  // Carved canopy, gilded supports and a heraldic crest frame the royal seat.
  for(let side of [-1,1]) {
    box(scene,"royal-throne-arm",[side*1.65,11.0,-87.7],[.42,1.4,1.8],castleGold);
    const finial=MeshBuilder.CreateSphere("royal-throne-finial",{diameter:.42,segments:12},scene);
    finial.position.set(side*1.65,14.2,-88.4);finial.material=castleGold;
    cylinder(scene,"royal-throne-canopy-post",[side*2.25,13.4,-88.0],.20,7.0,castleGold,12);
    const spear=MeshBuilder.CreateCylinder("royal-throne-canopy-finial",{diameterTop:0,diameterBottom:.34,height:.9,tessellation:8},scene);
    spear.position.set(side*2.25,17.35,-88.0);spear.material=castleGold;
  }
  box(scene,"royal-throne-canopy",[0,17.0,-88.0],[5.2,.34,2.0],castleGold);
  box(scene,"royal-throne-canopy-underside",[0,16.78,-87.92],[4.65,.12,1.65],mats.banner);
  const throneCrest=MeshBuilder.CreateCylinder("royal-throne-heraldic-crest",{diameter:1.35,height:.22,tessellation:8},scene);
  throneCrest.position.set(0,15.35,-88.05);throneCrest.rotation.x=Math.PI/2;throneCrest.material=castleGold;
  const throneCrestCore=MeshBuilder.CreateSphere("royal-throne-crest-jewel",{diameter:.42,segments:12},scene);
  throneCrestCore.position.set(0,15.35,-88.22);throneCrestCore.material=mats.lantern;
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

  // Grand Baroque / German palace exterior: symmetry, monumental pavilions,
  // mansard rooflines, domes, sculpted stonework and a ceremonial staircase.
  const palaceIvory=mat(scene,"palace-ivory-stone",new Color3(.83,.79,.69),.82);
  const palaceGold=mat(scene,"palace-bright-gilding",new Color3(.86,.66,.30),.28,.78);
  const palaceBlue=mat(scene,"palace-mansard-blue",new Color3(.12,.18,.23),.38,.38);
  const palaceGlass=mat(scene,"palace-tall-window-glass",new Color3(.18,.27,.31),.18,.22);
  // Split the monumental facade around a real, walk-through central entrance.
  box(scene,"palace-grand-front-pavilion-left",[-8.4,23.5,-72.6],[8.2,29,2.4],palaceIvory);
  box(scene,"palace-grand-front-pavilion-right",[8.4,23.5,-72.6],[8.2,29,2.4],palaceIvory);
  box(scene,"palace-grand-front-pavilion-door-lintel",[0,33.0,-72.6],[8.6,9.0,2.4],palaceIvory);
  for(const side of [-1,1]) {
    box(scene,"palace-entrance-gilt-jamb",[side*4.25,19.0,-71.2],[.42,20,.48],palaceGold);
    box(scene,"palace-entrance-capital",[side*4.25,29.2,-71.2],[1.0,.55,.8],palaceGold);
  }
  box(scene,"palace-entrance-gilt-arch",[0,29.2,-71.2],[8.8,.48,.8],palaceGold);
  box(scene,"palace-grand-pavilion-base",[0,10,-71.2],[27,1.5,3],palaceGold);
  box(scene,"palace-grand-pavilion-cornice",[0,38.1,-71],[28,.9,3.2],palaceGold);
  box(scene,"palace-grand-pavilion-attic",[0,41,-72],[17,4.8,2],palaceIvory);
  for(let x=-10;x<=10;x+=5) {
    if(x===0) continue;
    cylinder(scene,"palace-grand-portico-column-base",[x,10.5,-69.8],1.6,.55,palaceGold,20);
    cylinder(scene,"palace-grand-portico-column",[x,22,-69.8],.72,22.5,palaceIvory,24);
    cylinder(scene,"palace-grand-portico-capital",[x,33.4,-69.8],1.65,.65,palaceGold,20);
    box(scene,"palace-grand-window-recess",[x,24,-71.28],[2.6,9,.12],castleShadow);
    box(scene,"palace-grand-window-glass",[x,24,-71.18],[2,7.8,.08],palaceGlass);
    box(scene,"palace-grand-window-crossbar",[x,24,-71.08],[2,.14,.08],palaceGold);
    box(scene,"palace-grand-window-mullion",[x,24,-71.08],[.14,7.8,.08],palaceGold);
  }
  const pediment=MeshBuilder.CreateCylinder("palace-grand-pediment",{diameterTop:0,diameterBottom:18,height:5,tessellation:3},scene);
  pediment.position.set(0,45,-71.4);pediment.rotation.z=Math.PI;pediment.rotation.y=Math.PI/2;pediment.material=palaceIvory;
  for(const side of [-1,1]) {
    const tx=side*31.5;
    box(scene,"palace-corner-pavilion",[tx,22,-88],[12,27,16],palaceIvory);
    box(scene,"palace-corner-pavilion-base",[tx,9,-88],[13,1.3,17],palaceGold);
    box(scene,"palace-corner-pavilion-cornice",[tx,35.7,-88],[13,.9,17],palaceGold);
    for(const z of [-93,-88,-83]) {
      box(scene,"palace-corner-window-recess",[tx,23.5,z],[3,8.8,.14],castleShadow);
      box(scene,"palace-corner-window-glass",[tx,23.5,z-.1],[2.35,7.8,.08],palaceGlass);
      box(scene,"palace-corner-window-mullion",[tx,23.5,z-.2],[.13,7.8,.08],palaceGold);
      const arch=MeshBuilder.CreateTorus("palace-corner-window-arch",{diameter:2,thickness:.15,tessellation:16},scene);
      arch.scaling.y=1.25;arch.position.set(tx,28.3,z-.18);arch.rotation.x=Math.PI/2;arch.material=palaceGold;
    }
    const mansard=MeshBuilder.CreateCylinder("palace-corner-mansard",{diameterTop:4,diameterBottom:15,height:8,tessellation:4},scene);
    mansard.position.set(tx,40,-88);mansard.rotation.y=Math.PI/4;mansard.material=palaceBlue;
    const cupola=MeshBuilder.CreateCylinder("palace-corner-cupola",{diameterTop:2.2,diameterBottom:5,height:5,tessellation:12},scene);
    cupola.position.set(tx,47,-88);cupola.material=palaceIvory;
    const dome=MeshBuilder.CreateSphere("palace-corner-dome",{diameter:5.2,segments:16},scene);
    dome.position.set(tx,50,-88);dome.scaling.y=.85;dome.material=palaceBlue;
    const finial=MeshBuilder.CreateCylinder("palace-corner-finial",{diameterTop:0,diameterBottom:.45,height:3,tessellation:12},scene);
    finial.position.set(tx,54,-88);finial.material=palaceGold;
    box(scene,"palace-corner-balustrade",[tx,37,-88],[13,.6,16],palaceGold);
    for(let i=0;i<9;i++) {
      const bal=MeshBuilder.CreateCylinder("palace-corner-baluster",{diameterTop:.13,diameterBottom:.22,height:1.1,tessellation:8},scene);
      bal.position.set(tx-5.8+i*1.45,36.4,-96);bal.material=palaceIvory;
    }
  }
  box(scene,"palace-main-mansard-roof",[0,43.4,-88],[52,1,19],palaceBlue);
  box(scene,"palace-main-roof-ridge",[0,44.3,-88],[52,.45,.65],palaceGold);
  for(let x=-23;x<=23;x+=5.75) {
    const dormer=box(scene,"palace-mansard-dormer",[x,46,-79],[2.5,3.6,1.7],palaceIvory);
    const dormerRoof=MeshBuilder.CreateCylinder("palace-dormer-roof",{diameterTop:0,diameterBottom:3.1,height:1.8,tessellation:4},scene);
    dormerRoof.position.set(x,48,-79);dormerRoof.rotation.y=Math.PI/4;dormerRoof.material=palaceBlue;
    box(scene,"palace-dormer-window",[x,45.7,-78.1],[1.1,1.8,.08],palaceGlass);
  }
  // No ceremonial staircase: the palace opens directly onto a broad carriage forecourt.
  for(const side of [-1,1]) {
    cylinder(scene,"palace-terrace-statue-plinth",[side*14.8,9.5,-70],1.3,1.8,palaceIvory,12);
    const statue=MeshBuilder.CreateSphere("palace-terrace-statue",{diameter:2,segments:12},scene);
    statue.position.set(side*14.8,11,-70);statue.scaling.y=1.8;statue.material=palaceGold;
  }
  const domeDrum=MeshBuilder.CreateCylinder("palace-central-dome-drum",{diameter:11,height:5,tessellation:24},scene);
  domeDrum.position.set(0,42.2,-72);domeDrum.material=palaceIvory;
  for(let i=0;i<12;i++) {
    const a=i*Math.PI*2/12;
    box(scene,"palace-dome-drum-window",[Math.cos(a)*5.45,42.4,-72+Math.sin(a)*5.45],[1,2.6,.15],palaceGlass);
  }
  const centralDome=MeshBuilder.CreateSphere("palace-central-dome",{diameter:17,segments:24},scene);
  centralDome.position.set(0,48,-72);centralDome.scaling.y=1.05;centralDome.material=palaceBlue;
  const domeFinial=MeshBuilder.CreateCylinder("palace-central-dome-finial",{diameterTop:0,diameterBottom:1,height:5,tessellation:12},scene);
  domeFinial.position.set(0,58,-72);domeFinial.material=palaceGold;

  // A second walkable palace suite continues directly beyond the throne hall.
  const suiteZ=-109.5;
  box(scene,"royal-suite-floor",[0,8.62,suiteZ],[24,.24,26],wingFloor);
  box(scene,"royal-suite-ceiling",[0,31.0,suiteZ],[24,.38,26],castleStone);
  for(const side of [-1,1]) {
    box(scene,"royal-suite-side-wall",[side*12,20.5,suiteZ],[.8,24,26],castleStone);
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
  box(scene,"royal-suite-back-wall-left",[-8,20.5,suiteZ-13],[8,24,.8],castleStone);
  box(scene,"royal-suite-back-wall-right",[8,20.5,suiteZ-13],[8,24,.8],castleStone);
  box(scene,"royal-suite-back-wall-lintel",[0,31,suiteZ-13],[8,3,.8],castleStone);
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

  // The private suite continues into a broad rear gallery instead of ending at a blank wall.
  const galleryZ=-135;
  const galleryFloor=mat(scene,"palace-gallery-marble",new Color3(.77,.74,.67),.34,.08);
  box(scene,"palace-rear-gallery-floor",[0,8.60,galleryZ],[30,.24,24],galleryFloor);
  box(scene,"palace-rear-gallery-ceiling",[0,29.5,galleryZ],[30,.4,24],castleStone);
  for(const side of [-1,1]) {
    box(scene,"palace-gallery-side-wall-front",[side*15,19,-127],[.8,20,8],castleStone);
    box(scene,"palace-gallery-side-wall-rear",[side*15,19,-143],[.8,20,8],castleStone);
    box(scene,"palace-gallery-chamber-outer-wall",[side*30,19,galleryZ],[.8,20,18],castleStone);
    box(scene,"palace-gallery-chamber-front-wall",[side*22.5,19,-126],[15,20,.8],castleStone);
    box(scene,"palace-gallery-chamber-rear-wall",[side*22.5,19,-144],[15,20,.8],castleStone);
    box(scene,"palace-gallery-chamber-floor",[side*22.5,8.58,galleryZ],[15,.22,18],galleryFloor);
    box(scene,"palace-gallery-chamber-ceiling",[side*22.5,29, galleryZ],[15,.3,18],castleStone);
    addAntiqueDoor(scene,"palace-gallery-room-door-"+side,side*15,8.8,galleryZ,3.8,5.6,mats,1.08,"x");
    for(const z of [-142,-135,-128]) {
      box(scene,"palace-gallery-window-recess",[side*14.52,18,z],[.12,5.2,2.7],castleShadow);
      box(scene,"palace-gallery-window-glass",[side*14.43,18,z],[.08,4.6,2.0],mats.glass);
      box(scene,"palace-gallery-window-sill",[side*14.25,15.4,z],[.42,.2,2.9],mats.trim);
    }
    for(let z=-144;z<=-128;z+=8) {
      cylinder(scene,"palace-gallery-column-base",[side*12.7,9,z],.95,.4,castleGold,16);
      cylinder(scene,"palace-gallery-column",[side*12.7,18,z],.46,17.8,mats.trim,16);
      cylinder(scene,"palace-gallery-column-cap",[side*12.7,27.3,z],.9,.4,castleGold,16);
    }
    if(side<0) {
      // Enclosed glass conservatory with rose trellises and a fountain.
      box(scene,"royal-conservatory-glass-roof",[-22.5,29.2,galleryZ],[14.5,.16,17.5],mats.glass);
      for(let xx=-29;xx<=-16;xx+=3.2) box(scene,"royal-conservatory-roof-rib",[xx,29.35,galleryZ],[.14,.3,18],castleGold);
      for(let z=-142;z<=-128;z+=4) {
        box(scene,"conservatory-rose-trellis",[-29,15,z],[.16,11,2.8],castleGold);
        for(let j=0;j<8;j++)
          addPetalBloom(scene,"conservatory-climbing-rose",new Vector3(-28.8,10.5+j*.95,z+(j%2)*.55),.18,mats.flowers,7);
        box(scene,"conservatory-planter",[-22,9.05,z],[10,.7,1.5],mats.trim);
        for(let j=0;j<8;j++)
          addPetalBloom(scene,"conservatory-rose-bloom",new Vector3(-26+j*1.1,9.9,z+(j%2)*.25),.22,mats.flowers,8);
      }
      cylinder(scene,"conservatory-fountain-basin",[-22.5,9.0,-135],4.0,.45,mats.trim,28);
      cylinder(scene,"conservatory-fountain-water",[-22.5,9.25,-135],3.5,.06,mats.glass,28);
      cylinder(scene,"conservatory-fountain-spire",[-22.5,10.0,-135],.55,1.4,castleGold,16);
    } else {
      // Royal chapel with a raised altar, carved pews and jewel-coloured windows.
      box(scene,"royal-chapel-altar",[22.5,10.0,-142.5],[5.5,1.4,1.8],castleGold);
      box(scene,"royal-chapel-altar-top",[22.5,10.8,-142.5],[6.1,.2,2.2],mats.trim);
      for(let row=0;row<4;row++) for(const dx of [-2,2])
        box(scene,"royal-chapel-pew",[22.5+dx,9.2,-139+row*3],[.75,.42,2.2],mats.wood);
      for(let i=0;i<5;i++) box(scene,"royal-chapel-stained-glass",[18+i*2.25,18.2,-144.4],[1.4,7,.08],i%2?mats.banner:mats.glass);
      const apse=MeshBuilder.CreateTorus("royal-chapel-apse-arch",{diameter:7.5,thickness:.28,tessellation:28},scene);
      apse.scaling.y=1.4;apse.position.set(22.5,17,-144.0);apse.rotation.y=Math.PI/2;apse.material=castleGold;
    }
  }
  addAntiqueDoor(scene,"royal-suite-gallery-double-door",0,8.8,suiteZ-13.5,6.2,7.0,mats,1.12);
  for(let x=-12;x<=12;x+=6) {
    box(scene,"palace-gallery-vault-rib",[x,29.2,galleryZ],[.3,.48,23],castleGold);
    const lamp=MeshBuilder.CreateCylinder("palace-gallery-pendant",{diameter:.36,height:1.0,tessellation:10},scene);
    lamp.position.set(x,27.6,galleryZ);lamp.material=castleGold;
    const glow=MeshBuilder.CreateSphere("palace-gallery-pendant-glow",{diameter:.45,segments:8},scene);
    glow.position.set(x,26.8,galleryZ);glow.material=mats.lantern;
  }


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
    const x=-23+i*7.5, height=19+(i%3)*3.5, baseY=8.7+height/2;
    const tower=MeshBuilder.CreateCylinder("castle-tower",{diameter:6.2,height,tessellation:24},scene);
    tower.position.set(x,baseY,-77);tower.material=castleStone;
    for(let ringY of [baseY-height*.36,baseY,baseY+height*.37]) {
      const ring=MeshBuilder.CreateTorus("castle-tower-course",{diameter:6.3,thickness:.22,tessellation:24},scene);
      ring.position.set(x,ringY,-77);ring.material=castleGold;
    }
    cylinder(scene,"castle-tower-foot",[x,9.15,-77],7.1,.9,mats.trim,24);
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
  // Stair coordinates match the new, deeper palace forecourt and its raised lobby floor.
  const stairStartZ=-86, stairEndZ=-112.2, stairRise=8.62, stairCount=36;
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

  // The whole palace complex is repositioned together after all of its rooms are built.



  // Yield between major districts so mobile Safari can service the page.
  await new Promise(resolve=>setTimeout(resolve,0));
  // A state ballroom extends beyond the suite and gallery as a fully enclosed, walkable palace wing.
  const ballroomFloor=mat(scene,"state-ballroom-marble",new Color3(.78,.75,.68),.24,.12);
  const ballroomGold=mat(scene,"state-ballroom-gilt",new Color3(.82,.62,.28),.28,.75);
  box(scene,"state-ballroom-floor",[0,8.62,-166],[44,.28,34],ballroomFloor);
  box(scene,"state-ballroom-ceiling",[0,34,-166],[44,.5,34],castleStone);
  box(scene,"state-ballroom-back-wall",[0,21,-183],[44,25,.9],castleStone);
  box(scene,"state-ballroom-side-wall-left",[-22,21,-166],[.9,25,34],castleStone);
  box(scene,"state-ballroom-side-wall-right",[22,21,-166],[.9,25,34],castleStone);
  box(scene,"state-ballroom-front-wall-left",[-16,21,-149],[12,25,.9],castleStone);
  box(scene,"state-ballroom-front-wall-right",[16,21,-149],[12,25,.9],castleStone);
  box(scene,"state-ballroom-front-lintel",[0,33,-149],[20,2,.9],castleStone);
  for(let x=-18;x<=18;x+=6) for(let z=-180;z<=-152;z+=6)
    box(scene,"state-ballroom-floor-inlay",[x,8.79,z],[5.5,.035,5.5],(Math.abs(x/6+z/6)%2===0)?mats.trim:ballroomGold);
  const medallion=MeshBuilder.CreateTorus("state-ballroom-floor-medallion",{diameter:13,thickness:.18,tessellation:48},scene);
  medallion.position.set(0,8.86,-166);medallion.material=ballroomGold;
  const innerMedallion=MeshBuilder.CreateTorus("state-ballroom-floor-inner-medallion",{diameter:8,thickness:.12,tessellation:40},scene);
  innerMedallion.position.set(0,8.88,-166);innerMedallion.material=palaceGold;
  for(const side of [-1,1]) for(let z=-178;z<=-154;z+=6) {
    cylinder(scene,"state-ballroom-column-base",[side*19.2,9.1,z],1.8,.6,ballroomGold,24);
    cylinder(scene,"state-ballroom-column",[side*19.2,21.2,z],.82,23.5,palaceIvory,24);
    cylinder(scene,"state-ballroom-column-capital",[side*19.2,33.2,z],1.9,.75,ballroomGold,24);
    box(scene,"state-ballroom-window-recess",[side*21.48,22,z],[.12,12,3.3],castleShadow);
    box(scene,"state-ballroom-window-glass",[side*21.38,22,z],[.08,10.8,2.6],palaceGlass);
    box(scene,"state-ballroom-window-mullion",[side*21.28,22,z],[.08,10.8,.14],ballroomGold);
    const arch=MeshBuilder.CreateTorus("state-ballroom-window-arch",{diameter:2.4,thickness:.2,tessellation:24},scene);
    arch.scaling.y=1.7;arch.position.set(side*21.3,28.1,z);arch.rotation.y=Math.PI/2;arch.material=ballroomGold;
  }
  box(scene,"state-ballroom-gallery-balcony",[0,23.5,-180.5],[28,1,3],palaceGold);
  box(scene,"state-ballroom-gallery-front",[0,25.3,-179],[28,2.6,.45],palaceIvory);
  for(let x=-13;x<=13;x+=1.3) {
    const bal=MeshBuilder.CreateCylinder("state-ballroom-gallery-baluster",{diameterTop:.12,diameterBottom:.2,height:1.7,tessellation:8},scene);
    bal.position.set(x,24.6,-178.72);bal.material=ballroomGold;
  }
  for(const z of [-176,-166,-156]) {
    const ring=MeshBuilder.CreateTorus("state-ballroom-chandelier-ring",{diameter:7.5,thickness:.2,tessellation:32},scene);
    ring.position.set(0,31.2,z);ring.material=ballroomGold;
    for(let i=0;i<12;i++) {
      const a=i*Math.PI*2/12;
      box(scene,"state-ballroom-chandelier-arm",[Math.cos(a)*2.8,31.2,z+Math.sin(a)*2.8],[1.1,.13,.13],ballroomGold);
      const candle=MeshBuilder.CreateCylinder("state-ballroom-chandelier-candle",{diameter:.15,height:.75,tessellation:8},scene);
      candle.position.set(Math.cos(a)*3.4,31.8,z+Math.sin(a)*3.4);candle.material=palaceIvory;
      const flame=MeshBuilder.CreateSphere("state-ballroom-chandelier-flame",{diameter:.22,segments:8},scene);
      flame.position.set(Math.cos(a)*3.4,32.3,z+Math.sin(a)*3.4);flame.material=mats.lantern;
    }
  }
  for(let x=-16;x<=16;x+=8) {
    box(scene,"state-ballroom-gilt-mirror-frame",[x,22,-182.35],[4.3,8.8,.28],ballroomGold);
    box(scene,"state-ballroom-gilt-mirror-glass",[x,22,-182.15],[3.6,7.9,.08],mats.glass);
    box(scene,"state-ballroom-mirror-top-crest",[x,27,-182],[1.2,.9,.15],ballroomGold);
  }
  for(let x=-18;x<=18;x+=6) for(let z=-180;z<=-152;z+=7)
    box(scene,"state-ballroom-ceiling-coffer",[x,33.68,z],[5.5,.12,6.5],ballroomGold);
  // Fine pilasters and carved medallions give the great hall a finished royal scale.
  for(const side of [-1,1]) for(let z=-178;z<=-154;z+=4) {
    box(scene,"state-ballroom-gilt-pilaster",[side*21.1,22,z],[.34,19,1.15],ballroomGold);
    box(scene,"state-ballroom-pilaster-capital",[side*21.1,31.7,z],[.9,.52,1.55],palaceIvory);
    box(scene,"state-ballroom-pilaster-base",[side*21.1,15.8,z],[.9,.52,1.55],palaceIvory);
  }
  for(let x=-16;x<=16;x+=8) {
    const wallMedallion=MeshBuilder.CreateTorus("state-ballroom-wall-medallion",{diameter:2.2,thickness:.13,tessellation:64},scene);
    wallMedallion.position.set(x,25.2,-182.42);wallMedallion.rotation.y=Math.PI/2;wallMedallion.material=ballroomGold;
  }

  // Move the complete royal complex 40 metres deeper into the estate.
  // The entrance gate remains at the city edge, leaving a generous garden forecourt.
  for(const mesh of scene.meshes.slice(royalPalaceStartIndex)) {
    if(mesh.name!=="world-tree-approach") mesh.position.z-=40;
  }
  // Bring the existing detailed ballroom directly behind the second-floor corridor.
  for(const mesh of scene.meshes) if(mesh.name.startsWith("state-ballroom-")) {
    mesh.position.y+=6.28;
    mesh.position.z+=47;
  }
  // Remove obsolete gatehouse fragments and the dark cliff shoulders that
  // remained directly behind the new transverse palace balcony.
  for(const mesh of [...scene.meshes]) {
    if(/^(gatehouse-tower-window|gatehouse-window-sill|gatehouse-tower-balcony|gatehouse-baluster|gatehouse-side-stringcourse|distant-waterfall|castle-cliff-shoulder)$/.test(mesh.name)) mesh.dispose(false,false);
  }
  // Discard the former staircase/landing that was shifted with the palace.
  // It used to leave a phantom climb in the old coordinates.
  for(const mesh of [...scene.meshes]) {
    if(/^(castle-approach-step|castle-step-nosing|castle-stair-side-parapet|royal-gate-landing|royal-gate-carpet|royal-stair-urn)/.test(mesh.name)) mesh.dispose(false,false);
  }
  // Remove obsolete gatehouse leaves, arch fragments and banners that were
  // left suspended over the new carriage stair after the palace was shifted.
  for(const mesh of [...scene.meshes]) {
    const oldGate=/^(gate-shadow|royal-gate-open-leaf|royal-gate-gold-strapping|gate-arch-inner-voussoir|gate-pier|gate-arch-stone|royal-crest-medallion)$/.test(mesh.name);
    const oldGateBanner=/^(banner-pole|royal-banner)$/.test(mesh.name) &&
      mesh.position.z>-115.2 && mesh.position.z<-112.0 &&
      Math.abs(mesh.position.x)>6.5 && Math.abs(mesh.position.x)<10.0;
    if(oldGate||oldGateBanner) mesh.dispose(false,false);
  }
  // Rebuild a continuous, visible staircase from the carriage court to the raised entrance.
  for(let step=0;step<stairCount;step++) {
    const rise=stairRise/stairCount, tread=(stairStartZ-stairEndZ)/stairCount;
    const top=(step+1)*rise, z=stairStartZ-(step+.5)*tread;
    const treadMesh=box(scene,"palace-entry-step",[0,top-rise/2,z],[15.8,rise,tread+.08],castleStone);
    treadMesh.receiveShadows=true;
    const nosing=box(scene,"palace-entry-step-nosing",[0,top-.045,z+tread*.43],[15.95,.09,.12],palaceGold);
    nosing.receiveShadows=true;
    for(const side of [-1,1]) {
      const parapet=box(scene,"palace-entry-stair-parapet",[side*8.15,top/2,z],[.48,Math.max(.5,top),tread+.08],castleStone);
      parapet.receiveShadows=true;
    }
  }
  // Ornate lantern standards line both sides of the grand approach, stepping up with the stair.
  for(const side of [-1,1]) for(const z of [-88,-96,-104,-110]) {
    const progress=(stairStartZ-z)/(stairStartZ-stairEndZ);
    const level=stairRise*progress,x=side*9.45;
    cylinder(scene,"palace-stair-lantern-stone-foot",[x,level+.28,z],.92,.56,castleStone,16);
    cylinder(scene,"palace-stair-lantern-gilt-column",[x,level+1.48,z],.22,2.0,castleGold,14);
    cylinder(scene,"palace-stair-lantern-capital",[x,level+2.48,z],.62,.22,castleGold,16);
    const housing=MeshBuilder.CreateBox("palace-stair-lantern-housing",{width:.86,height:1.08,depth:.86},scene);
    housing.position.set(x,level+3.02,z);housing.material=castleGold;
    const glass=MeshBuilder.CreateBox("palace-stair-lantern-glass",{width:.60,height:.80,depth:.60},scene);
    glass.position.set(x,level+3.02,z);glass.material=mats.glass;
    const flame=MeshBuilder.CreateSphere("palace-stair-lantern-glow",{diameter:.34,segments:12},scene);
    flame.position.set(x,level+3.02,z);flame.material=mats.lantern;
    const roof=MeshBuilder.CreateCylinder("palace-stair-lantern-roof",{diameterTop:.12,diameterBottom:1.12,height:.48,tessellation:8},scene);
    roof.position.set(x,level+3.80,z);roof.material=castleGold;
    const finial=MeshBuilder.CreateSphere("palace-stair-lantern-finial",{diameter:.22,segments:10},scene);
    finial.position.set(x,level+4.12,z);finial.material=castleGold;
  }
  // Level threshold between the last tread, the open gate and the lobby.
  box(scene,"palace-entry-landing",[0,8.44,-148.5],[54,.36,70],castleStone);
  // A broad, open first-floor royal lobby: deliberately no exterior facade yet.
  const openHallLobbyWall=mat(scene,"royal-lobby-limestone",new Color3(.91,.90,.86),.92);
  const openHallLobbyTrim=mat(scene,"royal-lobby-gilt",new Color3(.78,.57,.25),.32,.72);
  const openHallLobbyCeiling=mat(scene,"royal-lobby-ceiling",new Color3(.82,.78,.68),.9);
  const openHallLobbyFloorMat=mat(scene,"royal-lobby-marble",new Color3(.78,.75,.68),.25,.08);
  const openHallLobbyTop=8.62, openHallLobbyHeight=18.0, openHallLobbyMidY=openHallLobbyTop+openHallLobbyHeight/2;
  const openHallLobbyFloor=box(scene,"royal-lobby-marble-floor",[0,8.61,-148.5],[53.6,.12,69.6],openHallLobbyFloorMat);
  openHallLobbyFloor.receiveShadows=true;
  box(scene,"royal-lobby-ceiling",[0,28.12,-148.5],[54,.5,69.2],openHallLobbyCeiling);
  // Tall side and rear walls enclose the walkable hall; the front remains a wide open entrance.
  for(const side of [-1,1]) {
    box(scene,"royal-lobby-side-wall",[side*27,openHallLobbyMidY,-148.5],[.9,openHallLobbyHeight,69.2],openHallLobbyWall);
    box(scene,"royal-lobby-side-gilt-course",[side*26.48,27.05,-148.5],[.14,.32,68.4],openHallLobbyTrim);
    for(const z of [-166,-148.5,-131]) {
      const pilaster=box(scene,"royal-lobby-side-pilaster",[side*26.35,18.0,z],[.42,17.8,1.0],openHallLobbyTrim);
      pilaster.receiveShadows=true;
    }
  }
  box(scene,"royal-lobby-rear-wall",[0,openHallLobbyMidY,-183.5],[54,openHallLobbyHeight,.9],openHallLobbyWall);
  box(scene,"royal-lobby-rear-gilt-course",[0,27.05,-182.98],[53.2,.32,.14],openHallLobbyTrim);
  // The full front edge remains open from the stair into the great hall.
  // Perimeter columns add palace scale without narrowing the central walking area.
  for(const side of [-1,1]) for(const z of [-166,-148.5,-131]) {
    cylinder(scene,"royal-lobby-column-base",[side*23.2,9.05,z],1.55,.72,openHallLobbyTrim,32);
    cylinder(scene,"royal-lobby-column-shaft",[side*23.2,18.0,z],.68,17.3,openHallLobbyWall,32);
    cylinder(scene,"royal-lobby-column-capital",[side*23.2,26.8,z],1.7,.78,openHallLobbyTrim,32);
    colliders.push({minX:side*23.2-.82,maxX:side*23.2+.82,minZ:z-.82,maxZ:z+.82});
  }
  // Grand central chandelier suspended over the open marble hall.
  const openHallChandelierGold=mat(scene,"royal-lobby-chandelier-gold",new Color3(.86,.65,.30),.25,.82);
  const openHallChandelierIvory=mat(scene,"royal-lobby-chandelier-ivory",new Color3(.94,.83,.61),.3,.3);
  const openHallChandelierGlow=mat(scene,"royal-lobby-chandelier-glow",new Color3(1,.72,.32),.18,.12);
  openHallChandelierGlow.emissiveColor=new Color3(1,.48,.14);
  const openHallChain=MeshBuilder.CreateCylinder("royal-lobby-chandelier-openHallChain",{diameter:.16,height:4.2,tessellation:12},scene);
  openHallChain.position.set(0,25.0,-148.5);openHallChain.material=openHallChandelierGold;
  const openHallCanopy=MeshBuilder.CreateCylinder("royal-lobby-chandelier-openHallCanopy",{diameter:1.35,height:.42,tessellation:24},scene);
  openHallCanopy.position.set(0,27.65,-148.5);openHallCanopy.material=openHallChandelierGold;
  for(const [diameter,y] of [[8.4,22.25],[6.0,21.45],[3.4,20.72]]) {
    const ring=MeshBuilder.CreateTorus("royal-lobby-chandelier-ring",{diameter,thickness:.22,tessellation:64},scene);
    ring.position.set(0,y,-148.5);ring.material=openHallChandelierGold;
  }
  for(let i=0;i<16;i++) {
    const a=i*Math.PI*2/16, x=Math.cos(a), z=Math.sin(a);
    const openHallArm=MeshBuilder.CreateTube("royal-lobby-chandelier-openHallArm",{
      path:[new Vector3(x*.65,22.9,-148.5+z*.65),new Vector3(x*2.4,22.65,-148.5+z*2.4),new Vector3(x*4.65,22.9,-148.5+z*4.65)],
      radius:.105,tessellation:10
    },scene);
    openHallArm.material=openHallChandelierGold;
    const openHallCandle=MeshBuilder.CreateCylinder("royal-lobby-chandelier-openHallCandle",{diameter:.19,height:.72,tessellation:12},scene);
    openHallCandle.position.set(x*4.8,23.35,-148.5+z*4.8);openHallCandle.material=openHallChandelierIvory;
    const openHallFlame=MeshBuilder.CreateSphere("royal-lobby-chandelier-openHallFlame",{diameter:.34,segments:16},scene);
    openHallFlame.position.set(x*4.8,23.9,-148.5+z*4.8);openHallFlame.material=openHallChandelierGlow;
  }
  const openHallChandelierCore=MeshBuilder.CreateSphere("royal-lobby-chandelier-core",{diameter:1.0,segments:24},scene);
  openHallChandelierCore.position.set(0,21.45,-148.5);openHallChandelierCore.material=openHallChandelierGlow;
  // A brass-and-marble threshold bridges the last stair tread into the lobby floor.
  box(scene,"royal-lobby-entry-threshold",[0,8.69,-115.0],[13.8,.055,4.4],openHallLobbyTrim);
  box(scene,"royal-lobby-entry-threshold-inset",[0,8.725,-115.0],[11.8,.025,3.7],openHallLobbyFloorMat);
  const openHallCarpet=mat(scene,"royal-lobby-burgundy-carpet",new Color3(.30,.045,.075),.94);
  box(scene,"royal-lobby-central-carpet",[0,8.70,-148.5],[5.4,.035,60],openHallCarpet);
  for(const side of [-1,1])box(scene,"royal-lobby-carpet-gilt-border",[side*2.82,8.725,-148.5],[.075,.025,59.6],openHallLobbyTrim);
  const openHallDeskWood=mat(scene,"royal-lobby-reception-walnut",new Color3(.25,.12,.065),.72);
  for(const side of [-1,1]){box(scene,"royal-lobby-reception-desk",[side*9.2,9.35,-172.2],[6.4,1.35,1.45],openHallDeskWood);box(scene,"royal-lobby-reception-countertop",[side*9.2,10.08,-172.2],[6.7,.18,1.62],openHallLobbyTrim);}
  // A classic imperial double staircase: two broad flights sweep inward and
  // meet at one shared landing on the centre line of the upper gallery.
  const openHallStairStone=mat(scene,"royal-lobby-stair-marble",new Color3(.72,.69,.62),.24,.08);
  const openHallStairGold=mat(scene,"royal-lobby-stair-brass",new Color3(.82,.62,.29),.28,.78);
  const openHallRailStone=mat(scene,"royal-lobby-balustrade-stone",new Color3(.83,.78,.67),.38,.12);
  const openHallGalleryY=16.2;
  box(scene,"royal-lobby-upper-gallery-floor",[0,16.18,-178.0],[40,.38,8.8],openHallStairStone);
  // The two flights arrive together through this broad, unrailed central opening.
  box(scene,"royal-lobby-double-stair-shared-landing",[0,16.20,-174.0],[10.2,.24,8.0],openHallStairStone);
  // Protect the open atrium edge, but leave a generous 10-metre mouth for the stairs.
  for(const [start,end] of [[-19,-5.1],[5.1,19]]) {
    box(scene,"royal-lobby-upper-gallery-front-rail-section",[(start+end)/2,17.05,-173.62],[end-start,.22,.22],openHallStairGold);
    for(let x=start+.25;x<end-.1;x+=.85)cylinder(scene,"royal-lobby-upper-gallery-baluster",[x,16.68,-173.62],.16,.78,openHallRailStone,12);
  }
  // A rear balustrade and side rails keep the upper level safely enclosed.
  box(scene,"royal-lobby-upper-gallery-rear-rail",[0,17.05,-182.25],[39,.22,.22],openHallStairGold);
  for(let x=-19;x<=19.01;x+=.95)cylinder(scene,"royal-lobby-upper-gallery-rear-baluster",[x,16.68,-182.25],.16,.78,openHallRailStone,12);
  for(const side of [-1,1]){
    box(scene,"royal-lobby-upper-gallery-side-rail",[side*19.55,17.05,-178],[.22,.22,8.5],openHallStairGold);
    for(let z=-181.6;z<=-174.4;z+=.95)cylinder(scene,"royal-lobby-upper-gallery-side-baluster",[side*19.55,16.68,z],.16,.78,openHallRailStone,12);
    const outerRailPath=[],steps=40;
    for(let i=0;i<steps;i++){
      const t=(i+.5)/steps,px=18*(1-t),pz=-132-39*t,py=openHallLobbyTop+7.58*t;
      const nextT=Math.min(1,t+.01),nextX=18*(1-nextT),dx=side*(nextX-px),yaw=Math.atan2(dx,-.39);
      const tread=box(scene,"royal-lobby-curved-stair-tread",[side*px,py,pz],[3.65,.22,1.22],openHallStairStone,{rotation:yaw});
      tread.receiveShadows=true;
      box(scene,"royal-lobby-curved-stair-gilt-nosing",[side*px,py+.12,pz-.02],[3.68,.055,1.25],openHallStairGold,{rotation:yaw});
      if(i%2===0) {
        const outerX=side*(px+1.88);
        const post=cylinder(scene,"royal-lobby-stair-outer-baluster",[outerX,py+.49,pz],.14,.92,openHallRailStone,12);
      }
    }
    const outerRail=[];
    for(let i=0;i<=32;i++){
      const t=i/32,px=18*(1-t),pz=-132-39*t,py=openHallLobbyTop+7.58*t+1.02;
      outerRail.push(new Vector3(side*(px+1.88),py,pz));
    }
    const rail=MeshBuilder.CreateTube("royal-lobby-curved-stair-outer-handrail",{path:outerRail,radius:.105,tessellation:12},scene);
    rail.material=openHallStairGold;
    for(const t of [0,1]){
      const px=18*(1-t),pz=-132-39*t,py=openHallLobbyTop+7.58*t;
      cylinder(scene,"royal-lobby-stair-newel-base",[side*px,py+.25,pz],.72,.5,openHallStairGold,20);
      cylinder(scene,"royal-lobby-stair-newel-finial",[side*px,py+1.18,pz],.34,.42,openHallStairGold,16);
    }
  }
  // A single transverse balcony sits exactly between the outdoor stair and the red-carpet axis.
  // Its centre stays open so visitors can continue straight from the stair to the carpet.
  const openHallBalconyStone=mat(scene,"royal-entry-cross-balcony-white-stone",new Color3(.94,.93,.89),.34,.10);
  const openHallBalconyGreen=mat(scene,"royal-entry-cross-balcony-green",new Color3(.12,.29,.14),.9);
  const openHallBalconyRose=mat(scene,"royal-entry-cross-balcony-rose",new Color3(.78,.18,.28),.82);
  const openHallBalconyCream=mat(scene,"royal-entry-cross-balcony-cream",new Color3(.94,.86,.70),.86);
  const crossBalconyZ=-117.0;
  box(scene,"royal-entry-cross-balcony-floor",[0,8.68,crossBalconyZ],[49.2,.22,6.8],openHallBalconyStone);
  // The garden-facing edge keeps a light balustrade; the inner edge becomes a
  // continuous white palace wall with a grand central double doorway.
  for(const [start,end] of [[-24.3,-5.3],[5.3,24.3]]) {
    box(scene,"royal-entry-cross-balcony-front-rail",[(start+end)/2,9.48,-113.65],[end-start,.22,.22],openHallStairGold);
    for(let x=start+.28;x<end-.1;x+=.88)cylinder(scene,"royal-entry-cross-balcony-front-baluster",[x,9.06,-113.65],.14,.82,openHallRailStone,12);
  }
  const crossWallZ=-120.35, crossWallBase=8.79, crossWallHeight=8.55, crossDoorWidth=9.2;
  const crossWallY=crossWallBase+crossWallHeight/2;
  for(const [start,end] of [[-24.3,-crossDoorWidth/2-.35],[crossDoorWidth/2+.35,24.3]]) {
    const width=end-start,center=(start+end)/2;
    box(scene,"royal-entry-cross-balcony-inner-white-wall",[center,crossWallY,crossWallZ],[width,crossWallHeight,.72],openHallBalconyStone);
    box(scene,"royal-entry-cross-balcony-inner-wall-baseboard",[center,9.02,crossWallZ-.39],[width,.34,.16],openHallLobbyTrim);
    box(scene,"royal-entry-cross-balcony-inner-wall-cornice",[center,17.22,crossWallZ-.39],[width,.32,.22],openHallLobbyTrim);
  }
  // A generous opening leads directly into the chandelier hall.
  addAntiqueDoor(scene,"royal-entry-chandelier-double-door",0,8.78,crossWallZ,crossDoorWidth,8.15,mats,0);
  const crossDoorCrest=MeshBuilder.CreateCylinder("royal-entry-chandelier-door-crest",{diameter:1.45,height:.16,tessellation:24},scene);
  crossDoorCrest.position.set(0,17.05,crossWallZ-.48);crossDoorCrest.rotation.x=Math.PI/2;crossDoorCrest.material=openHallLobbyTrim;
  // End rails protect both exposed ends without closing the walkable cross-axis.
  for(const side of [-1,1]) {
    box(scene,"royal-entry-cross-balcony-end-rail",[side*24.45,9.48,crossBalconyZ],[.22,.22,6.45],openHallStairGold);
    for(let z=-119.8;z<=-114.2;z+=.88)cylinder(scene,"royal-entry-cross-balcony-end-baluster",[side*24.45,9.06,z],.14,.82,openHallRailStone,12);
    // Low flower troughs and climbing roses decorate the two wings.
    box(scene,"royal-entry-cross-balcony-planter",[side*17.0,8.99,crossBalconyZ],[2.2,.58,4.8],openHallBalconyStone);
    box(scene,"royal-entry-cross-balcony-soil",[side*17.0,9.30,crossBalconyZ],[1.95,.08,4.5],openHallDeskWood);
    for(let j=0;j<7;j++) {
      const z=crossBalconyZ-1.8+j*.6,x=side*(16.45+(j%2)*.42);
      const stem=MeshBuilder.CreateTube("royal-entry-cross-balcony-rose-cane",{path:[new Vector3(x,9.34,z),new Vector3(x+side*.10,9.82,z),new Vector3(x,10.18,z)],radius:.025,tessellation:6},scene);
      stem.material=openHallBalconyGreen;
      addPetalBloom(scene,"royal-entry-cross-balcony-rose",new Vector3(x,10.20,z),.29,j%2?openHallBalconyRose:openHallBalconyCream,7);
    }
  }
  const openHallPortraitMat=mat(scene,"royal-lobby-portrait-ground",new Color3(.16,.12,.10),.88);
  for(const side of [-1,1])for(const z of [-165,-148.5,-132]){box(scene,"royal-lobby-portrait-frame",[side*26.32,18.2,z],[.22,4.3,3.0],openHallLobbyTrim);box(scene,"royal-lobby-portrait-canvas",[side*26.18,18.2,z],[.08,3.65,2.35],openHallPortraitMat);}
  // Wall colliders bound the full hall while leaving the entrance completely open.
  colliders.push({minX:-27.7,maxX:-26.3,minZ:-184.0,maxZ:-113.0},{minX:26.3,maxX:27.7,minZ:-184.0,maxZ:-113.0},{minX:-27.7,maxX:27.7,minZ:-184.2,maxZ:-182.8});

  // A broad carriage court with a circular turning area, clipped hedges and low topiary.
  const courtStone=mat(scene,"palace-carriage-court-stone",new Color3(.62,.59,.51),.92);
  const courtGrass=mat(scene,"palace-court-grass",new Color3(.16,.28,.16),.98);
  const courtHedge=texturedMat(scene,"palace-court-clipped-hedge",new Color3(.10,.25,.13),"#315337","#102415",.98);
  const courtRoad=MeshBuilder.CreateGround("palace-carriage-drive",{width:17,height:58,subdivisions:1},scene);
  courtRoad.position.set(0,.005,-82.5);courtRoad.material=courtStone;
  const turning=MeshBuilder.CreateCylinder("palace-carriage-turning-circle",{diameter:23,height:.16,tessellation:48},scene);
  turning.position.set(0,.10,-82);turning.material=pavingLight;
  const turningInset=MeshBuilder.CreateCylinder("palace-turning-circle-inset",{diameter:16,height:.10,tessellation:40},scene);
  turningInset.position.set(0,.20,-82);turningInset.material=courtStone;
  const centralIsland=MeshBuilder.CreateCylinder("palace-turning-garden-island",{diameter:7.2,height:.38,tessellation:32},scene);
  centralIsland.position.set(0,.38,-82);centralIsland.material=courtGrass;
  cylinder(scene,"palace-turning-island-planter",[0,.72,-82],2.4,.28,mats.trim,24);
  for(let i=0;i<12;i++){
    const a=i*Math.PI/6;
    const shrub=MeshBuilder.CreateSphere("palace-turning-island-shrub",{diameter:1.05,segments:32},scene);
    shrub.position.set(Math.cos(a)*1.55,1.18,-82+Math.sin(a)*1.55);shrub.scaling.y=.78;shrub.material=courtHedge;
  }
  for(const side of [-1,1]) {
    // Long clipped borders and planted islands frame the drive without narrowing it.
    for(let row=0;row<3;row++) {
      const x=side*(22+row*7.2);
      // Leave a deliberate cross-path through every western garden hedge row.
      // Open a broad east-west passage through the western garden, aligned
      // with the public library entrance. Keep the clipped hedge on both sides.
      box(scene,"palace-court-hedge-border",[x,.72,-96.5],[1.05,1.25,19],courtHedge);
      box(scene,"palace-court-hedge-border",[x,.72,-70.5],[1.05,1.25,13],courtHedge);
      box(scene,"palace-court-hedge-border",[x,.72,-58.5],[1.05,1.25,1],courtHedge);
      for(let z=-101;z<=-63;z+=9) {
        // Clear the western first-row planting bed at z=-74: this is the
        // approach corridor directly behind the new library garden arch.
        if(z===-65 || z===-83 || (row===0 && z===-74)) continue;
        const bed=MeshBuilder.CreateBox("palace-court-shrub-island",{width:5.8,height:.34,depth:4.6},scene);
        bed.position.set(side*(16.0+row*7.2),.22,z);bed.material=courtGrass;
        for(let n=0;n<5;n++) {
          const shrub=MeshBuilder.CreateSphere("palace-court-topiary",{diameter:.92,segments:32},scene);
          shrub.position.set(side*(14.1+row*7.2)+n*.92,.95,z+(n%2?-.55:.55));
          shrub.scaling.y=.82;shrub.material=courtHedge;
        }
      }
    }
    for(let z=-105;z<=-60;z+=15) {
      const lamp=MeshBuilder.CreateCylinder("palace-court-lamp-post",{diameter:.18,height:4.2,tessellation:10},scene);
      lamp.position.set(side*11.2,2.1,z);lamp.material=castleGold;
      const glow=MeshBuilder.CreateSphere("palace-court-lamp-globe",{diameter:.65,segments:10},scene);
      glow.position.set(side*11.2,4.25,z);glow.material=mats.lantern;
      const plinth=MeshBuilder.CreateCylinder("palace-court-lamp-plinth",{diameter:.75,height:.55,tessellation:10},scene);
      plinth.position.set(side*11.2,.28,z);plinth.material=castleStone;
    }
  }

  // The palace vestibule is a real walk-in lobby, connecting the open portico to the throne hall.
  const lobbyFloor=mat(scene,"palace-lobby-marble",new Color3(.78,.75,.68),.32,.08);
  const lobbyWall=mat(scene,"palace-lobby-wall",new Color3(.79,.74,.64),.88);
  const lobbyWood=mat(scene,"palace-lobby-walnut",new Color3(.20,.105,.06),.72);
  const lobbyVelvet=mat(scene,"palace-lobby-velvet",new Color3(.38,.08,.16),.88);
  box(scene,"palace-lobby-floor",[0,8.62,-120],[18,.24,11],lobbyFloor);
  box(scene,"palace-lobby-runner",[0,8.77,-120],[4.6,.06,10.2],lobbyVelvet);
  // A monumental pair of carved walnut doors closes the main entrance.
  addAntiqueDoor(scene,"palace-grand-entry-double-door",0,8.72,-112.78,5.8,7.25,mats,1.02);
  // Raised clerestory walls and taller columns open the lobby into a true two-storey hall.
  const lobbyPortraitGold=mat(scene,"palace-portrait-gilt-frame",new Color3(.78,.57,.25),.28,.72);
  const lobbyPortraitDark=mat(scene,"palace-portrait-shadow-frame",new Color3(.20,.12,.075),.58,.12);
  const royalPortraitNames=["Aldric I","Queen Elowen","King Cedric II","Queen Isolde","King Rowan III","Queen Aurelia"];
  const royalPortraitBacks=["#263d52","#57303a","#314a3a","#493b59","#72502e","#284b55"];
  for(let i=0;i<royalPortraitNames.length;i++) {
    const side=i<3?-1:1,slot=i%3,z=-123.2+slot*3.55,y=18.7;
    const tex=new DynamicTexture("royal-portrait-canvas-"+i,{width:320,height:420},scene,false);
    const ctx=tex.getContext();
    ctx.fillStyle="#d8c49b";ctx.fillRect(0,0,320,420);
    ctx.fillStyle=royalPortraitBacks[i];ctx.fillRect(18,18,284,384);
    ctx.strokeStyle="#d6b56f";ctx.lineWidth=7;ctx.strokeRect(28,28,264,364);
    ctx.fillStyle="#e2cda8";ctx.beginPath();ctx.ellipse(160,166,66,82,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=i%2?"#3a241c":"#241b17";
    ctx.beginPath();ctx.ellipse(160,132,76,66,0,Math.PI,Math.PI*2);ctx.fill();
    ctx.fillRect(87,130,25,65);ctx.fillRect(208,130,25,65);
    ctx.fillStyle="#33231d";ctx.beginPath();ctx.arc(137,166,6,0,Math.PI*2);ctx.arc(183,166,6,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle="#8d5140";ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(143,207);ctx.quadraticCurveTo(160,218,177,207);ctx.stroke();
    ctx.fillStyle=i%2?"#f0e7d2":"#9e2833";ctx.beginPath();ctx.moveTo(70,370);ctx.quadraticCurveTo(82,264,160,258);ctx.quadraticCurveTo(238,264,250,370);ctx.fill();
    ctx.fillStyle="#d8b45e";ctx.beginPath();ctx.moveTo(108,95);ctx.lineTo(118,58);ctx.lineTo(145,82);ctx.lineTo(160,48);ctx.lineTo(178,82);ctx.lineTo(205,58);ctx.lineTo(212,95);ctx.closePath();ctx.fill();
    ctx.fillStyle="#f2dfb8";ctx.font="bold 20px Georgia";ctx.textAlign="center";ctx.fillText(royalPortraitNames[i],160,397);
    tex.update();
    const portraitMat=new StandardMaterial("royal-portrait-painting-"+i,scene);portraitMat.diffuseTexture=tex;portraitMat.emissiveColor=new Color3(.08,.06,.035);
    const frame=box(scene,"palace-royal-portrait-gilt-frame",[side*8.56,y,z],[.22,3.65,2.55],lobbyPortraitGold);
    const inner=box(scene,"palace-royal-portrait-dark-rebate",[side*8.42,y,z],[.10,3.35,2.25],lobbyPortraitDark);
    const painting=MeshBuilder.CreatePlane("palace-royal-portrait-canvas",{width:2.08,height:3.12},scene);
    painting.position.set(side*8.35,y,z);painting.rotation.y=side===1?-Math.PI/2:Math.PI/2;painting.material=portraitMat;
    const plaque=box(scene,"palace-royal-portrait-nameplate",[side*8.40,y-1.98,z],[.10,.22,1.45],lobbyPortraitGold);
  }
  for(const side of [-1,1]) {
    box(scene,"palace-lobby-side-wall",[side*9,18,-120],[.55,18,11],lobbyWall);
    for(let z=-124;z<=-116;z+=4) {
      cylinder(scene,"palace-lobby-column-base",[side*7.8,9.0,z],.95,.38,palaceGold,16);
      cylinder(scene,"palace-lobby-column",[side*7.8,18.0,z],.42,17.6,palaceIvory,20);
      cylinder(scene,"palace-lobby-column-capital",[side*7.8,27.1,z],.92,.52,palaceGold,20);
    }
    box(scene,"palace-lobby-welcome-desk",[side*5.9,9.55,-120],[2.9,1.7,1.35],lobbyWood);
    box(scene,"palace-lobby-desk-top",[side*5.9,10.45,-120],[3.1,.18,1.5],palaceGold);
    box(scene,"palace-lobby-desk-front-inlay",[side*5.9,9.55,-120.71],[2.1,.9,.08],lobbyVelvet);
    for(let j=0;j<2;j++) {
      box(scene,"palace-lobby-waiting-seat",[side*4.8,9.1,-124+j*2.0],[2.0,.38,.82],lobbyWood);
      box(scene,"palace-lobby-waiting-seat-back",[side*4.8,10.0,-124.4+j*2.0],[2.0,1.35,.2],lobbyVelvet);
    }
    box(scene,"palace-lobby-wall-panel",[side*8.68,19.0,-120],[.08,7.0,4.4],palaceBlue);
    box(scene,"palace-lobby-wall-panel-frame",[side*8.58,19.0,-120],[.08,7.5,4.8],palaceGold);
  }
  // A suspended multi-tier chandelier fills the tall central volume with warm light.
  const lobbyChandelier=MeshBuilder.CreateTorus("palace-lobby-chandelier-ring",{diameter:5.8,thickness:.18,tessellation:36},scene);
  lobbyChandelier.position.set(0,24.5,-120);lobbyChandelier.material=palaceGold;
  const chandelierChain=MeshBuilder.CreateCylinder("palace-lobby-chandelier-chain",{diameter:.09,height:3.0,tessellation:10},scene);
  chandelierChain.position.set(0,26.1,-120);chandelierChain.material=palaceGold;
  for(let i=0;i<12;i++) {
    const a=i*Math.PI/6;
    const arm=MeshBuilder.CreateTube("palace-lobby-chandelier-arm",{path:[new Vector3(0,24.5,-120),new Vector3(Math.cos(a)*2.25,24.5,-120+Math.sin(a)*2.25)],radius:.075,tessellation:8},scene);
    arm.material=palaceGold;
    const candle=MeshBuilder.CreateCylinder("palace-lobby-chandelier-candle",{diameter:.13,height:.55,tessellation:8},scene);
    candle.position.set(Math.cos(a)*2.25,24.82,-120+Math.sin(a)*2.25);candle.material=palaceIvory;
    const bulb=MeshBuilder.CreateSphere("palace-lobby-chandelier-bulb",{diameter:.28,segments:10},scene);
    bulb.position.set(Math.cos(a)*2.25,25.18,-120+Math.sin(a)*2.25);bulb.material=mats.lantern;
  }
  // Twin grand stair flights rise from the lobby to an open upper gallery.
  const upperStairStart=-116.25,upperStairEnd=-124.55,upperStairRise=6.0,upperStairCount=15;
  for(const side of [-1,1]) {
    const stairX=side*3.35,tread=(upperStairStart-upperStairEnd)/upperStairCount;
    for(let i=0;i<upperStairCount;i++) {
      const progress=(i+.5)/upperStairCount,y=8.82+upperStairRise*progress,z=upperStairStart-(i+.5)*tread;
      const step=box(scene,"palace-lobby-upper-stair-step",[stairX,y,z],[2.65,.24,tread+.05],lobbyFloor);
      step.receiveShadows=true;
      for(const railSide of [-1,1]) {
        const post=cylinder(scene,"palace-lobby-stair-baluster",[stairX+railSide*1.38,8.95+upperStairRise*progress/2,z],.10,1.0,lobbyPortraitGold,8);
        post.position.y=8.95+(upperStairRise*progress)-.35;
      }
    }
    const handrail=MeshBuilder.CreateTube("palace-lobby-stair-handrail",{path:[
      new Vector3(stairX-side*1.48,9.55,upperStairStart),
      new Vector3(stairX-side*1.48,15.15,upperStairEnd)
    ],radius:.095,tessellation:10},scene);
    handrail.material=palaceGold;
    const outerRail=MeshBuilder.CreateTube("palace-lobby-stair-outer-handrail",{path:[
      new Vector3(stairX+side*1.48,9.55,upperStairStart),
      new Vector3(stairX+side*1.48,15.15,upperStairEnd)
    ],radius:.095,tessellation:10},scene);
    outerRail.material=palaceGold;
  }
  box(scene,"palace-lobby-upper-gallery-floor",[0,14.9,-127.0],[12.5,.3,5.2],lobbyFloor);
  box(scene,"palace-lobby-upper-gallery-runner",[0,15.08,-127.0],[5.0,.05,4.7],lobbyVelvet);
  // A long, detailed corridor connects the upper stair landing to the great hall.
  box(scene,"palace-upper-corridor-floor",[0,14.9,-134.8],[12.4,.32,15.8],lobbyFloor);
  box(scene,"palace-upper-corridor-runner",[0,15.08,-134.8],[4.2,.055,15.2],lobbyVelvet);
  for(const side of [-1,1]) {
    box(scene,"palace-upper-corridor-wall",[side*6.35,19.1,-134.8],[.34,8.2,15.8],lobbyWall);
    for(let z=-129;z>=-140;z-=3.6) {
      cylinder(scene,"palace-upper-corridor-column-base",[side*5.75,15.25,z],.55,.42,palaceGold,32);
      cylinder(scene,"palace-upper-corridor-column",[side*5.75,18.9,z],.23,7.0,palaceIvory,40);
      cylinder(scene,"palace-upper-corridor-column-capital",[side*5.75,22.55,z],.58,.38,palaceGold,32);
      box(scene,"palace-upper-corridor-sconce",[side*6.08,20.3,z],[.16,.72,.52],palaceGold);
      const light=MeshBuilder.CreateSphere("palace-upper-corridor-sconce-light",{diameter:.22,segments:16},scene);
      light.position.set(side*5.94,20.35,z-.04);light.material=mats.lantern;
    }
  }
  box(scene,"palace-upper-hall-doorway-left",[-10.15,23.0,-142.05],[.34,16.2,.42],palaceGold);
  box(scene,"palace-upper-hall-doorway-right",[10.15,23.0,-142.05],[.34,16.2,.42],palaceGold);
  box(scene,"palace-upper-hall-doorway-crown",[0,31.2,-142.05],[20.6,.48,.62],palaceGold);
  // Keep the gallery balustrade, but leave two full-width openings aligned with
  // the twin stair flights so the landing is physically walkable.
  for(const [center,width] of [[-5.42,1.16],[0,3.55],[5.42,1.16]]) {
    box(scene,"palace-lobby-upper-gallery-front-rail",[center,15.65,-124.35],[width,.18,.18],palaceGold);
    for(let x=center-width/2+.18;x<=center+width/2-.12;x+=.42) {
      cylinder(scene,"palace-lobby-upper-gallery-baluster",[x,15.35,-124.35],.09,.72,lobbyPortraitGold,12);
    }
  }
  box(scene,"palace-lobby-back-crest-plaque",[0,17.5,-125.1],[3.6,4.0,.28],palaceBlue);
  const lobbyCrest=MeshBuilder.CreateCylinder("palace-lobby-national-crest",{diameter:2.1,height:.18,tessellation:8},scene);
  lobbyCrest.position.set(0,17.6,-124.88);lobbyCrest.rotation.x=Math.PI/2;lobbyCrest.material=palaceGold;

  // Rebuild the palace interior as a clean, continuous shell. The earlier
  // overlapping lobby/gallery geometry is discarded; exterior palace meshes stay.
  for(const mesh of [...scene.meshes]) {
    if(/^(palace-lobby-|palace-upper-corridor-|palace-royal-portrait-)/.test(mesh.name)) mesh.dispose(false,false);
  }
  const rebuiltMarble=mat(scene,"palace-rebuilt-marble",new Color3(.79,.76,.69),.24,.10);
  const rebuiltWall=mat(scene,"palace-rebuilt-limestone",new Color3(.78,.72,.61),.82);
  const rebuiltGold=mat(scene,"palace-rebuilt-gold",new Color3(.78,.57,.26),.26,.72);
  const rebuiltWood=mat(scene,"palace-rebuilt-walnut",new Color3(.22,.115,.065),.58,.12);
  const rebuiltVelvet=mat(scene,"palace-rebuilt-velvet",new Color3(.34,.055,.12),.82);
  // First floor: one broad, unobstructed reception hall, open to the upper gallery.
  box(scene,"palace-rebuild-ground-floor",[0,8.62,-122.4],[22,.28,19.4],rebuiltMarble);
  box(scene,"palace-rebuild-ground-runner",[0,8.80,-122.4],[5.0,.055,17.8],rebuiltVelvet);
  for(const side of [-1,1]) {
    box(scene,"palace-rebuild-ground-side-wall",[side*10.85,19.1,-122.4],[.55,21,19.4],rebuiltWall);
    for(const z of [-116.5,-122.5,-128.5]) {
      cylinder(scene,"palace-rebuild-column-base",[side*9.75,9.0,z],1.05,.42,rebuiltGold,32);
      cylinder(scene,"palace-rebuild-column",[side*9.75,19.0,z],.48,19.6,rebuiltWall,40);
      cylinder(scene,"palace-rebuild-column-capital",[side*9.75,29.0,z],1.12,.62,rebuiltGold,32);
      box(scene,"palace-rebuild-sconce",[side*10.42,21.0,z],[.18,.9,.62],rebuiltGold);
      const glow=MeshBuilder.CreateSphere("palace-rebuild-sconce-glow",{diameter:.30,segments:16},scene);
      glow.position.set(side*10.27,21.05,z-.08);glow.material=mats.lantern;
    }
    box(scene,"palace-rebuild-reception-desk",[side*7.35,9.65,-121.0],[2.6,1.75,1.25],rebuiltWood);
    box(scene,"palace-rebuild-reception-top",[side*7.35,10.58,-121.0],[2.85,.18,1.42],rebuiltGold);
    box(scene,"palace-rebuild-desk-front",[side*7.35,9.65,-121.66],[1.9,.88,.08],rebuiltVelvet);
  }
  // A single generous central staircase: no split flights and no central gap.
  const rebuiltStairStart=-117.25,rebuiltStairEnd=-128.55,rebuiltStairRise=6.08,rebuiltStairCount=18;
  const rebuiltTread=(rebuiltStairStart-rebuiltStairEnd)/rebuiltStairCount;
  for(let i=0;i<rebuiltStairCount;i++) {
    const top=8.82+(i+1)*rebuiltStairRise/rebuiltStairCount;
    const z=rebuiltStairStart-(i+.5)*rebuiltTread;
    const step=box(scene,"palace-rebuild-grand-stair-step",[0,top-.18,z],[8.8,.36,rebuiltTread+.08],rebuiltMarble);
    step.receiveShadows=true;
    box(scene,"palace-rebuild-stair-nosing",[0,top-.035,z+rebuiltTread*.43],[8.9,.07,.11],rebuiltGold);
  }
  for(const side of [-1,1]) {
    const railX=side*4.72;
    const rail=MeshBuilder.CreateTube("palace-rebuild-stair-handrail",{path:[
      new Vector3(railX,9.65,rebuiltStairStart),
      new Vector3(railX,15.15,rebuiltStairEnd)
    ],radius:.11,tessellation:12},scene);
    rail.material=rebuiltGold;
    for(let i=0;i<=18;i+=2) {
      const p=i/18;
      const post=cylinder(scene,"palace-rebuild-stair-baluster",[railX,9.55+rebuiltStairRise*p,rebuiltStairStart-(rebuiltStairStart-rebuiltStairEnd)*p],.105,.9,rebuiltGold,12);
      post.position.y=9.55+rebuiltStairRise*p-.40;
    }
  }
  // Upper landing and corridor connect directly to the existing great ballroom.
  box(scene,"palace-rebuild-upper-landing",[0,14.9,-130.0],[13.0,.32,4.2],rebuiltMarble);
  box(scene,"palace-rebuild-upper-runner",[0,15.08,-130.0],[4.8,.05,4.0],rebuiltVelvet);
  box(scene,"palace-rebuild-upper-corridor-floor",[0,14.9,-136.2],[13.0,.32,12.6],rebuiltMarble);
  box(scene,"palace-rebuild-upper-corridor-runner",[0,15.08,-136.2],[4.6,.05,12.1],rebuiltVelvet);
  for(const side of [-1,1]) {
    box(scene,"palace-rebuild-upper-side-wall",[side*6.48,19.1,-136.2],[.36,8.2,12.6],rebuiltWall);
    for(let z=-132;z>=-140;z-=4) {
      cylinder(scene,"palace-rebuild-upper-pier-base",[side*5.95,15.2,z],.66,.4,rebuiltGold,24);
      cylinder(scene,"palace-rebuild-upper-pier",[side*5.95,19.0,z],.27,7.2,rebuiltWall,32);
      cylinder(scene,"palace-rebuild-upper-pier-capital",[side*5.95,22.7,z],.72,.4,rebuiltGold,24);
    }
  }
  // A clear ten-metre opening leads from the corridor into the great hall.
  box(scene,"palace-rebuild-ballroom-door-left",[-10.8,22.0,-142.35],[.42,14.0,.55],rebuiltGold);
  box(scene,"palace-rebuild-ballroom-door-right",[10.8,22.0,-142.35],[.42,14.0,.55],rebuiltGold);
  box(scene,"palace-rebuild-ballroom-door-crown",[0,29.2,-142.35],[22.0,.55,.7],rebuiltGold);
  // Grand chandelier and framed royal paintings return only after the walkable shell.
  const rebuiltChandelier=MeshBuilder.CreateTorus("palace-rebuild-chandelier-ring",{diameter:6.4,thickness:.2,tessellation:48},scene);
  rebuiltChandelier.position.set(0,26.0,-122.4);rebuiltChandelier.material=rebuiltGold;
  cylinder(scene,"palace-rebuild-chandelier-chain",[0,28.0,-122.4],.11,4.0,rebuiltGold,12);
  for(let i=0;i<12;i++) {
    const a=i*Math.PI/6,x=Math.cos(a)*2.55,z=-122.4+Math.sin(a)*2.55;
    const arm=MeshBuilder.CreateTube("palace-rebuild-chandelier-arm",{path:[new Vector3(0,26,-122.4),new Vector3(x,26,z)],radius:.075,tessellation:8},scene);
    arm.material=rebuiltGold;
    cylinder(scene,"palace-rebuild-chandelier-candle",[x,26.38,z],.14,.62,rebuiltMarble,12);
    const flame=MeshBuilder.CreateSphere("palace-rebuild-chandelier-flame",{diameter:.24,segments:12},scene);
    flame.position.set(x,26.82,z);flame.material=mats.lantern;
  }
  for(const side of [-1,1]) for(let i=0;i<3;i++) {
    const z=-117.0-i*5.3,y=21.0;
    box(scene,"palace-rebuild-painting-frame",[side*10.48,y,z],[.24,3.7,2.65],rebuiltGold);
    box(scene,"palace-rebuild-painting-canvas",[side*10.32,y,z],[.08,3.25,2.2],i%2?palaceBlue:rebuiltVelvet);
    const crest=MeshBuilder.CreateCylinder("palace-rebuild-painting-crest",{diameter:1.0,height:.08,tessellation:8},scene);
    crest.position.set(side*10.24,y,z);crest.rotation.z=Math.PI/2;crest.material=rebuiltGold;
  }

  // Two detailed horse-drawn carriages wait in the forecourt, clear of the central stair.
  const horseCoats=[
    mat(scene,"carriage-horse-chestnut",new Color3(.28,.105,.045),.78),
    mat(scene,"carriage-horse-bay",new Color3(.39,.18,.075),.78)
  ];
  const horseMane=mat(scene,"carriage-horse-mane",new Color3(.075,.045,.028),.9);
  const horseMark=mat(scene,"carriage-horse-blaze",new Color3(.82,.72,.57),.88);
  const horseHoof=mat(scene,"carriage-horse-hoof",new Color3(.10,.085,.07),.8,.12);
  const horseLeather=mat(scene,"carriage-horse-harness",new Color3(.16,.075,.035),.66,.12);
  const carriageWood=mat(scene,"royal-carriage-lacquered-walnut",new Color3(.22,.085,.035),.46,.16);
  const carriageGold=mat(scene,"royal-carriage-gilt-brass",new Color3(.76,.54,.22),.3,.72);
  const carriageCloth=mat(scene,"royal-carriage-velvet",new Color3(.20,.055,.09),.78);
  const carriageWindow=mat(scene,"royal-carriage-smoked-glass",new Color3(.075,.12,.15),.28,.42);
  carriageWindow.alpha=1;
  carriageWindow.transparencyMode=PBRMaterial.PBRMATERIAL_OPAQUE;
  carriageWindow.forceDepthWrite=true;
  function horsePart(root,name,position,scale,material,segments=18) {
    const mesh=MeshBuilder.CreateSphere(name,{diameter:1,segments},scene);
    mesh.position.set(...position);mesh.scaling.set(...scale);mesh.material=material;mesh.parent=root;mesh.isPickable=false;return mesh;
  }
  function horseTube(root,name,points,radius,material) {
    const mesh=MeshBuilder.CreateTube(name,{path:points.map(p=>new Vector3(...p)),radius,tessellation:8},scene);
    mesh.material=material;mesh.parent=root;mesh.isPickable=false;return mesh;
  }
  function addHorse(x,z,coat,phase=0) {
    const root=new TransformNode("royal-carriage-horse-root",scene);
    root.position.set(x,0,z);
    // Muscular barrel, shoulder and hindquarters create a proper equine silhouette.
    horsePart(root,"horse-barrel",[0,1.34,.02],[1.12,1.02,2.05],coat,24);
    horsePart(root,"horse-chest",[0,1.36,-.72],[1.02,1.12,.92],coat,20);
    horsePart(root,"horse-haunch-left",[-.34,1.38,.72],[.70,.90,.86],coat,18);
    horsePart(root,"horse-haunch-right",[.34,1.38,.72],[.70,.90,.86],coat,18);
    const neck=horsePart(root,"horse-arched-neck",[0,1.91,-.91],[.66,1.22,.72],coat,24);
    neck.rotation.x=-.38;
    horsePart(root,"horse-throatlatch",[0,2.02,-1.16],[.38,.72,.46],coat,18);
    horsePart(root,"horse-head",[0,2.43,-1.43],[.48,.72,.50],coat,22);
    horsePart(root,"horse-muzzle",[0,2.16,-1.78],[.43,.34,.46],coat,18);
    horsePart(root,"horse-nostril-left",[-.19,2.23,-1.98],[.055,.07,.045],horseHoof,10);
    horsePart(root,"horse-nostril-right",[.19,2.23,-1.98],[.055,.07,.045],horseHoof,10);
    horsePart(root,"horse-blaze",[0,2.48,-1.91],[.12,.42,.045],horseMark,14);
    for(const side of [-1,1]) {
      const ear=MeshBuilder.CreateCylinder("horse-ear",{diameterTop:.025,diameterBottom:.16,height:.42,tessellation:10},scene);
      ear.parent=root;ear.position.set(side*.16,2.91,-1.42);ear.rotation.z=side*.22;ear.material=coat;
      horsePart(root,"horse-eye",[side*.215,2.55,-1.76],[.075,.07,.045],horseHoof,12);
      horsePart(root,"horse-eye-glint",[side*.23,2.57,-1.80],[.022,.022,.012],horseMark,8);
      // Four articulated-looking legs with knees, fetlocks and shaped hooves.
      for(const front of [false,true]) {
        const zz=front?-.72:.78,hipY=front?1.24:1.18,kneeY=front?.66:.72;
        const upper=[side*.43,hipY,zz],knee=[side*.47,kneeY,zz+(front?-.10:.12)],fetlock=[side*.48,.25,knee[2]+(front?-.04:.03)];
        horseTube(root,"horse-leg-muscle",[upper,knee],.17,coat);
        horsePart(root,"horse-knee",[...knee],[.30,.31,.30],coat,14);
        horseTube(root,"horse-cannon-bone",[knee,fetlock],.09,coat);
        horsePart(root,"horse-fetlock",[...fetlock],[.19,.20,.19],coat,12);
        const hoof=MeshBuilder.CreateCylinder("horse-shaped-hoof",{diameterTop:.22,diameterBottom:.32,height:.22,tessellation:12},scene);
        hoof.parent=root;hoof.position.set(side*.48,.12,fetlock[2]-.015);hoof.material=horseHoof;
      }
    }
    // Flowing mane, forelock and a curved tail are sculpted from tapered strands.
    for(let i=0;i<9;i++) {
      const t=i/8;
      horseTube(root,"horse-mane-strand",[
        [-.16+t*.32,2.75-t*.58,-1.18-t*.06],
        [-.20+t*.42,2.52-t*.52,-.98-t*.10],
        [-.24+t*.48,2.25-t*.45,-.72-t*.12]
      ],.055,horseMane);
    }
    for(let i=0;i<5;i++) {
      horseTube(root,"horse-forelock-strand",[
        [-.13+i*.065,2.79,-1.55],
        [-.12+i*.06,2.96,-1.73],
        [-.10+i*.055,2.82,-1.92]
      ],.045,horseMane);
    }
    horseTube(root,"horse-tail",[[0,1.75,1.0],[0,1.42,1.42],[0,1.04,1.55]],.10,horseMane);
    // Bridle, browband and chest harness catch the light.
    horseTube(root,"horse-bridle-cheek-left",[[-.23,2.56,-1.55],[-.28,2.35,-1.70],[-.21,2.18,-1.88]],.035,horseLeather);
    horseTube(root,"horse-bridle-cheek-right",[[.23,2.56,-1.55],[.28,2.35,-1.70],[.21,2.18,-1.88]],.035,horseLeather);
    horseTube(root,"horse-browband",[[-.23,2.65,-1.60],[0,2.69,-1.66],[.23,2.65,-1.60]],.04,horseLeather);
    horseTube(root,"horse-reins",[[-.2,2.18,-1.85],[-.18,1.72,-1.2],[0,1.48,.1]],.028,horseLeather);
    return root;
  }
  function carriageWheel(x,y,z,radius) {
    const wheel=MeshBuilder.CreateTorus("royal-carriage-wheel",{diameter:radius*2,thickness:.20,tessellation:32},scene);
    wheel.position.set(x,y,z);wheel.rotation.z=Math.PI/2;wheel.material=carriageGold;
    const hub=cylinder(scene,"royal-carriage-wheel-hub",[x,y,z],.42,.42,carriageWood,16);hub.rotation.z=Math.PI/2;
    for(let i=0;i<12;i++) {
      const angle=i*Math.PI/6;
      const spoke=box(scene,"royal-carriage-wheel-spoke",[x,y+Math.cos(angle)*radius*.48,z+Math.sin(angle)*radius*.48],[.10,radius*.94,.10],carriageWood);
      spoke.rotation.x=-angle;
    }
  }
  let movingCarriage=null;
  function addCarriage(x,z,coat,turn=0,moving=false) {
    const meshStart=scene.meshes.length,horse=addHorse(x,z-4.25,coat,turn);
    if(!moving){const pad=MeshBuilder.CreateGround("royal-carriage-parking-pad",{width:5.8,height:8.8,subdivisions:1},scene);pad.position.set(x,.025,z+.3);pad.material=courtStone;}
    box(scene,"royal-carriage-underframe",[x,.92,z+.72],[2.8,.28,3.55],carriageWood);
    // Keep the cabin open above its low upholstered base so seated passengers are visible.
    box(scene,"royal-carriage-body",[x,1.17,z+1.05],[3.35,.48,2.65],carriageWood);
    // Lower cabin sides leave the seated guests' faces and upper bodies clearly visible.
    box(scene,"royal-carriage-side-panel-left",[x-1.72,1.53,z+1.05],[.18,.82,2.7],carriageGold);
    box(scene,"royal-carriage-side-panel-right",[x+1.72,1.53,z+1.05],[.18,.82,2.7],carriageGold);
    box(scene,"royal-carriage-door-panel-left",[x-1.82,1.48,z+1.0],[.06,.48,1.45],carriageCloth);
    box(scene,"royal-carriage-door-panel-right",[x+1.82,1.48,z+1.0],[.06,.48,1.45],carriageCloth);
    // Close the cabin at both ends: the coach body is a complete, solid box,
    // not two floating side walls. The dark inset panels read as deep windows.
    box(scene,"royal-carriage-cabin-front-wall",[x,1.62,z-.245],[3.28,.88,.18],carriageWood);
    box(scene,"royal-carriage-cabin-rear-wall",[x,1.62,z+2.345],[3.28,.88,.18],carriageWood);
    for(const side of [-1,1]) {
      const windowPane=box(scene,"royal-carriage-cabin-side-window",[x+side*1.825,1.77,z+1.05],[.035,.42,1.42],carriageWindow);
      const upperRail=box(scene,"royal-carriage-window-gilt-upper",[x+side*1.855,2.02,z+1.05],[.055,.075,1.58],carriageGold);
      const lowerRail=box(scene,"royal-carriage-window-gilt-lower",[x+side*1.855,1.51,z+1.05],[.055,.075,1.58],carriageGold);
      for(const zz of [z+.25,z+1.85])box(scene,"royal-carriage-window-gilt-upright",[x+side*1.855,1.77,zz],[.055,.55,.075],carriageGold);
      box(scene,"royal-carriage-cabin-side-inset",[x+side*1.86,1.18,z+1.05],[.055,.12,2.25],carriageGold);
    }
    // Gilded end panels, carved corner posts and a continuous lower moulding.
    for(const zz of [z-.36,z+2.46]) {
      box(scene,"royal-carriage-cabin-end-inset",[x,1.58,zz],[2.45,.48,.045],carriageCloth);
      box(scene,"royal-carriage-cabin-end-gilt-rail",[x,1.91,zz-.025],[2.72,.075,.055],carriageGold);
      box(scene,"royal-carriage-cabin-end-gilt-base",[x,1.24,zz-.025],[2.72,.075,.055],carriageGold);
      for(const side of [-1,1])box(scene,"royal-carriage-cabin-end-corner",[x+side*1.43,1.60,zz],[.12,.78,.10],carriageGold);
    }
    box(scene,"royal-carriage-cabin-roof",[x,3.28,z+.95],[3.75,.28,2.95],carriageGold);
    for(const side of [-1,1]) {
      for(const zz of [z-.25,z+2.15]) {
        const pillar=box(scene,"royal-carriage-canopy-pillar",[x+side*1.62,2.48,zz],[.16,1.70,.16],carriageWood);
      }
      box(scene,"royal-carriage-curtain",[x+side*1.55,2.35,z+.95],[.10,1.15,1.9],carriageCloth);
      const lamp=MeshBuilder.CreateSphere("royal-carriage-lantern",{diameter:.28,segments:10},scene);
      lamp.position.set(x+side*1.92,3.02,z-.05);lamp.material=mats.lantern;
    }
    // An exposed coachman's box projects ahead of the cabin, with a real footboard,
    // raised bench and low front rail. The driver sits outside the passenger canopy.
    box(scene,"royal-carriage-driver-footboard",[x,1.16,z-1.20],[1.85,.18,1.02],carriageWood);
    box(scene,"royal-carriage-driver-seat",[x,1.66,z-1.30],[1.55,.24,.72],carriageCloth);
    box(scene,"royal-carriage-front-board",[x,1.40,z-.48],[2.6,.58,.18],carriageWood);
    for(const side of [-1,1])box(scene,"royal-carriage-driver-side-rail",[x+side*.92,1.62,z-1.18],[.12,.72,.92],carriageGold);
    // Four gold-rimmed wheels and turned wooden spokes.
    carriageWheel(x-1.82,1.0,z+.15,1.0);
    carriageWheel(x+1.82,1.0,z+.15,1.0);
    carriageWheel(x-1.82,.78,z+2.15,.72);
    carriageWheel(x+1.82,.78,z+2.15,.72);
    // Paired shafts connect the coach to the horse harness.
    for(const side of [-1,1]) {
      const shaft=box(scene,"royal-carriage-draft-shaft",[x+side*.48,1.0,z-1.85],[.13,.14,3.1],carriageWood);
      shaft.rotation.x=.02;
    }
    for(const side of [-1,1])cylinder(scene,"royal-carriage-lamp-bracket",[x+side*1.88,2.48,z-.1],.08,.48,carriageGold,10);
    // Carriage lacquer, brass and velvet must remain fully opaque in every
    // rendering path, including the moving carriage's parented meshes.
    for(const material of [carriageWood,carriageGold,carriageCloth,coat,horseMane,horseMark,horseHoof,horseLeather]) {
      material.alpha=1;
      material.transparencyMode=PBRMaterial.PBRMATERIAL_OPAQUE;
      material.forceDepthWrite=true;
    }
    for(const mesh of scene.meshes.slice(meshStart)) {
      if(mesh.material && !Array.isArray(mesh.material)) {
        mesh.material.alpha=1;
        mesh.material.transparencyMode=PBRMaterial.PBRMATERIAL_OPAQUE;
        mesh.material.forceDepthWrite=true;
      }
      mesh.visibility=1;
    }
    if(moving) {
      const group=new TransformNode("royal-carriage-moving-group",scene);group.position.set(x,0,z);group.rotation.y=Math.PI;
      for(const mesh of scene.meshes.slice(meshStart)){if(mesh.parent===horse)continue;mesh.position.x-=x;mesh.position.z-=z;mesh.parent=group;}
      horse.position.x-=x;horse.position.z-=z;horse.parent=group;
      const carriageControlPoints=[[0,-73.5],[0,-55],[0,-47],[0,-39],[0,-25],[0,-10],[0,6],[0,21],[-12,29],[-28,27],[-37,14],[-34,-4],[-20,-18],[0,-25],[0,-39],[0,-47],[0,-55]].map(([rx,rz])=>new Vector3(rx,0,rz));
      const carriageCurve=Curve3.CreateCatmullRomSpline(carriageControlPoints,18,true);
      movingCarriage={group,horse,waypointIndex:1,speed:2.35,route:carriageCurve.getPoints(360)};
      return {x,z,group,moving:true};
    }
    return {x,z,group:null,moving:false};
  }
  // Park the waiting royal coach in the garden on the opposite (eastern) side.
  const parkedRoyalCarriage=addCarriage(15.2,-73.5,horseCoats[0],.1);
  const travelingRoyalCarriage=addCarriage(0,-73.5,horseCoats[1],.4,true);

  const royalGardenStartIndex=scene.meshes.length;
  // Yield between major districts so mobile Safari can service the page.
  await new Promise(resolve=>setTimeout(resolve,0));
  // The rose garden is now inside the palace complex, in the long inner court behind the lobby.
  const carriageMat=texturedMat(scene,"inner-rose-court-path",new Color3(.62,.58,.49),"#a99d86","#554d41",.92);
  const gardenFloor=mat(scene,"inner-rose-court-marble",new Color3(.68,.64,.55),.86);
  const gardenSoil=mat(scene,"inner-rose-garden-earth",new Color3(.16,.105,.065),.98);
  const gardenHedge=mat(scene,"inner-rose-garden-boxwood",new Color3(.075,.20,.105),.96);
  const leafMats=[new Color3(.09,.24,.11),new Color3(.14,.34,.15),new Color3(.22,.42,.19)].map((c,i)=>mat(scene,"inner-rose-leaf-"+i,c,.92));
  const stemMat=mat(scene,"inner-rose-stem",new Color3(.10,.22,.085),.96);
  const roseMats=[
    mat(scene,"inner-rose-crimson",new Color3(.55,.025,.075),.62),
    mat(scene,"inner-rose-blush",new Color3(.88,.31,.43),.64),
    mat(scene,"inner-rose-ivory",new Color3(.94,.81,.65),.68)
  ];
  const roseHeartMat=mat(scene,"garden-rose-heart",new Color3(.96,.68,.19),.52,.08);
  const courtZ=-156;
  const innerCourt=MeshBuilder.CreateGround("palace-inner-rose-court-floor",{width:19,height:48,subdivisions:2},scene);
  innerCourt.position.set(0,8.48,courtZ);innerCourt.material=gardenFloor;
  const courtRunner=MeshBuilder.CreateGround("palace-inner-rose-court-walkway",{width:6.2,height:44,subdivisions:1},scene);
  courtRunner.position.set(0,8.515,courtZ);courtRunner.material=carriageMat;
  for(const side of [-1,1]) {
    box(scene,"inner-rose-court-stone-border",[side*9.1,8.85,courtZ],[.7,.72,47],mats.trim);
    box(scene,"inner-rose-court-hedge-bed",[side*6.7,8.72,courtZ],[3.6,.22,40],gardenSoil);
    for(let z=-174;z<=-138;z+=6) {
      const hedge=MeshBuilder.CreateSphere("inner-rose-court-clipped-hedge",{diameter:1.25,segments:24},scene);
      hedge.position.set(side*6.65,9.35,z);hedge.scaling.set(1.5,.78,1.0);hedge.material=gardenHedge;
      const urn=cylinder(scene,"inner-rose-court-stone-urn",[side*4.7,9.0,z],.82,.55,mats.trim,16);
      for(let flower=0;flower<3;flower++) {
        const bloom=new Vector3(side*4.7+(flower-1)*.22,9.75,z+(flower%2?-.12:.12));
        // Small clusters of individually cupped roses.
        const petals=[];
        for(let p=0;p<7;p++) {
          const ang=p*Math.PI*2/7, left=[],right=[];
          for(let k=0;k<4;k++) {
            const t=k/3,r=.035+t*.18,spread=.018+Math.sin(t*Math.PI)*.055;
            const px=bloom.x+Math.cos(ang)*r,pz=bloom.z+Math.sin(ang)*r,py=bloom.y+Math.sin(t*Math.PI)*.045;
            left.push(new Vector3(px-Math.sin(ang)*spread,py,pz+Math.cos(ang)*spread));
            right.push(new Vector3(px+Math.sin(ang)*spread,py,pz-Math.cos(ang)*spread));
          }
          const petal=MeshBuilder.CreateRibbon("inner-court-urn-rose-petal",{pathArray:[left,right],sideOrientation:2},scene);
          petal.material=roseMats[(flower+side+3)%3];petals.push(petal);
        }
        const merged=Mesh.MergeMeshes(petals,true,true,undefined,false,false);
        if(merged)merged.material=roseMats[(flower+side+3)%3];
      }
    }
  }
  // Dense rose shrubs with individually cupped, layered blooms.
  function addRoseBush(cx,cz,phase=0) {
    for(let stem=0;stem<4;stem++) {
      const a=phase+stem*Math.PI*.5,lean=.22+(stem%2)*.12;
      const base=new Vector3(cx+Math.cos(a)*.12,8.92,cz+Math.sin(a)*.12);
      const tip=new Vector3(cx+Math.cos(a)*lean,9.85+(stem%3)*.13,cz+Math.sin(a)*lean);
      const cane=MeshBuilder.CreateTube("garden-rose-cane",{path:[base,Vector3.Lerp(base,tip,.52).add(new Vector3(0,.12,0)),tip],radius:.032,tessellation:8},scene);
      cane.material=stemMat;cane.isPickable=false;
      for(let leaf=0;leaf<3;leaf++) {
        const t=.28+leaf*.22,anchor=Vector3.Lerp(base,tip,t),side=leaf%2?1:-1;
        const leafTip=anchor.add(new Vector3(Math.cos(a+side*.9)*.34,.08,Math.sin(a+side*.9)*.34));
        roseLeaf(anchor,leafTip,.22,leafMats[(stem+leaf)%leafMats.length]);
        const secondTip=anchor.add(new Vector3(Math.cos(a-side*.9)*.28,.045,Math.sin(a-side*.9)*.28));
        roseLeaf(anchor,secondTip,.18,leafMats[(stem+leaf+1)%leafMats.length]);
      }
      const bloomMat=roseMats[(stem+Math.floor(phase*2))%roseMats.length];
      tunnelRose(new Vector3(tip.x,tip.y+.05,tip.z),.25+(stem%2)*.025,bloomMat,phase+stem*.71);
    }
  }
  for(const side of [-1,1]) for(let i=0;i<9;i++) addRoseBush(side*6.55,-173.0+i*4.35,side*.7+i*.43);

  // Small carved stone fountain with a shallow bird-sized basin.
  const roseFountainStone=mat(scene,"rose-garden-fountain-stone",new Color3(.68,.63,.53),.76,.06);
  const roseFountainGold=mat(scene,"rose-garden-fountain-bronze",new Color3(.60,.43,.22),.34,.62);
  const roseFountainWater=mat(scene,"rose-garden-fountain-water",new Color3(.22,.53,.61),.16,.22);
  roseFountainWater.alpha=.86;
  cylinder(scene,"rose-garden-fountain-foot",[0,8.68,-164],3.0,.34,roseFountainStone,40);
  cylinder(scene,"rose-garden-fountain-basin",[0,8.91,-164],2.72,.34,roseFountainStone,40);
  const roseFountainSurface=MeshBuilder.CreateCylinder("rose-garden-fountain-water-surface",{diameter:2.42,height:.035,tessellation:40},scene);
  roseFountainSurface.position.set(0,9.10,-164);roseFountainSurface.material=roseFountainWater;
  cylinder(scene,"rose-garden-fountain-pedestal-lower",[0,9.35,-164],.72,.68,roseFountainGold,24);
  cylinder(scene,"rose-garden-fountain-pedestal-upper",[0,9.77,-164],.48,.32,roseFountainStone,24);
  cylinder(scene,"rose-garden-fountain-upper-bowl",[0,9.98,-164],1.42,.22,roseFountainStone,32);
  const roseFountainUpperRim=MeshBuilder.CreateTorus("rose-garden-fountain-upper-rim",{diameter:1.48,thickness:.09,tessellation:32},scene);
  roseFountainUpperRim.position.set(0,10.10,-164);roseFountainUpperRim.material=roseFountainGold;
  cylinder(scene,"rose-garden-fountain-finial",[0,10.32,-164],.24,.48,roseFountainGold,20);
  for(let i=0;i<6;i++) {
    const a=i*Math.PI/3;
    const jet=MeshBuilder.CreateTube("rose-garden-fountain-water-jet",{path:[
      new Vector3(Math.cos(a)*.16,10.42,-164+Math.sin(a)*.16),
      new Vector3(Math.cos(a)*.48,10.52,-164+Math.sin(a)*.48),
      new Vector3(Math.cos(a)*.72,10.18,-164+Math.sin(a)*.72)
    ],radius:.025,tessellation:6},scene);
    jet.material=roseFountainWater;jet.isPickable=false;
  }

  // Stone paths and low balustrades define a quiet, enclosed palace garden.
  for(const side of [-1,1]) {
    for(let z=-178;z<=-134;z+=4) {
      const post=cylinder(scene,"inner-rose-court-balustrade-post",[side*9.0,9.55,z],.34,1.8,mats.trim,12);
      const cap=cylinder(scene,"inner-rose-court-balustrade-cap",[side*9.0,10.48,z],.48,.18,castleGold,12);
    }
    const rail=box(scene,"inner-rose-court-balustrade-rail",[side*9.0,9.95,courtZ],[.22,.18,45],mats.trim);
  }
  // Six elliptical iron arches form a walk-through rose tunnel over the central path.
  const ironArch=mat(scene,"rose-tunnel-wrought-iron",new Color3(.12,.16,.14),.38,.68);
  function roseLeaf(base,tip,width,material) {
    const axis=tip.subtract(base),side=Vector3.Cross(axis,new Vector3(.15,1,.12)).normalize().scale(width*.5);
    const mid=Vector3.Lerp(base,tip,.5).add(new Vector3(0,width*.15,0));
    const mesh=MeshBuilder.CreateRibbon("rose-tunnel-individual-leaf",{pathArray:[
      [base,Vector3.Lerp(base,mid,.5).add(side),mid.add(side.scale(.4)),tip],
      [base,Vector3.Lerp(base,mid,.5).subtract(side),mid.subtract(side.scale(.4)),tip]
    ],sideOrientation:2},scene);
    mesh.material=material;mesh.isPickable=false;
  }
  function tunnelRose(center,radius,material,phase=0) {
    // A rose is built from individually cupped, overlapping petals, not a flat radial disc.
    const pieces=[];
    const layers=[{count:8,inner:.08,outer:1.0,spread:.30,lift:.18},{count:7,inner:.20,outer:.86,spread:.27,lift:.28},{count:6,inner:.28,outer:.68,spread:.24,lift:.38}];
    for(let layer=0;layer<layers.length;layer++) {
      const spec=layers[layer];
      for(let p=0;p<spec.count;p++) {
        const angle=phase+p*Math.PI*2/spec.count+layer*.34;
        const left=[],right=[];
        for(let k=0;k<=8;k++) {
          const t=k/8;
          const rr=radius*(spec.inner+(spec.outer-spec.inner)*t);
          const edgeWave=1+Math.sin(t*Math.PI*3+phase+p)*.035;
          const spread=radius*(.035+Math.sin(t*Math.PI)*spec.spread)*edgeWave;
          const cup=Math.sin(t*Math.PI)*radius*spec.lift + layer*.025*radius;
          const px=center.x+Math.cos(angle)*rr, pz=center.z+Math.sin(angle)*rr, py=center.y+cup;
          left.push(new Vector3(px-Math.sin(angle)*spread,py,pz+Math.cos(angle)*spread));
          right.push(new Vector3(px+Math.sin(angle)*spread,py,pz-Math.cos(angle)*spread));
        }
        const petal=MeshBuilder.CreateRibbon("rose-tunnel-cupped-petal",{pathArray:[left,right],sideOrientation:2},scene);
        petal.material=material;petal.isPickable=false;pieces.push(petal);
      }
    }
    const flower=Mesh.MergeMeshes(pieces,true,true,undefined,false,false);
    if(flower){flower.name="garden-rose-layered-petals";flower.material=material;flower.isPickable=false;}
    // A rounded golden centre and five pointed sepals make the underside read as a rose.
    const heart=MeshBuilder.CreateSphere("garden-rose-golden-heart",{diameter:radius*.24,segments:16},scene);
    heart.position.copyFrom(center);heart.position.y+=radius*.19;heart.material=roseHeartMat;heart.isPickable=false;
    const sepals=[];
    for(let i=0;i<5;i++) {
      const a=phase+i*Math.PI*2/5,base=new Vector3(center.x,center.y-radius*.08,center.z);
      const tip=new Vector3(center.x+Math.cos(a)*radius*.62,center.y-radius*.17,center.z+Math.sin(a)*radius*.62);
      const mid=Vector3.Lerp(base,tip,.52).add(new Vector3(0,radius*.045,0));
      const side=Vector3.Cross(tip.subtract(base),new Vector3(.1,1,.1)).normalize().scale(radius*.12);
      const sepal=MeshBuilder.CreateRibbon("garden-rose-sepal",{pathArray:[[base,mid.add(side),tip],[base,mid.subtract(side),tip]],sideOrientation:2},scene);
      sepal.material=stemMat;sepal.isPickable=false;sepals.push(sepal);
    }
    const calyx=Mesh.MergeMeshes(sepals,true,true,undefined,false,false);
    if(calyx){calyx.name="garden-rose-calyx";calyx.material=stemMat;calyx.isPickable=false;}
  }
  // One graceful rose arch keeps the garden open and airy.
  const tunnelZs=[-156];
  for(let archIndex=0;archIndex<tunnelZs.length;archIndex++) {
    const z=tunnelZs[archIndex],pathPts=[];
    for(let i=0;i<=24;i++) {
      const t=Math.PI*i/24;
      pathPts.push(new Vector3(-3.35*Math.cos(t),8.78+4.65*Math.sin(t),z));
    }
    const frame=MeshBuilder.CreateTube("rose-tunnel-arched-iron-frame",{path:pathPts,radius:.105,tessellation:10},scene);
    frame.material=ironArch;
    // Slim vertical supports, foot plates and decorative finials anchor each arch.
    for(const side of [-1,1]) {
      const support=box(scene,"rose-tunnel-arch-foot",[side*3.35,8.95,z],[.62,.28,.62],mats.trim);
      cylinder(scene,"rose-tunnel-arch-finial",[side*3.35,9.28,z],.22,.42,castleGold,10);
    }
    // Rose canes spiral up the ironwork; alternating red, blush and ivory blooms.
    for(let k=0;k<9;k++) {
      const t=.12+k*.095,angle=Math.PI*t;
      const x=-3.35*Math.cos(angle),y=8.78+4.65*Math.sin(angle),side=(k%2?1:-1);
      const vinePath=[
        new Vector3(x+side*.28,y-.25,z-.12),
        new Vector3(x-side*.12,y+.32,z+.02),
        new Vector3(x+side*.20,y+.78,z+.14)
      ];
      const vine=MeshBuilder.CreateTube("rose-tunnel-climbing-cane",{path:vinePath,radius:.035,tessellation:6},scene);
      vine.material=stemMat;
      roseLeaf(vinePath[1],vinePath[2].add(new Vector3(side*.35,.04,0)),.24,leafMats[k%3]);
      tunnelRose(new Vector3(x+side*.16,y+.5,z-.12),.31,roseMats[k%3],k*.7);
    }
    // A few trailing tendrils soften the outline instead of making a rigid metal cage.
    for(const side of [-1,1]) {
      const x=side*2.5;
      const trailing=MeshBuilder.CreateTube("rose-tunnel-trailing-ivy",{path:[
        new Vector3(x,9.2,z),new Vector3(x+side*.18,10.2,z-.12),new Vector3(x+side*.12,11.0,z-.18)
      ],radius:.028,tessellation:5},scene);
      trailing.material=stemMat;
    }
  }
  // Low clipped borders and a carved stone entrance portal make the garden feel intentional.
  for(const side of [-1,1]) {
    box(scene,"rose-tunnel-garden-bed-edge",[side*4.25,8.75,courtZ],[.28,.42,42],mats.trim);
    for(let z=-174;z<=-138;z+=4) {
      const shrub=MeshBuilder.CreateSphere("rose-tunnel-border-shrub",{diameter:.72,segments:20},scene);
      shrub.position.set(side*4.45,9.18,z);shrub.scaling.y=.75;shrub.material=gardenHedge;
    }
  }
  const gardenPortal=MeshBuilder.CreateTube("rose-tunnel-entry-portal",{path:[
    new Vector3(-4.0,8.75,-134),new Vector3(-4.0,12.8,-134),new Vector3(0,14.0,-134),new Vector3(4.0,12.8,-134),new Vector3(4.0,8.75,-134)
  ],radius:.22,tessellation:12},scene);
  gardenPortal.material=castleGold;
  // Keep the original fountain and its drinking finches untouched.
  // Move the open rose parterre to the OUTDOOR forecourt beside the carriage court.
  for(const mesh of scene.meshes.slice(royalGardenStartIndex)) {
    mesh.position.x+=48;
    mesh.position.y-=8.48;
    mesh.position.z+=74;
    if(mesh.name.startsWith("rose-tunnel")||mesh.name.startsWith("inner-rose")||mesh.name.startsWith("palace-inner-rose")) {
      mesh.receiveShadows=true;mesh.isPickable=false;
    }
  }

  // Combine the fine rose details by material to preserve quality without excessive draw calls.
  addObstacle(48,-90,1.25);
  const roseGardenBatches=new Map();
  for(const mesh of [...scene.meshes]) {
    if(!/^(garden-rose-|rose-tunnel-|inner-court-urn-rose-)/.test(mesh.name)) continue;
    if(mesh.parent||mesh.isDisposed()||!mesh.material||Array.isArray(mesh.material)) continue;
    if(!roseGardenBatches.has(mesh.material)) roseGardenBatches.set(mesh.material,[]);
    roseGardenBatches.get(mesh.material).push(mesh);
  }
  let roseGardenBatchIndex=0;
  for(const [material,parts] of roseGardenBatches) {
    if(parts.length<2) continue;
    const merged=Mesh.MergeMeshes(parts,true,true,undefined,false,false);
    if(merged){merged.name="rose-garden-detail-batch-"+roseGardenBatchIndex++;merged.material=material;merged.isPickable=false;}
  }

  // Temporary reset: remove the palace building shell and all interior architecture.
  // Keep the outdoor approach stair, lanterns, carriage court, carriages, and rose garden.
  const keepPalaceExterior = name =>
    /^(palace-entry-step|palace-entry-step-nosing|palace-entry-stair-parapet|palace-entry-landing|palace-stair-lantern-|palace-carriage-|palace-court-|palace-turning-|palace-inner-rose-|rose-tunnel|inner-rose)/.test(name) ||
    name === "palace-carriage-drive";
  const palaceBuildingNames = /^(citadel-|royal-keep-|palace-|royal-hall-|royal-throne-|royal-suite-|royal-conservatory-|royal-chapel-|royal-wall-relief|castle-tower|castle-spire|castle-roof-finial|keep-window-|keep-stone-|gate-|gatehouse-|royal-gate-|royal-crest-|state-ballroom-|erinvale-gate-standard|erinvale-national-standard)/;
  for(const mesh of [...scene.meshes.slice(royalPalaceStartIndex)]) {
    if(palaceBuildingNames.test(mesh.name) && !keepPalaceExterior(mesh.name)) mesh.dispose(false,false);
  }
  if(scene.metadata?.doorLeaves) {
    scene.metadata.doorLeaves = scene.metadata.doorLeaves.filter(door =>
      !/^(palace-|royal-suite-|palace-gallery-)/.test(door.name)
    );
  }

  // Rebuild the visible outer palace entrance after removing the old palace shell.
  const royalApproachDoorGold=mat(scene,"royal-approach-door-gold",new Color3(.78,.56,.23),.28,.72);
  const royalApproachDoorStone=mat(scene,"royal-approach-door-white-stone",new Color3(.89,.85,.76),.38,.12);
  const royalApproachDoorDark=mat(scene,"royal-approach-door-dark-wood",new Color3(.12,.065,.035),.58,.24);
  const royalApproachDoorGlow=mat(scene,"royal-approach-door-lantern-glow",new Color3(1,.68,.34),.2,0);
  royalApproachDoorGlow.emissiveColor=new Color3(.95,.36,.10);

  // Transfer the ornate gilt-and-ivory design to the double doors beside the chandelier hall.
  const chandelierDoorLeaves=scene.metadata.doorLeaves.filter(d=>d.name==="royal-entry-chandelier-double-door");
  for(const d of chandelierDoorLeaves) {
    const side=d.pivot.position.x<0?-1:1, lw=9.2*.49, lh=8.15*.91, lx=-side*lw*.5;
    for(const level of [-1,1]) {
      const panel=box(scene,"royal-chandelier-door-gilded-panel",[0,0,0],[lw*.72,lh*.29,.065],royalApproachDoorDark);
      panel.parent=d.pivot;panel.position.set(lx,level*lh*.23,.145);
      const inset=box(scene,"royal-chandelier-door-ivory-inlay",[0,0,0],[lw*.55,lh*.22,.04],royalApproachDoorStone);
      inset.parent=d.pivot;inset.position.set(lx,level*lh*.23,.19);
      const rail=box(scene,"royal-chandelier-door-gold-rail",[0,0,0],[lw*.78,.09,.06],royalApproachDoorGold);
      rail.parent=d.pivot;rail.position.set(lx,level*lh*.39,.21);
    }
    for(let yy=-lh*.40;yy<=lh*.40+.001;yy+=.55) {
      const stud=MeshBuilder.CreateSphere("royal-chandelier-door-brass-stud",{diameter:.11,segments:10},scene);
      stud.parent=d.pivot;stud.position.set(lx+side*lw*.39,yy,.245);stud.material=royalApproachDoorGold;
    }
    const boss=MeshBuilder.CreateCylinder("royal-chandelier-door-rosette",{diameter:.48,height:.12,tessellation:16},scene);
    boss.parent=d.pivot;boss.position.set(lx,0,.25);boss.rotation.x=Math.PI/2;boss.material=royalApproachDoorGold;
  }

  // Remove the outer double-door leaves but keep the stone portal and arch.
  for(const door of scene.metadata.doorLeaves.filter(d=>d.name==="royal-approach-grand-double-door")) {
    door.pivot.dispose(false,false);
  }
  scene.metadata.doorLeaves=scene.metadata.doorLeaves.filter(d=>d.name!=="royal-approach-grand-double-door");
  for(const side of [-1,1])box(scene,"royal-approach-door-back-wall-wing",[side*5.35,13.2,-112.82],[3.1,9.2,.72],royalApproachDoorStone);
  box(scene,"royal-approach-door-back-wall-header",[0,17.0,-112.82],[7.4,1.6,.72],royalApproachDoorStone);
  for(const side of [-1,1]) {
    box(scene,"royal-approach-door-pilaster",[side*4.15,12.6,-111.88],[.78,8.5,.92],royalApproachDoorStone);
    box(scene,"royal-approach-door-pilaster-base",[side*4.15,8.55,-111.88],[1.25,.55,1.2],royalApproachDoorGold);
    box(scene,"royal-approach-door-pilaster-capital",[side*4.15,16.78,-111.88],[1.42,.72,1.2],royalApproachDoorGold);
    addLantern(scene,side*5.3,13.2,-111.25,royalApproachDoorGold,royalApproachDoorGlow);
  }
  const royalApproachArchPath=[];
  for(let i=0;i<=36;i++){const a=Math.PI-i*Math.PI/36;royalApproachArchPath.push(new Vector3(Math.cos(a)*4.2,15.75+Math.sin(a)*2.35,-111.82));}
  const royalApproachArch=MeshBuilder.CreateTube("royal-approach-door-gilded-arch",{path:royalApproachArchPath,radius:.27,tessellation:14},scene);
  royalApproachArch.material=royalApproachDoorGold;
  const royalApproachCrest=MeshBuilder.CreateCylinder("royal-approach-door-heraldic-crest",{diameter:1.9,height:.26,tessellation:12},scene);
  royalApproachCrest.position.set(0,18.35,-111.78);royalApproachCrest.rotation.x=Math.PI/2;royalApproachCrest.material=royalApproachDoorGold;
  const royalApproachCrestCore=MeshBuilder.CreateCylinder("royal-approach-door-heraldic-core",{diameter:.95,height:.28,tessellation:8},scene);
  royalApproachCrestCore.position.set(0,18.35,-111.96);royalApproachCrestCore.rotation.x=Math.PI/2;royalApproachCrestCore.material=royalApproachDoorDark;


  // Public Royal Library: a civic landmark reached by a clear, generous path
  // branching left from the palace garden after the iron gate.
  const libraryStone=mat(scene,"public-library-limestone",new Color3(.78,.73,.63),.84);
  const libraryTrim=mat(scene,"public-library-carved-stone",new Color3(.88,.83,.72),.52,.12);
  const libraryRoof=mat(scene,"public-library-slate-roof",new Color3(.13,.19,.23),.42,.28);
  const libraryWood=mat(scene,"public-library-dark-oak",new Color3(.20,.105,.055),.72);
  const libraryGold=mat(scene,"public-library-brass",new Color3(.72,.53,.25),.28,.72);
  const libraryGlass=mat(scene,"public-library-window-glass",new Color3(.62,.78,.82),.16,.08);
  libraryGlass.alpha=.48;
  libraryGlass.transparencyMode=PBRMaterial.PBRMATERIAL_ALPHABLEND;
  libraryGlass.backFaceCulling=false;
  const libraryStainedGlass=[
    new Color3(.62,.18,.22),new Color3(.18,.42,.66),new Color3(.22,.52,.34),new Color3(.82,.62,.25)
  ].map((color,index)=>{
    const glass=mat(scene,"public-library-stained-glass-"+index,color,.18,.12);
    glass.alpha=.72;
    glass.transparencyMode=PBRMaterial.PBRMATERIAL_ALPHABLEND;
    glass.emissiveColor=color.scale(.12);
    glass.backFaceCulling=false;
    return glass;
  });
  const libraryFloor=mat(scene,"public-library-marble-floor",new Color3(.69,.65,.57),.36,.08);
  const libraryWall=mat(scene,"public-library-interior-wall",new Color3(.72,.67,.57),.9);
  const libraryBookMats=[
    mat(scene,"library-book-burgundy",new Color3(.36,.075,.10),.82),
    mat(scene,"library-book-forest",new Color3(.10,.24,.16),.84),
    mat(scene,"library-book-navy",new Color3(.075,.14,.25),.82),
    mat(scene,"library-book-ochre",new Color3(.55,.34,.12),.82)
  ];
  const libX=-52,libZ=-84,libW=24,libD=24,libEast=-40;
  // A 4.8 m pale-stone promenade turns left from the garden entrance,
  // passes through the deliberately cleared hedge corridor, and reaches the east door.
  const libraryWalk=MeshBuilder.CreateRibbon("public-library-garden-walk",{
    pathArray:[
      [new Vector3(-16.4,.045,-61.5),new Vector3(-16.4,.045,-70),new Vector3(-16.4,.045,-79.6),new Vector3(-23,.045,-79.6),new Vector3(-32,.045,-79.6),new Vector3(-40,.045,-79.6),new Vector3(-43.0,.045,-81.6)],
      [new Vector3(-11.6,.045,-61.5),new Vector3(-11.6,.045,-70),new Vector3(-11.6,.045,-84.4),new Vector3(-23,.045,-84.4),new Vector3(-32,.045,-84.4),new Vector3(-40,.045,-84.4),new Vector3(-43.0,.045,-86.4)]
    ],
    sideOrientation:2
  },scene);
  libraryWalk.material=libraryFloor;libraryWalk.isPickable=false;
  // The library gateway now stands on the straight approach, beside the royal
  // carriage stop. Its opening is aligned with the east-west path to the library door.
  const libraryGateX=-22.5,libraryGateZ=-82.0;
  for(const side of [-1,1]) {
    const z=libraryGateZ+side*3.25;
    box(scene,"public-library-garden-arch-pier",
      [libraryGateX,2.45,z],[.82,4.9,.72],libraryTrim);
    box(scene,"public-library-garden-arch-base",
      [libraryGateX,.38,z],[1.18,.48,1.12],libraryGold);
    box(scene,"public-library-garden-arch-cap",
      [libraryGateX,4.78,z],[1.08,.34,1.02],libraryGold);
  }
  // Voussoirs follow the curved crown in the vertical Y-Z plane.
  for(let i=0;i<=12;i++) {
    const a=Math.PI-i*Math.PI/12;
    const crown=MeshBuilder.CreateBox("public-library-garden-arch-voussoir",
      {width:.88,height:.62,depth:.72},scene);
    crown.position.set(libraryGateX,4.65+Math.sin(a)*2.05,libraryGateZ+Math.cos(a)*3.25);
    crown.rotation.x=a-Math.PI/2;
    crown.material=i%2?libraryTrim:libraryGold;
    crown.isPickable=false;
  }
  box(scene,"public-library-garden-arch-keystone",
    [libraryGateX,6.72,libraryGateZ],[1.0,.8,1.0],libraryGold);
  // Foundation, entrance facade (with a real opening), side walls and enclosed rear wall.
  box(scene,"public-library-foundation",[libX,.48,libZ],[libW+1.2,.9,libD+1.2],libraryTrim);
  box(scene,"public-library-floor",[libX,.96,libZ],[libW,.16,libD],libraryFloor);
  // East facade: keep only the two intended window openings and the main doorway.
  // Fill the narrow wall returns between each window and its stone piers so no
  // accidental full-height gaps remain beside the windows.
  for(const center of [-94,-74]) {
    const prefix=center===-94?"north":"south";
    box(scene,"public-library-east-wall-"+prefix+"-lower",[-40.25,2.45,center],[.55,3.0,10.4],libraryStone);
    box(scene,"public-library-east-wall-"+prefix+"-upper",[-40.25,8.25,center],[.55,2.0,10.4],libraryStone);
    for(const dz of [-4.0,4.0])
      box(scene,"public-library-east-wall-"+prefix+"-window-pier",[-40.25,5.1,center+dz],[.55,5.3,2.4],libraryStone);
    for(const dz of [-2.8,2.8])
      box(scene,"public-library-east-wall-"+prefix+"-window-return",[-40.25,5.1,center+dz],[.55,5.3,1.6],libraryStone);
  }
  // Solid masonry beside the entrance; the only doorway gap is z=-86 to -82.
  box(scene,"public-library-east-wall-door-north-return",[-40.25,4.95,-87.4],[.55,8.0,2.8],libraryStone);
  box(scene,"public-library-east-wall-door-south-return",[-40.25,4.95,-80.6],[.55,8.0,2.8],libraryStone);
  box(scene,"public-library-east-wall-over-door",[-40.25,8.0,-84],[.55,2.5,3.2],libraryStone);
  // Real window openings are cut into the masonry rather than placing glass
  // on top of solid walls. Lower and upper wall bands keep the structure intact.
  box(scene,"public-library-west-wall-lower",[-63.75,3.895,libZ],[.55,5.89,libD],libraryStone);
  box(scene,"public-library-west-wall-upper",[-63.75,8.755,libZ],[.55,.99,libD],libraryStone);
  for(const [center,length] of [[-94.0125,3.975],[-87.5,4.95],[-80.5,4.95],[-73.9875,3.975]])
    box(scene,"public-library-west-wall-window-pier",[-63.75,7.55,center],[.55,1.42,length],libraryStone);
  for(const sideZ of [-96,-72]) {
    const north=sideZ===-96;
    const prefix=north?"north":"south";
    box(scene,"public-library-"+prefix+"-wall-lower",[libX,3.825,sideZ],[libW,5.75,.55],libraryStone);
    box(scene,"public-library-"+prefix+"-wall-upper",[libX,8.6,sideZ],[libW,1.3,.55],libraryStone);
    for(const [center,length] of [[-62.045,3.91],[-55.5,4.82],[-48.5,4.82],[-41.955,3.91]])
      box(scene,"public-library-"+prefix+"-wall-window-pier",[center,7.65,sideZ],[length,1.38,.55],libraryStone);
  }
  // Tall slate roof with a raised central ridge and gold-edged eaves.
  box(scene,"public-library-roof-left",[-47.0,10.0,libZ],[13.8,.42,26],libraryRoof,{rotation:-.22});
  box(scene,"public-library-roof-right",[-57.0,10.0,libZ],[13.8,.42,26],libraryRoof,{rotation:.22});
  box(scene,"public-library-roof-ridge",[libX,10.9,libZ],[.55,.45,26.5],libraryGold);
  for(const z of [-94,-74]) {
    box(scene,"public-library-east-window-recess",[-40.53,5.7,z],[.08,4.5,2.4],libraryWood);
    box(scene,"public-library-east-window-glass",[-40.25,5.7,z],[.06,3.75,1.75],libraryGlass);
    box(scene,"public-library-east-window-mullion",[-40.18,5.7,z],[.06,3.8,.12],libraryGold);
    box(scene,"public-library-east-window-crossbar",[-40.18,5.7,z],[.06,.12,1.85],libraryGold);
    box(scene,"public-library-window-sill",[-39.98,3.35,z],[.5,.18,2.7],libraryTrim);
    for(let pane=0;pane<4;pane++)
      box(scene,"public-library-east-stained-pane",[-40.16,5.7,z-.66+pane*.44],[.035,3.25,.40],libraryStainedGlass[pane]);
    for(const dz of [-1.18,1.18])
      box(scene,"public-library-east-window-stone-jamb",[-39.98,5.7,z+dz],[.24,4.0,.16],libraryTrim);
    box(scene,"public-library-east-window-hood",[-39.98,7.72,z],[.32,.18,2.7],libraryGold);
  }
  for(const z of [-95,-73]) {
    box(scene,"public-library-side-window-recess",[-52,5.8,z],[3.0,4.4,.08],libraryWood);
    box(scene,"public-library-side-window-glass",[-52,5.8,z],[2.3,3.7,.06],libraryGlass);
    box(scene,"public-library-side-window-mullion",[-52,5.8,z],[.12,3.8,.06],libraryGold);
  }
  // Additional high clerestory windows on the west wall bring daylight over the
  // bookcases without sacrificing the continuous wall of books below.
  for(const z of [-91.0,-84.0,-77.0]) {
    box(scene,"public-library-west-window-recess",[-64.02,7.55,z],[.10,1.75,2.45],libraryWood);
    box(scene,"public-library-west-window-glass",[-63.75,7.55,z],[.055,1.42,2.05],libraryGlass);
    box(scene,"public-library-west-window-vertical-mullion",[-63.70,7.55,z],[.07,1.48,.10],libraryGold);
    box(scene,"public-library-west-window-crossbar",[-63.70,7.55,z],[.07,.10,2.12],libraryGold);
    for(const dz of [-1.18,1.18])
      box(scene,"public-library-west-window-stone-jamb",[-63.90,7.55,z+dz],[.24,1.95,.16],libraryTrim);
    box(scene,"public-library-west-window-sill",[-63.82,6.62,z],[.38,.16,2.65],libraryTrim);
    box(scene,"public-library-west-window-hood",[-63.82,8.48,z],[.38,.18,2.65],libraryGold);
    for(let pane=0;pane<4;pane++)
      box(scene,"public-library-west-stained-pane",[-63.69,7.55,z-.78+pane*.52],[.035,1.24,.48],libraryStainedGlass[(pane+1)%4]);
  }
  // North-facing clerestory windows add daylight above the stacks.
  for(const x of [-59.0,-52.0,-45.0]) {
    box(scene,"public-library-north-clerestory-recess",[x,7.65,-96.22],[2.55,1.72,.12],libraryWood);
    box(scene,"public-library-north-clerestory-glass",[x,7.65,-96.0],[2.18,1.38,.055],libraryGlass);
    box(scene,"public-library-north-clerestory-mullion",[x,7.65,-95.95],[.09,1.46,.07],libraryGold);
    box(scene,"public-library-north-clerestory-crossbar",[x,7.65,-95.95],[2.22,.09,.07],libraryGold);
    for(const dx of [-1.24,1.24])
      box(scene,"public-library-north-window-jamb",[x+dx,7.65,-96.10],[.16,1.9,.22],libraryTrim);
    box(scene,"public-library-north-window-sill",[x,6.72,-96.10],[2.78,.18,.3],libraryTrim);
    box(scene,"public-library-north-window-hood",[x,8.62,-96.10],[2.82,.18,.32],libraryGold);
    for(let pane=0;pane<4;pane++)
      box(scene,"public-library-north-stained-pane",[x- .78+pane*.52,7.65,-95.92],[.48,1.22,.035],libraryStainedGlass[pane]);
  }
  // Three high south clerestory windows sit above the lower shelves.
  for(const x of [-59.0,-52.0,-45.0]) {
    box(scene,"public-library-south-clerestory-recess",[x,7.75,-71.78],[2.45,1.55,.10],libraryWood);
    box(scene,"public-library-south-clerestory-glass",[x,7.75,-72.0],[2.08,1.22,.055],libraryGlass);
    box(scene,"public-library-south-clerestory-mullion",[x,7.75,-72.05],[.08,1.28,.07],libraryGold);
    box(scene,"public-library-south-clerestory-crossbar",[x,7.75,-72.05],[2.15,.08,.07],libraryGold);
    for(const dx of [-1.18,1.18])
      box(scene,"public-library-south-window-jamb",[x+dx,7.75,-71.90],[.16,1.75,.22],libraryTrim);
    box(scene,"public-library-south-window-hood",[x,8.62,-71.90],[2.62,.16,.28],libraryGold);
    for(let pane=0;pane<4;pane++)
      box(scene,"public-library-south-stained-pane",[x-.78+pane*.52,7.75,-72.04],[.48,1.08,.035],libraryStainedGlass[(pane+2)%4]);
  }
  // A single clear double-door entrance, using the door's own carved stone frame.
  addAntiqueDoor(scene,"public-library-main-double-door",-40.1,1.05,-84,4.1,5.2,
    {wood:libraryWood,woodLight:libraryWood,gold:libraryGold,trim:libraryTrim},.88,"x");
  // One restrained sign sits above the arch; no extra doorway layers overlap the doors.
  box(scene,"public-library-sign-board",[-40.82,8.0,-84],[.22,.72,4.8],libraryWood);
  box(scene,"public-library-sign-inlay",[-40.96,8.0,-84],[.08,.48,4.4],libraryGold);
  // Interior: two-storey reading hall, gallery-like upper shelving, and warm reading tables.
  // The exterior masonry is the actual interior wall. Avoid a second solid
  // backdrop behind it so daylight can pass through the newly opened windows.
  box(scene,"public-library-ceiling",[libX,9.3,libZ],[23.5,.28,23.5],libraryTrim);
  const libraryDaylight=new PointLight("public-library-daylight-fill",new Vector3(-53,7.7,-84),scene);
  libraryDaylight.diffuse=new Color3(.78,.88,1);
  libraryDaylight.intensity=.42;
  libraryDaylight.range=23;
  // Human-scale Salamanca-inspired bookcases: individual volumes are about 28–34 cm tall,
  // with narrow spines, thin pages and realistic shelf spacing (not oversized blocks).
  const libraryBookCount=libraryBookMats.length;
  for(let bay=0;bay<5;bay++) {
    const z=-92+bay*4.25;
    box(scene,"public-library-west-bookcase-body",[-62.55,4.15,z],[.72,5.95,3.95],libraryWood);
    box(scene,"public-library-west-bookcase-crown",[-62.12,7.22,z],[.18,.22,4.08],libraryGold);
    box(scene,"public-library-west-bookcase-plinth",[-62.12,1.22,z],[.22,.28,4.08],libraryTrim);
    for(let level=0;level<6;level++) {
      const y=1.48+level*.88;
      box(scene,"public-library-west-shelf",[-62.08,y,z],[.78,.075,3.78],libraryGold);
      for(let b=0;b<16;b++) {
        const book=box(scene,"public-library-west-volume",[-61.91,y+.145,z-1.72+b*.225],[.075,.25,.145],libraryBookMats[(b+level+bay)%libraryBookCount]);
        book.rotation.x=(b%4-1.5)*.012;
        if(b%3===0) box(scene,"public-library-west-gilt-spine-band",[-61.865,y+.145,z-1.72+b*.225],[.012,.035,.105],libraryGold);
      }
    }
    for(const side of [-1,1]) {
      box(scene,"public-library-west-carved-pilaster",[-62.02,4.2,z+side*1.98],[.26,6.2,.22],libraryTrim);
      box(scene,"public-library-west-pilaster-cap",[-61.91,7.35,z+side*1.98],[.34,.22,.34],libraryGold);
    }
  }
  // Lower perimeter shelves carry matching human-sized books, leaving the tall windows readable.
  for(const z of [-95.0,-73.0]) {
    for(const x of [-59.0,-54.5,-47.5,-43.5]) {
      box(scene,"public-library-end-bookcase",[x,3.95,z],[3.65,5.55,.62],libraryWood);
      for(let level=0;level<5;level++) {
        const y=1.48+level*.88;
        box(scene,"public-library-end-shelf",[x,y,z-.34],[3.52,.075,.12],libraryGold);
        for(let b=0;b<17;b++) {
          const book=box(scene,"public-library-end-volume",[x-1.68+b*.21,y+.145,z-.43],[.145,.25,.075],libraryBookMats[(b+level)%libraryBookCount]);
          book.rotation.z=(b%2?-.012:.012);
        }
      }
    }
  }
  // Tall stone piers, carved capitals and shallow arches give the hall a university-library rhythm.
  for(const z of [-94.2,-89.2,-79.2,-74.2]) {
    box(scene,"public-library-east-pier",[-40.72,4.85,z],[.34,7.55,.34],libraryTrim);
    box(scene,"public-library-east-pier-base",[-40.72,1.35,z],[.58,.34,.58],libraryGold);
    box(scene,"public-library-east-pier-cap",[-40.72,8.45,z],[.62,.38,.62],libraryGold);
  }
  // Burgundy heraldic banners, green-shaded brass reading lights and stone statuary.
  for(const z of [-91.5,-76.5]) {
    box(scene,"public-library-burgundy-banner",[-41.05,6.35,z],[.12,2.05,.92],libraryBookMats[0]);
    box(scene,"public-library-banner-gilt-top",[-41.14,7.42,z],[.16,.12,1.08],libraryGold);
    const tassel=MeshBuilder.CreateCylinder("public-library-banner-tassel",{diameter:.08,height:.38,tessellation:8},scene);
    tassel.position.set(-41.05,5.15,z);tassel.material=libraryGold;
  }
  const statueBase=box(scene,"public-library-marble-statue-plinth",[-59.8,1.55,-84],[1.25,1.1,1.25],libraryTrim);
  const libraryScholarStatue=MeshBuilder.CreateSphere("public-library-marble-scholar-statue",{diameter:1.15,segments:16},scene);
  libraryScholarStatue.position.set(-59.8,2.65,-84);libraryScholarStatue.scaling.y=1.65;libraryScholarStatue.material=libraryWall;
  const statueHead=MeshBuilder.CreateSphere("public-library-statue-head",{diameter:.48,segments:16},scene);
  statueHead.position.set(-59.8,3.65,-84);statueHead.material=libraryWall;
  // Study tables now have real aprons and four legs; chairs sit on the marble floor
  // with visible legs, a lower seat, and a properly joined backrest.
  const librarySeats=[];
  for(const z of [-89,-78]) {
    box(scene,"public-library-reading-table-top",[-47.2,2.04,z],[5.8,.20,1.8],libraryWood);
    box(scene,"public-library-reading-table-apron",[-47.2,1.78,z],[5.35,.34,1.42],libraryWood);
    for(const lx of [-2.55,2.55]) for(const lz of [-.65,.65])
      box(scene,"public-library-reading-table-leg",[-47.2+lx,1.42,z+lz],[.18,.92,.18],libraryWood);
    for(const side of [-1,1]) for(const x of [-49.2,-47.2,-45.2]) {
      const chairZ=z+side*1.55;
      box(scene,"public-library-reading-chair-seat",[x,1.22,chairZ],[.76,.18,.76],libraryWood);
      box(scene,"public-library-chair-back",[x,1.70,chairZ+side*.34],[.76,.86,.16],libraryWood);
      for(const lx of [-.27,.27]) for(const lz of [-.27,.27])
        box(scene,"public-library-chair-leg",[x+lx,1.12,chairZ+lz],[.10,.48,.10],libraryWood);
      // A brass foot rail and carved side rails make the chair feel like real furniture.
      box(scene,"public-library-chair-back-rail",[x,2.12,chairZ+side*.34],[.78,.10,.20],libraryGold);
      librarySeats.push({x,z:chairZ,yaw:side>0?0:Math.PI});
    }
    const lamp=MeshBuilder.CreateCylinder("public-library-reading-lamp",{diameter:.16,height:.9,tessellation:12},scene);
    lamp.position.set(-47.2,2.56,z);lamp.material=libraryGold;
    const shade=MeshBuilder.CreateCylinder("public-library-lamp-shade",{diameterTop:.38,diameterBottom:.72,height:.32,tessellation:16},scene);
    shade.position.set(-47.2,3.04,z);shade.material=libraryBookMats[1];
    const pool=MeshBuilder.CreateCylinder("public-library-lamp-light-pool",{diameter:1.5,height:.025,tessellation:20},scene);
    pool.position.set(-47.2,2.16,z);pool.material=libraryTrim;
  }
  // A patterned runner, reading-gallery balustrade and timber ceiling ribs complete the hall.
  box(scene,"public-library-central-carpet",[-52,1.075,-84],[4.2,.035,8.5],libraryBookMats[0]);
  for(let z=-94;z<=-74;z+=4) {
    box(scene,"public-library-ceiling-rib",[-52,9.02,z],[22.2,.22,.24],libraryWood);
    for(const x of [-62.5,-41.5])
      box(scene,"public-library-rib-gilt-cap",[x,9.02,z],[.12,.28,.34],libraryGold);
  }
  // A grand antique brass chandelier anchors the double-height reading hall.
  // Its chain, scrolling arms and candle cups stay clear of the upper gallery.
  const libraryIron=mat(scene,"public-library-chandelier-iron",new Color3(.105,.085,.065),.34,.82);
  const libraryBrass=mat(scene,"public-library-chandelier-brass",new Color3(.72,.51,.23),.28,.78);
  const libraryCandle=mat(scene,"public-library-chandelier-candle",new Color3(1,.67,.30),.28);
  libraryCandle.emissiveColor=new Color3(.95,.38,.10);
  cylinder(scene,"public-library-chandelier-ceiling-rose",[-52,9.12,-84],1.05,.12,libraryBrass,24);
  cylinder(scene,"public-library-chandelier-main-chain",[-52,8.28,-84],.075,1.55,libraryIron,12);
  const libraryChandelierRing=MeshBuilder.CreateTorus("public-library-antique-chandelier-ring",{diameter:5.2,thickness:.14,tessellation:32},scene);
  libraryChandelierRing.position.set(-52,7.42,-84);libraryChandelierRing.material=libraryBrass;
  const libraryChandelierInner=MeshBuilder.CreateTorus("public-library-chandelier-inner-ring",{diameter:3.45,thickness:.075,tessellation:28},scene);
  libraryChandelierInner.position.set(-52,7.55,-84);libraryChandelierInner.material=libraryIron;
  for(let i=0;i<8;i++) {
    const a=i*Math.PI/4,px=-52+Math.cos(a)*2.48,pz=-84+Math.sin(a)*2.48;
    const arm=MeshBuilder.CreateTube("public-library-chandelier-curled-arm",{
      path:[new Vector3(-52,7.52,-84),new Vector3(-52+Math.cos(a)*1.25,7.82,-84+Math.sin(a)*1.25),new Vector3(px,7.55,pz)],radius:.075,tessellation:8
    },scene);arm.material=libraryBrass;arm.isPickable=false;
    cylinder(scene,"public-library-chandelier-candle-cup",[px,7.72,pz],.28,.12,libraryIron,12);
    cylinder(scene,"public-library-chandelier-candle",[px,7.98,pz],.13,.42,libraryCandle,10);
    const flame=MeshBuilder.CreateSphere("public-library-chandelier-flame",{diameter:.17,segments:8},scene);
    flame.position.set(px,8.25,pz);flame.material=libraryCandle;flame.isPickable=false;
    const drop=MeshBuilder.CreateSphere("public-library-chandelier-crystal-drop",{diameter:.16,segments:8},scene);
    drop.position.set(-52+Math.cos(a)*1.78,7.12,-84+Math.sin(a)*1.78);drop.material=libraryBrass;drop.isPickable=false;
  }
  const libraryChandelierLight=new PointLight("public-library-chandelier-light",new Vector3(-52,7.5,-84),scene);
  libraryChandelierLight.diffuse=new Color3(1,.72,.42);libraryChandelierLight.intensity=.48;libraryChandelierLight.range=16;
  // A true upper reading gallery: timber floor, carved balustrade and a second
  // tier of shelves tucked behind the stone columns, like a historic university hall.
  // The gallery deck is built around a real stairwell opening; the stair must not pass through a solid slab.
  box(scene,"public-library-mezzanine-floor-west",[-55.775,5.25,-92.7],[12.95,.28,6.0],libraryWood);
  box(scene,"public-library-mezzanine-floor-north",[-46.525,5.25,-94.425],[5.55,.28,2.55],libraryWood);
  box(scene,"public-library-mezzanine-floor-south",[-46.525,5.25,-90.625],[5.55,.28,1.85],libraryWood);
  // Upper-gallery wall stacks: books line the north and west walls above the
  // lower-floor collections, with compact human-scale volumes and extra tiers.
  for(const x of [-60.5,-57.0,-53.5,-50.0,-46.5]) {
    box(scene,"public-library-upper-north-wall-case",[x,6.55,-95.35],[3.25,2.15,.48],libraryWood);
    for(let level=0;level<3;level++) {
      const y=5.78+level*.68;
      box(scene,"public-library-upper-north-wall-shelf",[x,y,-95.08],[3.12,.065,.12],libraryGold);
      for(let b=0;b<15;b++)
        box(scene,"public-library-upper-north-wall-volume",[x-1.43+b*.205,y+.12,-95.0],[.135,.21,.075],libraryBookMats[(b+level)%libraryBookCount]);
    }
  }
  for(const z of [-94.0,-91.8]) {
    box(scene,"public-library-upper-west-wall-case",[-62.0,6.55,z],[.48,2.15,2.0],libraryWood);
    for(let level=0;level<3;level++) {
      const y=5.78+level*.68;
      box(scene,"public-library-upper-west-wall-shelf",[-61.72,y,z],[.12,.065,1.88],libraryGold);
      for(let b=0;b<9;b++)
        box(scene,"public-library-upper-west-wall-volume",[-61.62,y+.12,z-.82+b*.205],[.075,.21,.135],libraryBookMats[(b+level+1)%libraryBookCount]);
    }
  }
  // A narrower, properly stepped oak stair rises from the east aisle to the gallery.
  // Each tread top matches the walking surface from the marble floor to the gallery deck.
  const libraryStairRun=6.0,libraryStairRise=4.35,libraryStairCount=18;
  for(let i=0;i<libraryStairCount;i++) {
    const t=(i+.5)/libraryStairCount;
    const x=-42.55-t*libraryStairRun;
    const treadTop=1.04+t*libraryStairRise;
    const y=treadTop-.17;
    box(scene,"public-library-grand-stair-step",[x,y,-92.35],[.38,.34,1.32],libraryWood);
    box(scene,"public-library-grand-stair-nosing",[x,y+.18,-92.35],[.40,.055,1.38],libraryGold);
  }
  for(const side of [-1,1]) {
    const rail=box(scene,"public-library-grand-stair-stringer",[-45.55,3.20,-92.35+side*.74],[6.35,.20,.14],libraryTrim);
    rail.rotation.z=-Math.atan(libraryStairRise/libraryStairRun);
    for(let i=0;i<9;i++) {
      const t=(i+.5)/9;
      const treadTop=1.04+t*libraryStairRise;
      box(scene,"public-library-grand-stair-baluster",[-42.55-t*6,treadTop+.42,-92.35+side*.74],[.085,.84,.085],libraryGold);
    }
  }
  box(scene,"public-library-grand-stair-landing",[-49.65,5.25,-92.35],[.8,.28,1.65],libraryWood);
  box(scene,"public-library-mezzanine-front-beam",[-53.0,5.12,-89.85],[16.6,.34,.24],libraryGold);
  for(const x of [-57.8,-54.9,-52.0,-49.1,-46.2,-43.3]) {
    box(scene,"public-library-mezzanine-baluster",[x,5.78,-89.9],[.12,.78,.12],libraryWood);
    box(scene,"public-library-mezzanine-post-cap",[x,6.2,-89.9],[.22,.12,.22],libraryGold);
  }
  box(scene,"public-library-mezzanine-handrail",[-52.6,6.2,-89.9],[15.4,.16,.22],libraryGold);
  for(const x of [-59.5,-54.5,-49.5,-44.5]) {
    box(scene,"public-library-upper-bookcase",[x,6.45,-94.5],[3.9,2.15,.62],libraryWood);
    for(let level=0;level<2;level++) {
      const y=5.65+level*.88;
      // Shelves and book spines face south into the room, not into the north wall.
      box(scene,"public-library-upper-shelf",[x,y,-94.12],[3.72,.075,.12],libraryGold);
      for(let b=0;b<16;b++)
        box(scene,"public-library-upper-volume",[x-1.72+b*.22,y+.14,-94.04],[.15,.24,.075],libraryBookMats[(b+level)%libraryBookCount]);
    }
  }
  // One continuous gallery follows the wall directly opposite the entrance.
  // It joins the existing left/north gallery at the rear corner without creating
  // a second overlapping balcony.
  box(scene,"public-library-west-gallery-floor",[-61.05,5.25,-81.95],[2.25,.28,17.2],libraryWood);
  box(scene,"public-library-west-gallery-inner-beam",[-59.88,5.12,-81.95],[.20,.34,16.9],libraryGold);
  for(let z=-88.65;z<=-74.1;z+=1.05) {
    box(scene,"public-library-west-gallery-baluster",[-59.9,5.78,z],[.12,.72,.12],libraryWood);
    box(scene,"public-library-west-gallery-post-cap",[-59.9,6.18,z],[.20,.10,.20],libraryGold);
  }
  // One corner newel joins the two railing runs without overlapping posts.
  box(scene,"public-library-gallery-corner-newel",[-59.9,5.82,-89.9],[.20,.88,.20],libraryWood);
  box(scene,"public-library-gallery-corner-cap",[-59.9,6.30,-89.9],[.28,.12,.28],libraryGold);
  box(scene,"public-library-west-gallery-handrail",[-59.9,6.18,-81.95],[.20,.15,15.9],libraryGold);
  // Upper wall stacks face the entrance; matching ground-floor stacks remain below.
  for(const z of [-87.7,-85.2,-80.5,-76.0]) {
    box(scene,"public-library-upper-west-facing-bookcase",[-62.35,6.55,z],[.48,2.18,2.15],libraryWood);
    for(let level=0;level<3;level++) {
      const y=5.72+level*.66;
      box(scene,"public-library-upper-west-facing-shelf",[-62.05,y,z],[.12,.065,2.02],libraryGold);
      for(let b=0;b<9;b++)
        box(scene,"public-library-upper-west-facing-volume",[-61.94,y+.12,z-.86+b*.215],[.075,.21,.135],libraryBookMats[(b+level)%libraryBookCount]);
    }
  }
  // A climbable-looking oak library ladder leans against the upper shelves.
  for(const x of [-58.0,-56.85]) {
    const rail=box(scene,"public-library-ladder-rail",[x,3.72,-93.45],[.12,4.35,.14],libraryWood);
    rail.rotation.x=-.22;
  }
  for(let r=0;r<10;r++)
    box(scene,"public-library-ladder-rung",[-57.43,1.75+r*.39,-93.12-r*.095],[1.08,.075,.09],libraryGold);
  // Stone columns carry warm brass sconces; a few restrained ivy strands soften the masonry.
  for(const [x,z] of [[-59.8,-88.2],[-53.2,-88.2],[-46.6,-88.2],[-59.8,-78.2]]) {
    box(scene,"public-library-reading-column",[x,4.45,z],[.62,6.7,.62],libraryTrim);
    box(scene,"public-library-column-base",[x,1.25,z],[.92,.34,.92],libraryGold);
    box(scene,"public-library-column-capital",[x,7.75,z],[.98,.38,.98],libraryGold);
    box(scene,"public-library-sconce-arm",[x,4.45,z+.42],[.16,.12,.62],libraryGold);
    const sconce=MeshBuilder.CreateCylinder("public-library-column-sconce",{diameter:.24,height:.48,tessellation:12},scene);
    sconce.position.set(x,4.55,z+.78);sconce.material=libraryBookMats[3];
    const glow=mat(scene,"public-library-sconce-glow",new Color3(.95,.66,.28),.3,.4);
    glow.emissiveColor=new Color3(.65,.31,.08);
    const flame=MeshBuilder.CreateSphere("public-library-sconce-flame",{diameter:.16,segments:8},scene);
    flame.position.set(x,4.58,z+.82);flame.material=glow;
    if(!isTouchDevice) {
      const sconceLight=new PointLight("public-library-sconce-light",new Vector3(x,4.58,z+.92),scene);
      sconceLight.diffuse=new Color3(1,.68,.34);
      sconceLight.intensity=.32;
      sconceLight.range=7;
    }
  }
  const ivyMat=mat(scene,"public-library-ivy-green",new Color3(.12,.25,.13),.92);
  for(const [x,z,phase] of [[-59.8,-88.2,0],[-59.8,-78.2,1],[-40.9,-91.5,2]]) {
    const path=[];
    for(let i=0;i<26;i++) {
      const t=i/25;
      path.push(new Vector3(x+Math.sin(t*13+phase)*.22,1.7+t*5.2,z+Math.cos(t*11+phase)*.20));
    }
    const vine=MeshBuilder.CreateTube("public-library-climbing-ivy",{path,radius:.035,tessellation:6},scene);
    vine.material=ivyMat;
    for(let i=2;i<24;i+=2) {
      const p=path[i];
      const leaf=MeshBuilder.CreateSphere("public-library-ivy-leaf",{diameter:.20,segments:6},scene);
      leaf.position.copyFrom(p);leaf.scaling.set(1.4,.35,.75);leaf.material=ivyMat;
    }
  }
  // Layered carpets mark the reading zone, with a fine gold border and woven medallions.
  box(scene,"public-library-reading-rug-large",[-51.8,1.09,-83.7],[10.8,.045,9.2],libraryBookMats[0]);
  box(scene,"public-library-reading-rug-inner",[-51.8,1.12,-83.7],[9.9,.025,8.3],libraryBookMats[1]);
  for(const x of [-56.9,-46.7]) for(const z of [-88.0,-79.4])
    box(scene,"public-library-rug-corner-medallion",[x,1.145,z],[.42,.025,.42],libraryGold);
  for(const z of [-88.25,-79.15])
    box(scene,"public-library-rug-gold-border",[-51.8,1.145,z],[10.2,.025,.07],libraryGold);
  // Heraldic cloth banners hang between the piers, with gold fringe and a book sigil.
  for(const z of [-86.0,-80.0]) {
    box(scene,"public-library-hanging-banner",[-41.15,6.35,z],[.12,2.05,1.15],libraryBookMats[0]);
    box(scene,"public-library-banner-crossbar",[-41.22,7.42,z],[.18,.12,1.3],libraryGold);
    for(const dz of [-.48,.48]) {
      const fringe=MeshBuilder.CreateCylinder("public-library-banner-fringe",{diameter:.045,height:.28,tessellation:6},scene);
      fringe.position.set(-41.16,5.25,z+dz);fringe.material=libraryGold;
    }
    const sigil=MeshBuilder.CreateCylinder("public-library-banner-book-sigil",{diameter:.28,height:.035,tessellation:8},scene);
    sigil.position.set(-41.24,6.55,z);sigil.rotation.x=Math.PI/2;sigil.material=libraryGold;
  }
  // Keep the reception desk deeper inside so the doorway and first steps remain clear.
  box(scene,"public-library-help-desk",[-48.0,1.75,-84],[2.2,1.4,1.0],libraryWood);
  box(scene,"public-library-help-desk-top",[-48.0,2.5,-84],[2.5,.16,1.2],libraryGold);
  // Batch the library's many static decorative parts by material. This keeps the
  // finer book spines and carved details while limiting draw calls on mobile GPUs.
  const libraryBatches=new Map();
  for(const mesh of [...scene.meshes]) {
    if(!mesh.name.startsWith("public-library-")||mesh.parent||mesh.isDisposed())continue;
    if(/main-double-door|window-glass|reading-lamp|lamp-shade|lamp-light-pool|statue/.test(mesh.name))continue;
    if(!mesh.material||Array.isArray(mesh.material)||mesh.getTotalVertices()===0)continue;
    mesh.computeWorldMatrix(true);
    if(!libraryBatches.has(mesh.material))libraryBatches.set(mesh.material,[]);
    libraryBatches.get(mesh.material).push(mesh);
  }
  let libraryBatchIndex=0;
  for(const [material,parts] of libraryBatches) {
    if(parts.length<2)continue;
    const merged=Mesh.MergeMeshes(parts,true,true,undefined,false,false);
    if(merged) {
      merged.name="public-library-static-detail-batch-"+libraryBatchIndex++;
      merged.material=material;
      merged.isPickable=false;
    }
  }
  // Collision is handled in collides() so visitors can freely walk between the shelves.

  // Yggdrasil now floats much higher in the open sky, with its roots fully exposed beneath the island.
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
  // Lift the entire tree, floating island, canopy, luminous seeds and hanging roots together.
  const worldTreeLift=72;
  for(const mesh of scene.meshes) {
    if(mesh.name.startsWith("world-tree-") && mesh.name!=="world-tree-approach") mesh.position.y+=worldTreeLift;
  }
  for(const leaf of canopy) leaf.baseY+=worldTreeLift;

  // Yield between major districts so mobile Safari can service the page.
  await new Promise(resolve=>setTimeout(resolve,0));
  // Detailed CC0 models add leaf geometry and a merchant wagon.
  // Optional high-detail props are fetched only after the first playable frame.
  // Load them one at a time so Safari never has to decode eleven models at once.
  const modelJobs = [
    () => addCC0Model(scene,"Prop_Vine1",[-26.6,2.1,11.24],[1.35,1.35,1.35],0),
    () => addCC0Model(scene,"Prop_Vine1",[-15.4,2.0,11.24],[1.15,1.25,1.15],0),
    () => addCC0Model(scene,"Prop_Vine2",[-13.9,2.3,-11.1],[1.2,1.2,1.2],0),
    () => addCC0Model(scene,"Prop_Vine4",[-28.2,2.0,11.2],[1.0,1.1,1.0],0),
    () => addCC0Model(scene,"Prop_Vine5",[-13.9,2.0,-20.5],[1.0,1.0,1.0],0),
    () => addCC0Model(scene,"Roof_Dormer_RoundTile",[-24.5,9.4,6.2],[1.15,1.15,1.15],0),
    () => addCC0Model(scene,"Roof_Dormer_RoundTile",[-18.0,9.4,6.2],[1.15,1.15,1.15],0),
    () => addCC0Model(scene,"Prop_Crate",[13.4,0.02,-7.4],[.85,.85,.85],.2),
    () => addCC0Model(scene,"Prop_Crate",[17.6,0.02,-14.2],[.85,.85,.85],-.15),
    () => addCC0Model(scene,"Prop_Crate",[26.8,0.02,-11.0],[.85,.85,.85],.3),
    () => addCC0Model(scene,"Prop_Wagon",[32.2,0.02,-18.0],[1.25,1.25,1.25],Math.PI*.5),
  ];
  // These decorative external GLTFs are intentionally skipped on touch devices:
  // decoding them can exceed mobile Safari's memory budget after startup.
  if(!isTouchDevice) setTimeout(() => {
    void (async () => {
      for (const loadModel of modelJobs) await loadModel();
    })().catch(error => console.warn("Optional world props could not be loaded:", error));
  }, 20000);
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

  // The brook now follows the open southern greenway, outside every building footprint.
  // It begins beside the rose garden, passes the guild and market from their open side,
  // then bends around the artisan quarter rather than cutting through walls or interiors.
  const brookWater=mat(scene,"guildside-brook-water",new Color3(.12,.39,.47),.16,.22);brookWater.alpha=.88;
  const brookStone=mat(scene,"guildside-brook-stone",new Color3(.48,.45,.37),.92);
  const brookEdge=mat(scene,"guildside-brook-edge",new Color3(.68,.62,.49),.78);
  const brookAnchors=[[-24,-58],[-18,-54],[-12,-50],[-6,-47],[6,-47],[20,-47],[34,-47],[46,-47],[53,-49],[68,-49],[79,-46],[84,-32],[96,-27],[106,-22],[108,-8],[105,10],[96,27]].map(([x,z])=>new Vector3(x,.055,z));
  // Catmull-Rom sampling makes a continuous natural meander, without sharp polyline corners.
  const brookPoints=[];
  for(let i=0;i<brookAnchors.length-1;i++) {
    const p0=brookAnchors[Math.max(0,i-1)],p1=brookAnchors[i],p2=brookAnchors[i+1],p3=brookAnchors[Math.min(brookAnchors.length-1,i+2)];
    for(let step=0;step<8;step++) {
      const t=step/8,t2=t*t,t3=t2*t;
      const v=p1.scale(2).add(p2.subtract(p0).scale(t))
        .add(p0.scale(2).subtract(p1.scale(5)).add(p2.scale(4)).subtract(p3).scale(t2))
        .add(p0.scale(-1).add(p1.scale(3)).subtract(p2.scale(3)).add(p3).scale(t3)).scale(.5);
      brookPoints.push(new Vector3(v.x,.055,v.z));
    }
  }
  brookPoints.push(brookAnchors[brookAnchors.length-1].clone());
  const brookLeft=[],brookRight=[];
  for(let i=0;i<brookPoints.length;i++) {
    const tangent=brookPoints[Math.min(i+1,brookPoints.length-1)].subtract(brookPoints[Math.max(0,i-1)]).normalize();
    const normal=new Vector3(-tangent.z,0,tangent.x).scale(3.25);
    brookLeft.push(brookPoints[i].add(normal));brookRight.push(brookPoints[i].subtract(normal));
  }
  const brook=MeshBuilder.CreateRibbon("connected-town-brook",{pathArray:[brookLeft,brookRight],sideOrientation:2},scene);
  brook.material=brookWater;brook.isPickable=false;
  for(const side of [-1,1]) {
    const bank=[];
    for(let i=0;i<brookPoints.length;i++) {
      const tangent=brookPoints[Math.min(i+1,brookPoints.length-1)].subtract(brookPoints[Math.max(0,i-1)]).normalize();
      bank.push(brookPoints[i].add(new Vector3(-tangent.z,0,tangent.x).scale(side*3.42)));
    }
    for(let i=0;i<bank.length-1;i+=2) {
      const next=bank[Math.min(i+2,bank.length-1)],mid=Vector3.Lerp(bank[i],next,.5);
      const dx=next.x-bank[i].x,dz=next.z-bank[i].z,len=Math.sqrt(dx*dx+dz*dz);
      const stone=box(scene,"brook-rounded-bank-stone",[mid.x,.16,mid.z],[len+.30,.30,.46],i%4?brookStone:brookEdge);
      stone.rotation.y=Math.atan2(dz,dx);
    }
  }
  // Broad floodplains: gravel shelves, sandy shallows and grassy banks.
  const brookGravel=mat(scene,"brook-floodplain-gravel",new Color3(.53,.49,.39),.98);
  const brookSand=mat(scene,"brook-shallow-sand",new Color3(.66,.59,.43),.96);
  const brookGrass=mat(scene,"brook-meadow-grass",new Color3(.24,.34,.20),.98);
  const brookReed=mat(scene,"brook-reed-leaf",new Color3(.23,.36,.17),.9);
  const floodLeft=[],floodRight=[];
  for(let i=0;i<brookPoints.length;i++) {
    const tangent=brookPoints[Math.min(i+1,brookPoints.length-1)].subtract(brookPoints[Math.max(0,i-1)]).normalize();
    const normal=new Vector3(-tangent.z,0,tangent.x);
    floodLeft.push(brookPoints[i].add(normal.scale(8.2)));
    floodRight.push(brookPoints[i].subtract(normal.scale(8.2)));
  }
  // The water is about 6.5m wide; the outer ribbons blend into shallow gravel shelves.
  const leftFloodplain=MeshBuilder.CreateRibbon("brook-left-floodplain",{pathArray:[brookLeft,floodLeft],sideOrientation:2},scene);
  leftFloodplain.material=brookGravel;leftFloodplain.isPickable=false;
  const rightFloodplain=MeshBuilder.CreateRibbon("brook-right-floodplain",{pathArray:[brookRight,floodRight],sideOrientation:2},scene);
  rightFloodplain.material=brookSand;rightFloodplain.isPickable=false;
  for(const [x,z,side] of [[-11,-39,1],[-3,-32,-1],[16,-40,1],[25,-31,-1],[39,-40,1],[55,-38,-1],[73,-48,1],[88,-37,-1],[101,-25,1],[105,-5,-1]]) {
    for(let j=0;j<4;j++) {
      const reed=MeshBuilder.CreateCylinder("brook-reed",{diameterTop:.025,diameterBottom:.055,height:1.0+(j%2)*.45,tessellation:5},scene);
      reed.position.set(x+(j-1.5)*.18,.5,z+side*.22);reed.rotation.z=(j-1.5)*.12;reed.material=brookReed;
    }
    const pebble=MeshBuilder.CreateSphere("brook-floodplain-pebble",{diameter:.65,segments:10},scene);
    pebble.position.set(x+.8,.18,z+side*.8);pebble.scaling.set(1.25,.38,.8);pebble.material=brookEdge;
  }
  for(const [x,z] of [[-8,-43],[2,-30],[19,-42],[33,-30],[48,-41],[63,-47],[80,-37],[94,-31],[105,-14]]) {
    const grass=MeshBuilder.CreateGround("brook-meadow-bank-patch",{width:4.6,height:3.2,subdivisions:1},scene);
    grass.position.set(x,.028,z);grass.material=brookGrass;
  }

  // The great stone bridge is a true segmental arch: its roadway rises smoothly
  // toward the crown and descends to both abutments, rather than sitting flat.
  const bridgeX=0,bridgeZ=-47,bridgeHalf=5.0,bridgeSegments=28,bridgeRise=1.55;
  const bridgeSurface=(z)=>.72+bridgeRise*(1-Math.pow((z-bridgeZ)/bridgeHalf,2));
  // Raise the moving coach onto the arched roadway, with gentle ramps at both ends.
  const carriageRoadHeight=(z)=>{
    const smooth=t=>{const v=Math.max(0,Math.min(1,t));return v*v*(3-2*v);};
    if(z<=bridgeZ-bridgeHalf-3||z>=bridgeZ+bridgeHalf+3)return 0;
    if(z<bridgeZ-bridgeHalf)return .72*smooth((z-(bridgeZ-bridgeHalf-3))/3);
    if(z>bridgeZ+bridgeHalf)return .72*(1-smooth((z-(bridgeZ+bridgeHalf))/3));
    return bridgeSurface(z);
  };
  for(let i=0;i<bridgeSegments;i++) {
    const z0=bridgeZ-bridgeHalf+i*(2*bridgeHalf/bridgeSegments);
    const z1=z0+2*bridgeHalf/bridgeSegments;
    const mid=(z0+z1)/2, slope=(bridgeSurface(z1)-bridgeSurface(z0))/(z1-z0);
    const deck=box(scene,"great-stone-bridge-arched-deck",[bridgeX,bridgeSurface(mid)-.25,mid],[6.1,.5,(z1-z0)+.035],brookEdge);
    deck.rotation.x=-Math.atan(slope);deck.receiveShadows=true;
    const road=box(scene,"great-stone-bridge-arched-roadway",[bridgeX,bridgeSurface(mid)+.025,mid],[5.55,.07,(z1-z0)+.035],brookStone);
    road.rotation.x=-Math.atan(slope);
  }
  for(const side of [-1,1]) {
    const archPath=[];
    for(let i=0;i<=28;i++) {
      const z=bridgeZ-bridgeHalf+i*(2*bridgeHalf/28);
      const u=(z-bridgeZ)/bridgeHalf;
      archPath.push(new Vector3(bridgeX+side*2.62,.20+.95*Math.sqrt(Math.max(0,1-u*u)),z));
    }
    const arch=MeshBuilder.CreateTube("great-stone-bridge-true-arch",{path:archPath,radius:.34,tessellation:14},scene);
    arch.material=brookStone;
    for(let i=0;i<20;i++) {
      const z=bridgeZ-bridgeHalf+.25+i*.5,u=(z-bridgeZ)/bridgeHalf;
      const archTop=.20+.95*Math.sqrt(Math.max(0,1-u*u))+.22;
      const deckBottom=bridgeSurface(z)-.25;
      const h=Math.max(.12,deckBottom-archTop);
      const spandrel=box(scene,"great-stone-bridge-spandrel",[bridgeX+side*2.62,(archTop+deckBottom)/2,z],[.48,h,.53],brookStone);
      spandrel.receiveShadows=true;
    }
    for(let i=0;i<=10;i++) {
      const z=bridgeZ-bridgeHalf+i;
      const y=bridgeSurface(z);
      box(scene,"great-stone-bridge-parapet",[bridgeX+side*3.02,y+.63,z],[.38,1.18,1.02],brookStone);
      box(scene,"great-stone-bridge-capstone",[bridgeX+side*3.02,y+1.25,z],[.52,.16,1.05],brookEdge);
    }
  }
  // A smaller timber footbridge also receives a gentle arched camber.
  const sx=68,sz=-43,smallHalf=4.35,smallRise=.58,smallSegments=14;
  const smallSurface=(z)=>.52+smallRise*(1-Math.pow((z-sz)/smallHalf,2));
  for(let i=0;i<smallSegments;i++) {
    const z0=sz-smallHalf+i*(2*smallHalf/smallSegments),z1=z0+2*smallHalf/smallSegments;
    const mid=(z0+z1)/2,slope=(smallSurface(z1)-smallSurface(z0))/(z1-z0);
    const plank=box(scene,"east-footbridge-arched-plank",[sx,smallSurface(mid),mid],[4.6,.22,(z1-z0)+.04],mats.woodLight);
    plank.rotation.x=-Math.atan(slope);
  }
  for(const side of [-1,1]) {
    for(let i=0;i<=8;i++) {
      const z=sz-smallHalf+i*(2*smallHalf/8),y=smallSurface(z);
      box(scene,"east-footbridge-arched-railing",[sx+side*2.18,y+.48,z],[.16,.16,1.1],brookEdge);
      box(scene,"east-footbridge-arched-post",[sx+side*2.18,y+.23,z],[.20,.58,.20],brookStone);
    }
  }
  for(const [x,z] of [[-11,-38],[-7,-35.8],[15,-34.9],[28,-34.9],[43,-36],[56,-43.9],[74,-43.9],[87,-30],[102,-22],[107,-3]]){const p=MeshBuilder.CreateCylinder("brookside-stepping-stone",{diameter:1,height:.18,tessellation:8},scene);p.position.set(x,.16,z);p.scaling.z=.72;p.material=brookEdge;}


  // Yield between major districts so mobile Safari can service the page.
  await new Promise(resolve=>setTimeout(resolve,0));
  // Imperial public baths: a Roman thermae and a warm, intimate hammam.
  // Set behind the initial arrival point, on the western side of the royal approach.
  const hammamMeshStart=scene.meshes.length;
  const hammamObstacleStart=obstacles.length,hammamColliderIndex=colliders.length;
  const hammamX=-92,hammamZ=-58,hammamFront=-41,hammamBack=-75;
  // A low-key stone palette lets local lanterns and skylight shape the room.
  const hammamStone=texturedMat(scene,"imperial-hammam-pale-travertine",new Color3(.49,.47,.42),"#a69a83","#5b5144",.88);
  const hammamIvory=mat(scene,"imperial-hammam-ivory-marble",new Color3(.69,.65,.56),.32,.08);
  const hammamGold=mat(scene,"imperial-hammam-aged-bronze",new Color3(.39,.28,.15),.34,.68);
  const hammamTile=texturedMat(scene,"imperial-hammam-blue-mosaic",new Color3(.11,.25,.28),"#24575a","#a88b59",.32);
  const hammamShadow=mat(scene,"imperial-hammam-recess",new Color3(.19,.22,.20),.94);
  const hammamWater=mat(scene,"imperial-hammam-thermal-water",new Color3(.22,.57,.61),.16,.18);
  hammamWater.alpha=.78;
  hammamWater.emissiveColor=new Color3(.035,.12,.13);
  const hammamGlow=mat(scene,"imperial-hammam-lantern-glow",new Color3(1,.69,.34),.22,0);
  hammamGlow.emissiveColor=new Color3(.95,.39,.12);
  const hammamWood=mat(scene,"imperial-hammam-walnut",new Color3(.24,.12,.065),.72);
  const hammamGreen=mat(scene,"imperial-hammam-courtyard-green",new Color3(.16,.31,.19),.96);
  const hammamFlower=mat(scene,"imperial-hammam-courtyard-flowers",new Color3(.82,.36,.47),.72);

  // A broad stone approach and planted forecourt lead from the town toward the baths.
  const hammamApproach=MeshBuilder.CreateGround("imperial-hammam-approach",{width:7.2,height:17,subdivisions:1},scene);
  hammamApproach.position.set(hammamX,-.035,-32.0);hammamApproach.material=hammamStone;
  box(scene,"imperial-hammam-entry-step",[hammamX,.18,-40.2],[11.2,.36,2.0],hammamIvory);
  box(scene,"imperial-hammam-entry-step-upper",[hammamX,.38,-41.6],[8.4,.30,1.1],hammamStone);
  for(const side of [-1,1]) {
    const planterX=hammamX+side*7.2;
    box(scene,"imperial-hammam-forecourt-planter",[planterX,.42,-35.2],[2.5,.78,4.0],hammamIvory);
    box(scene,"imperial-hammam-forecourt-soil",[planterX,.84,-35.2],[2.15,.08,3.6],hammamGreen);
    for(let n=0;n<7;n++) {
      const px=planterX+(n%3-1)*.55,pz=-36.2+Math.floor(n/3)*.88;
      cylinder(scene,"imperial-hammam-forecourt-shrub",[px,1.25+(n%2)*.12,pz],.72,.95,hammamGreen,12);
      addPetalBloom(scene,"imperial-hammam-forecourt-bloom",new Vector3(px,1.78,pz),.23,hammamFlower,7);
    }
    cylinder(scene,"imperial-hammam-forecourt-column",[hammamX+side*5.0,3.2,-40.4],.72,6.0,hammamStone,20);
    cylinder(scene,"imperial-hammam-forecourt-capital",[hammamX+side*5.0,6.25,-40.4],1.08,.42,hammamIvory,20);
    addLantern(scene,hammamX+side*5.0,5.0,-40.0,hammamGold,hammamGlow);
  }

  // Main building footprint: walkable interior, with solid perimeter walls and a central doorway.
  box(scene,"imperial-hammam-marble-floor",[hammamX,.12,hammamZ],[35.2,.42,33.2],hammamIvory);
  box(scene,"imperial-hammam-floor-mosaic-field",[hammamX,.345,hammamZ],[28.4,.045,26.6],hammamTile);
  box(scene,"imperial-hammam-floor-mosaic-center",[hammamX,.38,hammamZ],[13.2,.035,13.2],hammamIvory);
  const hammamFloorRosette=MeshBuilder.CreateTorus("imperial-hammam-floor-rosette",{diameter:10.8,thickness:.16,tessellation:64},scene);
  hammamFloorRosette.position.set(hammamX,.415,hammamZ);hammamFloorRosette.material=hammamGold;
  const hammamFloorInner=MeshBuilder.CreateTorus("imperial-hammam-floor-inner-ring",{diameter:7.8,thickness:.09,tessellation:64},scene);
  hammamFloorInner.position.set(hammamX,.42,hammamZ);hammamFloorInner.material=hammamIvory;

  const hammamWallY=11.0,hammamWallH=21.8;
  box(scene,"imperial-hammam-west-wall",[hammamX-17.25,hammamWallY,hammamZ],[.85,hammamWallH,34.0],hammamStone);
  box(scene,"imperial-hammam-east-wall",[hammamX+17.25,hammamWallY,hammamZ],[.85,hammamWallH,34.0],hammamStone);
  box(scene,"imperial-hammam-rear-wall",[hammamX,hammamWallY,hammamBack+.45],[35.0,hammamWallH,.9],hammamStone);
  const hammamDoorWidth=6.4;
  for(const [a,b] of [[-17.5,-hammamDoorWidth/2-.4],[hammamDoorWidth/2+.4,17.5]]) {
    const width=b-a;
    box(scene,"imperial-hammam-front-wall",[hammamX+(a+b)/2,hammamWallY,hammamFront],[width,hammamWallH,.9],hammamStone);
  }
  box(scene,"imperial-hammam-front-lintel",[hammamX,6.55,hammamFront],[7.1,1.0,1.0],hammamIvory);
  // Close the upper entrance wall so the bath interior is not exposed above the door.
  box(scene,"imperial-hammam-front-upper-wall",[hammamX,14.65,hammamFront],[7.15,14.2,.95],hammamStone);
  box(scene,"imperial-hammam-front-upper-panel",[hammamX,17.2,hammamFront-.53],[5.6,3.1,.18],hammamIvory);
  const bathFrontOculus=MeshBuilder.CreateTorus("imperial-hammam-front-oculus-frame",{diameter:2.35,thickness:.16,tessellation:40},scene);
  bathFrontOculus.position.set(hammamX,17.2,hammamFront-.66);bathFrontOculus.rotation.x=Math.PI/2;bathFrontOculus.material=hammamGold;
  const bathFrontGrille=MeshBuilder.CreateCylinder("imperial-hammam-front-oculus-grille",{diameter:1.92,height:.10,tessellation:12},scene);
  bathFrontGrille.position.set(hammamX,17.2,hammamFront-.68);bathFrontGrille.rotation.x=Math.PI/2;bathFrontGrille.material=hammamTile;
  // A continuous ceiling closes the bath hall; only the central dome remains glazed.
  // Four plastered ceiling panels meet the glass dome without covering its opening.
  const hammamCeiling=mat(scene,"imperial-hammam-ceiling-plaster",new Color3(.34,.33,.29),.96);
  box(scene,"imperial-hammam-ceiling-north",[hammamX,11.92,hammamZ-13.65],[35.2,.62,5.7],hammamCeiling);
  box(scene,"imperial-hammam-ceiling-south",[hammamX,11.92,hammamZ+13.65],[35.2,.62,5.7],hammamCeiling);
  box(scene,"imperial-hammam-ceiling-west",[hammamX-14.45,11.92,hammamZ],[6.3,.62,22.0],hammamCeiling);
  box(scene,"imperial-hammam-ceiling-east",[hammamX+14.45,11.92,hammamZ],[6.3,.62,22.0],hammamCeiling);

  // The central vaulted roof is glazed, with slender bronze ribs and a small oculus.
  const hammamGlass=new StandardMaterial("imperial-hammam-central-glass",scene);
  hammamGlass.diffuseColor=new Color3(.30,.48,.57);
  hammamGlass.emissiveColor=new Color3(.035,.065,.08);
  hammamGlass.specularColor=new Color3(.82,.90,.96);
  hammamGlass.specularPower=96;
  hammamGlass.alpha=.30;
  hammamGlass.backFaceCulling=false;
  const hammamDome=MeshBuilder.CreateSphere("imperial-hammam-great-glass-dome",{diameter:23,segments:48,slice:.5},scene);
  hammamDome.position.set(hammamX,12.25,hammamZ);hammamDome.scaling.y=.78;hammamDome.material=hammamGlass;
  const hammamDomeRim=MeshBuilder.CreateTorus("imperial-hammam-great-dome-rim",{diameter:22.7,thickness:.42,tessellation:80},scene);
  hammamDomeRim.position.set(hammamX,12.22,hammamZ);hammamDomeRim.material=hammamGold;
  for(let rib=0;rib<12;rib++) {
    const a=rib*Math.PI/6,points=[];
    for(let step=0;step<=20;step++) {
      const t=(Math.PI/2)*step/20,r=11.42*Math.cos(t);
      points.push(new Vector3(hammamX+Math.cos(a)*r,12.25+8.92*Math.sin(t),hammamZ+Math.sin(a)*r));
    }
    const strut=MeshBuilder.CreateTube("imperial-hammam-glass-dome-bronze-rib",{path:points,radius:.045,tessellation:8},scene);
    strut.material=hammamGold;
  }
  const hammamOculus=MeshBuilder.CreateCylinder("imperial-hammam-dome-oculus",{diameter:4.1,height:.18,tessellation:48},scene);
  hammamOculus.position.set(hammamX,21.12,hammamZ);hammamOculus.material=hammamGlass;
  const hammamOculusRing=MeshBuilder.CreateTorus("imperial-hammam-oculus-bronze-ring",{diameter:4.35,thickness:.16,tessellation:48},scene);
  hammamOculusRing.position.set(hammamX,21.18,hammamZ);hammamOculusRing.material=hammamGold;
  addAntiqueDoor(scene,"imperial-hammam-entry-double-door",hammamX,.48,hammamFront,hammamDoorWidth,6.0,mats,0);

  // A large heated central pool with submerged steps, carved coping and turquoise water.
  const hammamPoolX=hammamX,hammamPoolZ=-59.2;
  box(scene,"imperial-hammam-great-pool-basin",[hammamPoolX,.48,hammamPoolZ],[12.8,.68,8.8],hammamShadow);
  box(scene,"imperial-hammam-great-pool-water",[hammamPoolX,.88,hammamPoolZ],[11.7,.08,7.7],hammamWater);
  for(const side of [-1,1]) {
    box(scene,"imperial-hammam-great-pool-long-coping",[hammamPoolX+side*6.55,.88,hammamPoolZ],[.62,.48,9.1],hammamIvory);
    box(scene,"imperial-hammam-great-pool-short-coping",[hammamPoolX,.88,hammamPoolZ+side*4.45],[13.7,.48,.62],hammamIvory);
    box(scene,"imperial-hammam-great-pool-gold-inlay",[hammamPoolX+side*6.55,1.13,hammamPoolZ],[.10,.08,8.65],hammamGold);
  }
  for(let step=0;step<4;step++) {
    box(scene,"imperial-hammam-pool-entry-step",[hammamPoolX, .42+step*.14, hammamPoolZ+5.15-step*.48],[3.3,.28,.68],hammamIvory);
  }
  for(const side of [-1,1]) {
    const smallX=hammamX+side*12.0,smallZ=-61.0;
    box(scene,"imperial-hammam-plunge-basin",[smallX,.42,smallZ],[5.0,.62,7.6],hammamShadow);
    box(scene,"imperial-hammam-plunge-water",[smallX,.79,smallZ],[4.15,.06,6.75],hammamWater);
    for(const sx of [-1,1])box(scene,"imperial-hammam-plunge-rim",[smallX+sx*2.58,.82,smallZ],[.38,.36,7.95],hammamIvory);
    for(const sz of [-1,1])box(scene,"imperial-hammam-plunge-rim",[smallX,.82,smallZ+sz*3.82],[5.35,.36,.38],hammamIvory);
  }
  // Bath pools are intentionally walkable: visitors can descend the submerged steps.


  // Warm resting bays, massage benches, towel shelves and oil jars line the side aisles.
  for(const side of [-1,1]) {
    const bx=hammamX+side*13.0;
    for(const zz of [-69]) {
      box(scene,"imperial-hammam-rest-bench",[bx,.68,zz],[3.4,.42,1.05],hammamWood);
      box(scene,"imperial-hammam-rest-bench-cushion",[bx,1.0,zz-.04],[3.15,.18,.88],hammamTile);
      for(const dx of [-1.25,1.25])box(scene,"imperial-hammam-bench-leg",[bx+dx,.34,zz],[.18,.62,.85],hammamGold);
      for(let jar=0;jar<3;jar++) {
        const jx=bx+(jar-1)*.72;
        cylinder(scene,"imperial-hammam-oil-vessel",[jx,1.35,zz-.58],.34,.58,hammamGold,16);
        cylinder(scene,"imperial-hammam-oil-vessel-neck",[jx,1.68,zz-.58],.16,.16,hammamIvory,12);
      }
    }
  }
  for(let i=0;i<8;i++) {
    const zz=-70+i*3.7;
    box(scene,"imperial-hammam-towel-cubby",[hammamX-4.2,2.0,zz],[1.05,2.7,.85],hammamWood);
    for(let shelf=0;shelf<3;shelf++)box(scene,"imperial-hammam-folded-towels",[hammamX-4.2,1.2+shelf*.72,zz-.48],[.82,.22,.58],hammamIvory);
  }

  // Steam wisps, warm wall lamps and a small ablution fountain soften the atmosphere.
  const hammamSteam=mat(scene,"imperial-hammam-steam",new Color3(.88,.91,.88),.98);
  hammamSteam.alpha=.16;
  for(let i=0;i<10;i++) {
    const wisp=MeshBuilder.CreateSphere("imperial-hammam-steam-wisp",{diameter:1.2+(i%3)*.35,segments:12},scene);
    wisp.position.set(hammamX-3.8+(i%4)*2.4,2.0+(i%5)*.72,-62.8+Math.floor(i/4)*2.0);
    wisp.scaling.y=1.9;wisp.material=hammamSteam;
  }
  for(const side of [-1,1]) for(const zz of [-70,-61,-52,-44]) {
    const lampX=hammamX+side*16.45;
    box(scene,"imperial-hammam-wall-lamp-bracket",[lampX,7.2,zz],[.22,.18,.65],hammamGold);
    const lamp=MeshBuilder.CreateSphere("imperial-hammam-wall-lamp",{diameter:.52,segments:12},scene);
    lamp.position.set(lampX,6.9,zz-.32);lamp.material=hammamGlow;
    const lampCage=MeshBuilder.CreateTorus("imperial-hammam-wall-lamp-cage",{diameter:.74,thickness:.055,tessellation:16},scene);
    lampCage.position.copyFrom(lamp.position);lampCage.rotation.x=Math.PI/2;lampCage.material=hammamGold;
  }
  const ablutionBasin=cylinder(scene,"imperial-hammam-ablution-basin",[hammamX,1.05,-46.8],3.2,.72,hammamIvory,48);
  cylinder(scene,"imperial-hammam-ablution-water",[hammamX,1.43,-46.8],2.55,.06,hammamWater,48);
  cylinder(scene,"imperial-hammam-ablution-pedestal",[hammamX,2.0,-46.8],.82,1.45,hammamGold,24);
  const ablutionJet=MeshBuilder.CreateTube("imperial-hammam-ablution-water-jet",{path:[new Vector3(hammamX,2.65,-46.8),new Vector3(hammamX,3.1,-46.8)],radius:.055,tessellation:8},scene);
  ablutionJet.material=hammamWater;
  obstacles.push({x:hammamX,z:-46.8,r:1.9});

  // A bilingual bronze plaque makes the public bath easy to recognize from the lane.
  const hammamSignTexture=new DynamicTexture("imperial-hammam-sign-texture",{width:1024,height:256},scene,false);
  const hammamSignCtx=hammamSignTexture.getContext();
  hammamSignCtx.fillStyle="#263c3b";hammamSignCtx.fillRect(0,0,1024,256);
  hammamSignCtx.strokeStyle="#c9a86b";hammamSignCtx.lineWidth=12;hammamSignCtx.strokeRect(12,12,1000,232);
  hammamSignCtx.fillStyle="#f0dfb7";hammamSignCtx.textAlign="center";hammamSignCtx.font="bold 72px Georgia";
  hammamSignCtx.fillText("THERMAE  •  HAMMAM",512,112);
  hammamSignCtx.font="42px sans-serif";hammamSignCtx.fillText("帝 国 浴 場",512,190);
  hammamSignTexture.update();
  const hammamSignMat=new StandardMaterial("imperial-hammam-sign-material",scene);
  hammamSignMat.diffuseTexture=hammamSignTexture;hammamSignMat.emissiveColor=new Color3(.12,.09,.045);
  const hammamSign=MeshBuilder.CreatePlane("imperial-hammam-sign",{width:8.4,height:2.1},scene);
  hammamSign.position.set(hammamX,10.15,hammamFront-.56);hammamSign.material=hammamSignMat;
  hammamSign.rotation.y=0;
  // Directional signs at the arrival square and along the western lane.
  const bathWayWood=mat(scene,"imperial-hammam-wayfinding-oak",new Color3(.22,.12,.065),.82);
  const bathWayBronze=mat(scene,"imperial-hammam-wayfinding-bronze",new Color3(.20,.31,.30),.42,.62);
  const makeBathWaySign=(x,z,label,subline)=>{
    for(const side of [-1,1]){const post=MeshBuilder.CreateCylinder("imperial-hammam-wayfinding-post",{diameter:.22,height:3.9,tessellation:12},scene);post.position.set(x+side*1.7,1.95,z);post.material=bathWayWood;}
    box(scene,"imperial-hammam-wayfinding-board",[x,3.0,z],[4.25,1.45,.24],bathWayWood);
    box(scene,"imperial-hammam-wayfinding-plaque",[x,3.0,z-.15],[3.95,1.18,.06],bathWayBronze);
    const tex=new DynamicTexture("imperial-hammam-wayfinding-texture",{width:900,height:260},scene,false),ctx=tex.getContext();
    ctx.fillStyle="#e8d6ad";ctx.textAlign="center";ctx.font="bold 82px sans-serif";ctx.fillText(label,450,112);
    ctx.font="38px Georgia";ctx.fillText(subline,450,190);tex.update();
    const tm=new StandardMaterial("imperial-hammam-wayfinding-text-material",scene);tm.diffuseTexture=tex;tm.emissiveColor=new Color3(.10,.08,.045);
    const face=MeshBuilder.CreatePlane("imperial-hammam-wayfinding-lettering",{width:3.7,height:1.02},scene);face.position.set(x,3.0,z-.20);face.material=tm;
    const cap=MeshBuilder.CreateBox("imperial-hammam-wayfinding-cap",{width:4.5,height:.16,depth:.38},scene);cap.position.set(x,3.82,z);cap.material=hammamGold;
  };



  // The entry remains accessible through a single central opening; the perimeter stays solid.
  colliders.push({minX:hammamX-17.5,maxX:hammamX+17.5,minZ:hammamBack-.5,maxZ:hammamFront+.5,doorX:hammamX,doorWidth:hammamDoorWidth,doorZ:hammamFront,interior:true,passThrough:false});
  const hammamStaticMeshes=scene.meshes.slice(hammamMeshStart).filter(mesh=>
    mesh.name.startsWith("imperial-hammam-")&&!mesh.name.includes("entry-double-door")&&!mesh.parent&&mesh.material
  );
  const hammamMaterialGroups=new Map();
  for(const mesh of hammamStaticMeshes) {
    if(!hammamMaterialGroups.has(mesh.material))hammamMaterialGroups.set(mesh.material,[]);
    hammamMaterialGroups.get(mesh.material).push(mesh);
  }
  for(const [material,parts] of hammamMaterialGroups) {
    if(parts.length<2)continue;
    const merged=Mesh.MergeMeshes(parts,true,true,undefined,false,false);
    if(merged){merged.name="imperial-hammam-static-detail-batch";merged.material=material;merged.isPickable=false;}
  }

  // Relocate the complete bath complex to the north side of the fountain district.
  // Move the finished meshes, door pivots, collision volumes and pool obstacles together.
  // Move the complete bath complex farther north, then rotate it so its grand
  // entrance faces south toward the Imperial Fountain Plaza.
  const bathShiftX=122,bathShiftZ=120,bathCenterX=30,bathCenterZ=62;
  const rotateBathPoint=(x,z)=>({
    x:2*bathCenterX-(x+bathShiftX),
    z:2*bathCenterZ-(z+bathShiftZ)
  });
  for(const mesh of scene.meshes.slice(hammamMeshStart)) {
    if(!mesh.parent&&!mesh.isDisposed()&&!mesh.name.includes("wayfinding")) {
      const p=rotateBathPoint(mesh.position.x,mesh.position.z);
      mesh.position.x=p.x;mesh.position.z=p.z;
      mesh.rotation.y+=Math.PI;
    }
  }
  // The hidden baths have no door: remove the old decorative double-door assembly.
  for(const door of scene.metadata?.doorLeaves||[]) {
    if(door.name==="imperial-hammam-entry-double-door") door.pivot.dispose(false,false);
  }
  if(scene.metadata?.doorLeaves) {
    scene.metadata.doorLeaves=scene.metadata.doorLeaves.filter(door=>door.name!=="imperial-hammam-entry-double-door");
  }
  for(const mesh of [...scene.meshes]) {
    if(mesh.name.includes("imperial-hammam-entry-double-door")) mesh.dispose(false,true);
  }
  for(const obstacle of obstacles.slice(hammamObstacleStart)) {
    const p=rotateBathPoint(obstacle.x,obstacle.z);
    obstacle.x=p.x;obstacle.z=p.z;
  }
  const bathCollider=colliders[hammamColliderIndex];
  if(bathCollider) {
    const minX=bathCollider.minX+bathShiftX,maxX=bathCollider.maxX+bathShiftX;
    const minZ=bathCollider.minZ+bathShiftZ,maxZ=bathCollider.maxZ+bathShiftZ;
    bathCollider.minX=2*bathCenterX-maxX;bathCollider.maxX=2*bathCenterX-minX;
    bathCollider.minZ=2*bathCenterZ-maxZ;bathCollider.maxZ=2*bathCenterZ-minZ;
    const door=rotateBathPoint(bathCollider.doorX,bathCollider.doorZ);
    bathCollider.doorX=door.x;bathCollider.doorZ=door.z;
  }

  // A concealed, doorless passage is cut into the rocky garden approach.
  // Its low vaulted ceiling, repeated stone ribs and warm wall lamps make the
  // transition from the public plaza feel like entering a private grotto.
  const tunnelX=30,tunnelStartZ=33.7,tunnelEndZ=46.15,tunnelMidZ=(tunnelStartZ+tunnelEndZ)/2;
  const tunnelStone=texturedMat(scene,"imperial-bath-grotto-stone",new Color3(.38,.37,.32),"#777365","#282a25",.98);
  const tunnelDark=mat(scene,"imperial-bath-grotto-shadow",new Color3(.075,.085,.078),.98);
  const tunnelMoss=mat(scene,"imperial-bath-grotto-moss",new Color3(.13,.22,.12),1);
  const tunnelBronze=mat(scene,"imperial-bath-grotto-bronze",new Color3(.39,.28,.16),.62,.48);
  // A narrow, low rock passage, intentionally more cave than corridor.
  box(scene,"imperial-bath-grotto-floor",[tunnelX,.10,tunnelMidZ],[5.0,.22,12.75],hammamStone);
  box(scene,"imperial-bath-grotto-floor-inlay",[tunnelX,.225,tunnelMidZ],[3.55,.025,12.2],hammamTile);
  for(const side of [-1,1]) {
    box(scene,"imperial-bath-grotto-sidewall",[tunnelX+side*2.52,1.95,tunnelMidZ],[.72,3.95,12.9],tunnelStone);
    box(scene,"imperial-bath-grotto-wall-foot",[tunnelX+side*2.18,.38,tunnelMidZ],[.22,.35,12.9],hammamGold);
    for(let lampIndex=0;lampIndex<3;lampIndex++) {
      const z=tunnelStartZ+1.7+lampIndex*3.7;
      box(scene,"imperial-bath-grotto-lamp-bracket",[tunnelX+side*2.20,2.45,z],[.34,.10,.12],tunnelBronze);
      const lamp=MeshBuilder.CreateSphere("imperial-bath-grotto-lantern",{diameter:.30,segments:12},scene);
      lamp.position.set(tunnelX+side*2.12,2.28,z);lamp.material=hammamGlow;
      const cage=MeshBuilder.CreateTorus("imperial-bath-grotto-lantern-cage",{diameter:.44,thickness:.04,tessellation:16},scene);
      cage.position.copyFrom(lamp.position);cage.rotation.x=Math.PI/2;cage.material=tunnelBronze;
    }
    for(let n=0;n<7;n++) obstacles.push({x:tunnelX+side*2.48,z:tunnelStartZ+.8+n*1.65,r:.42});
  }
  // A continuous curved rock vault seals the entire passage; the transverse ribs
  // remain visible beneath it as structural stone bands, so the sky cannot show through.
  const vaultPaths=[];
  for(let k=0;k<=32;k++) {
    const a=Math.PI-k*Math.PI/32,path=[];
    for(let step=0;step<=32;step++) {
      const z=tunnelStartZ-.35+(tunnelEndZ-tunnelStartZ+.7)*step/32;
      path.push(new Vector3(tunnelX+Math.cos(a)*2.42,1.95+Math.sin(a)*1.78,z));
    }
    vaultPaths.push(path);
  }
  const grottoVault=MeshBuilder.CreateRibbon("imperial-bath-grotto-continuous-rock-vault",{pathArray:vaultPaths,sideOrientation:Mesh.DOUBLESIDE},scene);
  grottoVault.material=tunnelStone;grottoVault.isPickable=false;
  for(let rib=0;rib<5;rib++) {
    const z=tunnelStartZ+.15+rib*2.85,points=[];
    for(let k=0;k<=24;k++) {
      const a=Math.PI-k*Math.PI/24;
      points.push(new Vector3(tunnelX+Math.cos(a)*2.42,1.95+Math.sin(a)*1.78,z));
    }
    const arch=MeshBuilder.CreateTube("imperial-bath-grotto-carved-vault-rib",{path:points,radius:.24,tessellation:12},scene);
    arch.material=tunnelStone;
    const keystone=MeshBuilder.CreateSphere("imperial-bath-grotto-keystone",{diameter:.32,segments:12},scene);
    keystone.position.set(tunnelX,3.83,z);keystone.scaling.y=.72;keystone.material=tunnelBronze;
  }
  // Stone shoulders overlap the bath entrance wall to hide the seam from outside.
  for(const side of [-1,1]) {
    box(scene,"imperial-bath-grotto-exit-jamb",[tunnelX+side*2.62,2.05,tunnelEndZ-.28],[.88,4.1,1.25],tunnelStone);
  }
  // Rough rock shoulders and trailing ivy partially conceal the passage from outside.
  for(const side of [-1,1]) {
    for(let n=0;n<4;n++) {
      const rock=MeshBuilder.CreateSphere("imperial-bath-grotto-entrance-rock",{diameter:1,segments:12},scene);
      rock.position.set(tunnelX+side*(2.75+n*.18),.78+n*.30,tunnelStartZ+.3+n*.72);
      rock.scaling.set(.95,.78,1.18);rock.material=tunnelStone;
    }
    for(let vine=0;vine<4;vine++) {
      const x=tunnelX+side*(3.95+vine*.22),z=tunnelStartZ+1.0+vine*1.7;
      const path=[new Vector3(x,5.6,z),new Vector3(x-side*.25,4.6,z+.35),new Vector3(x+side*.12,3.7,z+.72),new Vector3(x-side*.18,2.9,z+1.0)];
      const tendril=MeshBuilder.CreateTube("imperial-bath-grotto-hanging-ivy",{path,radius:.055,tessellation:7},scene);
      tendril.material=tunnelMoss;
      for(let leaf=0;leaf<5;leaf++) {
        const p=path[1+leaf%3].add(new Vector3(side*(leaf%2?.22:-.18),.05,leaf*.09));
        const blade=MeshBuilder.CreateSphere("imperial-bath-grotto-ivy-leaf",{diameter:.34,segments:10},scene);
        blade.position.copyFrom(p);blade.scaling.set(.45,.16,.9);blade.rotation.z=side*.42;blade.material=tunnelMoss;
      }
    }
  }
  const tunnelThreshold=MeshBuilder.CreateTorus("imperial-bath-grotto-threshold-carving",{diameter:4.9,thickness:.10,tessellation:48},scene);
  tunnelThreshold.position.set(tunnelX,.22,tunnelStartZ+.12);tunnelThreshold.scaling.z=.18;tunnelThreshold.material=tunnelBronze;

  // Optional bath effects are skipped before allocation on touch devices.
  // Disposing them after construction still creates a dangerous startup spike.
  const bathLanterns=[];
  const bathSteamPuffs=[];
  if(!isTouchDevice) {
  // Cool daylight spills through the oculus while warm lanterns create small
  // amber islands around the darker bath hall.
  const skylight=new PointLight("imperial-bath-oculus-daylight",new Vector3(30,18.5,62),scene);
  skylight.diffuse=new Color3(.68,.78,.86);skylight.specular=new Color3(.42,.52,.62);skylight.intensity=.30;skylight.range=23;
  for(const [x,z] of [[15.2,51],[44.8,51],[15.2,74],[44.8,74],[19,62],[41,62]]) {
    const fixture=MeshBuilder.CreateBox("imperial-bath-wall-lantern-bracket",{width:.52,height:.12,depth:.18},scene);
    fixture.position.set(x,4.1,z);fixture.material=hammamGold;
    const bowl=MeshBuilder.CreateCylinder("imperial-bath-wall-oil-lamp",{diameter:.34,height:.24,tessellation:16},scene);
    bowl.position.set(x,4.0,z);bowl.material=hammamGold;
    const flame=MeshBuilder.CreateSphere("imperial-bath-wall-lantern-flame",{diameter:.22,segments:12},scene);
    flame.position.set(x,4.22,z);flame.material=hammamGlow;
    const light=new PointLight("imperial-bath-warm-wall-light",new Vector3(x,4.15,z),scene);
    light.diffuse=new Color3(1,.58,.30);light.specular=new Color3(1,.72,.42);light.intensity=.30;light.range=10;
    bathLanterns.push({flame,light,phase:bathLanterns.length*.9});
  }
  const skylightShaft=MeshBuilder.CreateCylinder("imperial-bath-soft-skylight-shaft",{diameterTop:1.0,diameterBottom:3.8,height:13,tessellation:32},scene);
  skylightShaft.position.set(30,10.8,62);skylightShaft.material=mat(scene,"imperial-bath-soft-skylight-shaft-material",new Color3(.72,.82,.9),1);
  skylightShaft.material.alpha=.055;skylightShaft.material.disableLighting=true;skylightShaft.isPickable=false;

  // Layered steam rises from every pool and gathers beneath the warm vaulted ceiling.
  const bathSteamMaterial=mat(scene,"imperial-bath-living-steam",new Color3(.91,.94,.92),.98);
  bathSteamMaterial.alpha=.25;
  bathSteamMaterial.transparencyMode=2;
  // One shared high-detail sphere buffer for all steam wisps. Babylon instances
  // preserve every puff and its animation while avoiding 106 duplicate mesh
  // submissions/vertex-buffer allocations on mobile Safari.
  const bathSteamSource=MeshBuilder.CreateSphere("imperial-bath-steam-shared-geometry",{diameter:1,segments:14},scene);
  bathSteamSource.material=bathSteamMaterial;
  bathSteamSource.isVisible=false;
  bathSteamSource.isPickable=false;
  for(let i=0;i<34;i++) {
    const poolSide=i%3;
    const baseX=poolSide===0?30+(i%5-2)*1.55:poolSide===1?18+(i%3-1)*.72:42+(i%3-1)*.72;
    const baseZ=poolSide===0?62.8+Math.floor(i/5)*.72:61.0+Math.floor(i/9)*1.25;
    const puff=bathSteamSource.createInstance("imperial-bath-rising-steam");
    puff.position.set(baseX,.95+(i%6)*.43,baseZ);
    puff.scaling.set(.52+(i%4)*.13,1.35+(i%5)*.22,.52+(i%3)*.12);
    puff.material=bathSteamMaterial;puff.isPickable=false;
    bathSteamPuffs.push({mesh:puff,x:baseX,y:puff.position.y,z:baseZ,phase:i*.73,speed:.22+(i%4)*.035,drift:.35+(i%3)*.12});
  }
  for(let i=0;i<12;i++) {
    const x=17+(i%4)*8.35,z=52.8+Math.floor(i/4)*.95;
    const puff=bathSteamSource.createInstance("imperial-bath-treatment-steam");
    puff.position.set(x,1.35+(i%3)*.4,z);puff.scaling.set(.62,1.55,.62);
    puff.material=bathSteamMaterial;puff.isPickable=false;
    bathSteamPuffs.push({mesh:puff,x,y:puff.position.y,z,phase:i*1.13,speed:.19,drift:.28});
  }
  // Broader, overlapping steam banks create a visible humid atmosphere instead
  // of a few isolated puffs. Each billow has its own slow rise and lateral drift.
  for(let i=0;i<38;i++) {
    const pool=i%3;
    const x=pool===0?30+((i*7)%9-4)*.92:pool===1?18+((i*3)%5-2)*.48:42+((i*5)%5-2)*.48;
    const z=pool===0?59.8+((i*11)%13)*.62:61.0+((i*7)%11)*.82;
    const puff=bathSteamSource.createInstance("imperial-bath-dense-steam-bank");
    puff.position.set(x,1.2+(i%7)*.36,z);
    puff.scaling.set(.95+(i%4)*.18,1.7+(i%5)*.24,.82+(i%3)*.18);
    puff.material=bathSteamMaterial;puff.isPickable=false;
    bathSteamPuffs.push({mesh:puff,x,y:puff.position.y,z,phase:i*.51,speed:.15+(i%4)*.018,drift:.55+(i%3)*.13});
  }
  // Fine wisps rise from the waterline and dissolve into the dome's humid air.
  for(let i=0;i<22;i++) {
    const x=24+(i%9)*1.5,z=59.4+Math.floor(i/9)*7.2;
    const puff=bathSteamSource.createInstance("imperial-bath-fine-steam-wisp");
    puff.position.set(x,1.0+(i%4)*.25,z);puff.scaling.set(.24,.95,.24);
    puff.material=bathSteamMaterial;puff.isPickable=false;
    bathSteamPuffs.push({mesh:puff,x,y:puff.position.y,z,phase:i*.87,speed:.24,drift:.22});
  }
  }
  makeBathWaySign(16,18,"帝国浴場　↗","THERMAE  •  HAMMAM");
  makeBathWaySign(25,31,"帝国浴場　↗","PUBLIC BATHS");

  // Yield between major districts so mobile Safari can service the page.
  await new Promise(resolve=>setTimeout(resolve,0));
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
  const hostessSatin=mat(scene,"velvet-rose-hostess-satin",new Color3(.31,.012,.055),.38,.32);
  const hostessGold=mat(scene,"velvet-rose-hostess-gold",new Color3(.82,.57,.22),.3,.65);
  const hostessPearl=mat(scene,"velvet-rose-hostess-pearl",new Color3(.92,.78,.62),.32,.5);
  const npcWhite=mat(scene,"npc-eye-white",new Color3(.88,.83,.72),.8);
  const npcDark=mat(scene,"npc-eye-dark",new Color3(.075,.045,.03),.8);
  const npcBeard=mat(scene,"npc-beard",new Color3(.20,.095,.045),.96);
  const bathTowel=mat(scene,"imperial-bath-linen",new Color3(.88,.82,.68),.98);
  const bathClothBlue=mat(scene,"imperial-bath-blue-linen",new Color3(.20,.36,.39),.96);
  const bathSkin=mat(scene,"imperial-bath-skin",new Color3(.70,.48,.35),.96);
  const bathHair=mat(scene,"imperial-bath-hair",new Color3(.12,.075,.05),.96);
  const bathActors=[];
  // Reuse identical high-resolution primitive geometry for every resident.
  // Each actor still gets its own mesh, transform and material; only the immutable
  // vertex/index buffers are shared. This avoids allocating hundreds of duplicate
  // sphere/cylinder buffers during iPhone Safari startup without lowering detail.
  const actorGeometryTemplates=new Map();
  function sharedActorPrimitive(name,kind,segments) {
    const key=kind+":"+segments;
    let template=actorGeometryTemplates.get(key);
    if(!template) {
      if(kind==="sphere") template=MeshBuilder.CreateSphere("shared-actor-geometry-"+key,{diameter:1,segments},scene);
      else if(kind==="cylinder") template=MeshBuilder.CreateCylinder("shared-actor-geometry-"+key,{diameter:1,height:1,tessellation:segments},scene);
      else template=MeshBuilder.CreateBox("shared-actor-geometry-"+key,{size:1},scene);
      template.isVisible=false;
      template.isPickable=false;
      template.setEnabled(false);
      actorGeometryTemplates.set(key,template);
    }
    const mesh=template.clone(name);
    mesh.isVisible=true;
    mesh.setEnabled(true);
    mesh.isPickable=false;
    return mesh;
  }
  const bathActorSegments=isTouchDevice?48:72;
  function makeBathGuest(x,y,z,pose="soaking",heading=0,phase=0) {
    const root=new TransformNode("imperial-bath-guest",scene);
    root.position.set(x,y,z);root.rotation.y=heading;
    const part=(name,pos,scale,material,kind="sphere")=>{
      // Bath guests are viewed at close range, so use a much finer mesh than
      // distant town NPCs: smooth silhouettes on faces, shoulders and limbs.
      const mesh=sharedActorPrimitive(name,kind==="cylinder"?"cylinder":"sphere",kind==="cylinder"?48:bathActorSegments);
      mesh.parent=root;mesh.position.set(...pos);mesh.scaling.set(...scale);mesh.material=material;mesh.isPickable=false;return mesh;
    };
    const workingArms=[];
    if(pose==="soaking") {
      part("bath-guest-submerged-body",[0,.16,0],[.78,.72,.43],phase%2?bathClothBlue:bathTowel);
      part("bath-guest-shoulders",[0,.54,-.015],[.72,.34,.42],bathSkin);
      part("bath-guest-neck",[0,.76,-.035],[.18,.25,.18],bathSkin,"cylinder");
      part("bath-guest-head",[0,.99,-.055],[.36,.43,.34],bathSkin);
      part("bath-guest-wet-hair",[0,1.17,-.01],[.39,.19,.36],bathHair);
      for(const side of [-1,1])part("bath-guest-resting-arm",[side*.48,.43,.08],[.19,.20,.62],bathSkin);
    } else if(pose==="scrubbed") {
      part("bath-treatment-reclining-body",[0,.48,0],[.72,.48,1.22],bathTowel);
      part("bath-treatment-reclining-shoulder",[0,.69,-.58],[.62,.30,.48],bathSkin);
      part("bath-treatment-reclining-head",[0,.88,-.92],[.34,.40,.34],bathSkin);
      part("bath-treatment-reclining-hair",[0,1.04,-.91],[.38,.18,.36],bathHair);
      for(const side of [-1,1])part("bath-treatment-resting-arm",[side*.37,.56,-.22],[.16,.18,.70],bathSkin);
    } else {
      part("bath-attendant-tunic",[0,.76,.05],[.52,.72,.38],bathClothBlue);
      part("bath-attendant-head",[0,1.28,-.02],[.34,.39,.32],bathSkin);
      part("bath-attendant-hair",[0,1.45,.02],[.37,.18,.34],bathHair);
      for(const side of [-1,1]) {
        part("bath-attendant-kneeling-leg",[side*.20,.22,.34],[.25,.30,.58],bathTowel);
        const arm=part("bath-attendant-working-arm",[side*.28,.78,-.40],[.15,.18,.72],bathSkin);
        arm.rotation.x=-.30;workingArms.push({mesh:arm,side});
        part("bath-attendant-hand",[side*.28,.73,-.72],[.16,.13,.18],bathSkin);
      }
    }
    bathActors.push({root,baseY:y,phase,pose,workingArms});
    return root;
  }

  function makeTownsperson(x,z,role="villager",phase=0,heading=0,walking=false,pose="standing") {
    const root=new TransformNode("townsperson-root",scene);
    const inPublicLibrary=x>-65&&x<-39&&z>-97&&z<-71;
    // Gallery deck is y=5.39; 6.97 is visitor eye height, not floor height.
    const baseY=inPublicLibrary?(z<-92?5.39:.96):(z<-70?8.62:0);
    root.position.set(x,baseY,z);root.rotation.y=heading;
    const outfit=role==="guard"?npcCloth[0]:role==="merchant"||role==="butler"?npcCloth[3]:role==="maid"?npcCloth[5]:role==="hostess"?npcCloth[Math.abs(Math.floor(phase*7))%npcCloth.length]:npcCloth[Math.abs(Math.floor(phase*3))%npcCloth.length];
    const skin=phase%2?npcSkin:npcSkinLight;
    const hair=npcHair[Math.abs(Math.floor(phase*5))%npcHair.length];
    const part=(name,pos,size,material,kind="box")=>{
      const mesh=sharedActorPrimitive(name,kind==="sphere"?"sphere":kind==="cylinder"?"cylinder":"box",kind==="sphere"?(isTouchDevice?24:48):kind==="cylinder"?(isTouchDevice?24:56):1);
      mesh.position.set(pos[0],pos[1],pos[2]);mesh.scaling.set(size[0],size[1],size[2]);
      mesh.material=material;mesh.parent=root;mesh.isPickable=false;return mesh;
    };
    // Seated readers have folded thighs, hanging lower legs and arms reaching
    // naturally toward the desk; other residents keep the original standing pose.
    const seatedPose=pose==="seated";
    for(const side of [-1,1]) {
      if(seatedPose) {
        part("npc-boot",[side*.115,.105,-.52],[.22,.18,.32],npcLeather);
        part("npc-trouser",[side*.115,.49,-.20],[.205,.28,.30],npcLeather,"sphere");
        part("npc-knee",[side*.115,.37,-.42],[.19,.20,.22],outfit,"sphere");
        const sleeve=part("npc-sleeve",[side*.34,1.10,-.10],[.19,.43,.20],outfit,"sphere");
        sleeve.rotation.x=-.62;
        part("npc-hand",[side*.30,.83,-.39],[.13,.16,.13],skin,"sphere");
      } else {
        part("npc-boot",[side*.115,.105,.035],[.22,.20,.37],npcLeather);
        part("npc-trouser",[side*.115,.49,0],[.205,.69,.23],npcLeather,"sphere");
        part("npc-knee",[side*.115,.69,0],[.205,.22,.23],outfit,"sphere");
        if(pose==="beckoning"&&role==="hostess"&&side===1) {
          // A raised arm, softly bent wrist and curled fingers visibly beckon visitors.
          const raisedSleeve=part("velvet-rose-welcoming-sleeve",[.43,1.43,-.015],[.19,.49,.20],outfit,"sphere");
          raisedSleeve.rotation.z=-.72;
          const raisedHand=part("velvet-rose-welcoming-hand",[.70,1.70,-.075],[.14,.17,.13],skin,"sphere");
          raisedHand.rotation.z=-.38;
          for(let finger=0;finger<3;finger++) {
            const digit=part("velvet-rose-welcoming-finger",[.77+finger*.045,1.78-finger*.035,-.10],[.045,.13,.045],skin,"sphere");
            digit.rotation.z=-.38-finger*.10;
          }
          part("velvet-rose-wrist-bangle",[.61,1.61,-.06],[.22,.055,.22],npcGold,"cylinder");
        } else {
          part("npc-sleeve",[side*.34,1.23,0],[.19,.52,.20],outfit,"sphere");
          part("npc-hand",[side*.35,.91,.015],[.13,.16,.13],skin,"sphere");
        }
      }
      if(role==="guard") {
        part("npc-shoulder-plate",[side*.34,seatedPose?1.34:1.48,0],[.29,.18,.28],npcMetal,"sphere");
        part("npc-bracer",[side*.35,seatedPose?.92:1.03,-.12],[.22,.22,.22],npcMetal);
      }
    }
    part("npc-hips",[0,seatedPose?.48:.86,0],[.43,.25,.28],npcLeather,"sphere");
    part("npc-tunic",[0,seatedPose?.98:1.23,0],[.58,.70,.34],outfit,"sphere");
    part("npc-tunic-hem",[0,seatedPose?.63:.91,0],[.59,.12,.35],outfit);
    if(role==="hostess"){
      part("hostess-skirt",[0,.91,0],[.62,.62,.42],hostessSatin,"sphere");
      part("hostess-bodice",[0,1.32,-.015],[.43,.44,.36],hostessSatin,"sphere");
      // A glamorous, fully clothed corseted evening dress with a draped neckline.
      part("hostess-corset-waist",[0,1.16,-.205],[.40,.42,.075],hostessSatin);
      part("hostess-neckline",[0,1.52,-.16],[.47,.12,.13],hostessGold,"sphere");
      part("hostess-neckline-left",[-.20,1.48,-.14],[.13,.17,.12],hostessSatin,"sphere");
      part("hostess-neckline-right",[.20,1.48,-.14],[.13,.17,.12],hostessSatin,"sphere");
      part("hostess-gold-waistband",[0,1.01,-.225],[.57,.075,.045],hostessGold);
      for(let lace=0;lace<4;lace++) {
        part("hostess-corset-lacing",[0,1.37-lace*.09,-.252],[.025,.055,.018],hostessGold);
      }
      part("hostess-pearl-necklace",[0,1.56,-.205],[.19,.055,.035],hostessPearl,"sphere");
      part("hostess-earring-left",[-.19,1.68,-.04],[.055,.13,.055],hostessGold,"sphere");
      part("hostess-earring-right",[.19,1.68,-.04],[.055,.13,.055],hostessGold,"sphere");
      part("hostess-apron",[0,1.05,-.205],[.40,.48,.035],hostessSatin);
    }
    if(role==="maid"){part("palace-maid-long-apron",[0,1.05,-.205],[.43,.56,.045],npcWhite);part("palace-maid-collar",[0,1.55,-.17],[.34,.12,.10],npcWhite);part("palace-maid-cap",[0,2.06,-.01],[.38,.09,.32],npcWhite);part("palace-maid-hair-bun",[0,1.91,.18],[.22,.22,.22],hair,"sphere");}
    if(role==="butler"){part("palace-butler-waistcoat",[0,1.25,-.19],[.39,.48,.08],npcDark);part("palace-butler-shirt-front",[0,1.27,-.245],[.16,.42,.035],npcWhite);part("palace-butler-bowtie",[0,1.56,-.22],[.22,.10,.08],npcGold);for(let b=0;b<3;b++)part("palace-butler-button-"+b,[0,1.36-b*.12,-.29],[.045,.045,.025],npcGold,"sphere");}
    const upperShift=seatedPose?-.24:0;
    part("npc-belt",[0,seatedPose?.72:1.00,-.012],[.56,.085,.37],npcLeather);
    part("npc-belt-buckle",[0,seatedPose?.73:1.01,-.205],[.09,.10,.035],npcGold);
    part("npc-neck",[0,1.61+upperShift,0],[.14,.16,.14],skin,"cylinder");
    // Compact head with distinct hairline, ears, eyes and nose.
    part("npc-head",[0,1.78+upperShift,0],[.34,.39,.31],skin,"sphere");
    part("npc-ear-left",[-.175,1.78+upperShift,0],[.075,.12,.09],skin,"sphere");
    part("npc-ear-right",[.175,1.78+upperShift,0],[.075,.12,.09],skin,"sphere");
    part("npc-hair-cap",[0,1.94+upperShift,.005],[.365,.19,.34],hair,"sphere");
    part("npc-hair-back",[0,1.80+upperShift,.105],[.32,.28,.18],hair,"sphere");
    if(role==="hostess"){part("hostess-long-hair",[0,1.68,.20],[.29,.72,.17],hair,"sphere");part("hostess-hair-lock-left",[-.17,1.70,-.04],[.11,.48,.12],hair,"sphere");part("hostess-hair-lock-right",[.17,1.70,-.04],[.11,.48,.12],hair,"sphere");}
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
    } else if(role==="maid") {
      part("palace-maid-back-bow",[0,1.52,.22],[.34,.22,.10],npcWhite);
    } else if(role==="butler") {
      part("palace-butler-tailcoat",[0,1.22,.20],[.50,.68,.07],npcDark);
    } else {
      part("npc-cloak",[0,1.25,.19],[.49,.65,.06],npcCloth[(Math.floor(phase*7)+2)%npcCloth.length]);
    }
    if(phase%3===0) part("npc-beard",[0,(seatedPose?1.66-.24:1.66),-.12],[.20,.17,.12],npcBeard,"sphere");

    // Static residents are merged by material on every device: the detailed
    // silhouette stays intact while the renderer submits far fewer draw calls.
    {
      // Combine each resident's body parts by material. The original geometry,
      // proportions and materials remain unchanged; only draw calls are reduced.
      // Temporarily move the actor root to the origin so merged vertices stay local.
      const savedPosition=root.position.clone();
      const savedRotation=root.rotation.clone();
      root.position.set(0,0,0);
      root.rotation.set(0,0,0);
      root.computeWorldMatrix(true);
      const bodyGroups=new Map();
      for(const child of root.getChildMeshes(false)) {
        if(!child.geometry || !child.material) continue;
        const group=bodyGroups.get(child.material)||[];
        group.push(child);
        bodyGroups.set(child.material,group);
      }
      for(const [material,parts] of bodyGroups) {
        if(parts.length<2) continue;
        const combined=Mesh.MergeMeshes(parts,true,true,undefined,false,false);
        if(combined) {
          combined.name="npc-body-batched";
          combined.material=material;
          combined.parent=root;
          combined.isPickable=false;
          combined.receiveShadows=true;
        }
      }
      root.position.copyFrom(savedPosition);
      root.rotation.copyFrom(savedRotation);
      root.computeWorldMatrix(true);
  
    }

    if(walking) {
      const actor={root,walking:true,phase,home:new Vector3(x,0,z),radius:1.25+(phase%3)*.35};
      people.push(actor);return actor;
    }
    return root;
  }

  // Populate detailed residents after the first playable frame on touch devices.
  // This spreads GPU buffer uploads across frames instead of exhausting Safari at boot.
  const populateResidents=()=>{
  makeBathGuest(27.0,.88,61.0,"soaking",-.25,0);
  makeBathGuest(32.8,.88,64.5,"soaking",Math.PI+.25,1);
  makeBathGuest(29.8,.88,66.0,"soaking",Math.PI/2,2);
  makeBathGuest(25.8,.88,64.4,"soaking",-Math.PI/2,3);
  makeBathGuest(18.0,.79,60.5,"soaking",Math.PI/2,6);
  makeBathGuest(18.2,.79,63.1,"soaking",-Math.PI/2,7);
  makeBathGuest(42.0,.79,60.8,"soaking",Math.PI/2,8);
  makeBathGuest(43.0,.79,63.4,"soaking",-Math.PI/2,9);

  const treatmentStations=[18.0,26.0,34.0,42.0];
  for(let station=0;station<treatmentStations.length;station++) {
    const x=treatmentStations[station],z=52.8;
    box(scene,"imperial-bath-treatment-marble-bed",[x,.55,z],[1.72,.42,2.35],hammamIvory);
    box(scene,"imperial-bath-treatment-linen",[x,.79,z-.04],[1.48,.12,2.08],bathTowel);
    box(scene,"imperial-bath-treatment-headrest",[x,.91,z-.78],[.72,.16,.46],hammamTile);
    cylinder(scene,"imperial-bath-treatment-oil-bowl",[x-1.12,.72,z+.48],.38,.20,hammamGold,16);
    makeBathGuest(x-.05,.38,z,"scrubbed",Math.PI/2,12+station*2);
    // The attendant faces inward toward the guest on the treatment bed.
    makeBathGuest(x+1.28,.10,z+.08,"attendant",Math.PI/2,13+station*2);
  }

  // Palace attendants welcome visitors and keep the reception hall lived-in.
  makeTownsperson(-9.0,-126.0,"maid",21.1,-Math.PI/2,false);
  makeTownsperson(9.0,-126.0,"butler",22.4,Math.PI/2,false);
  makeTownsperson(-9.0,-139.0,"butler",23.7,-Math.PI/2,false);
  makeTownsperson(9.0,-139.0,"maid",24.8,Math.PI/2,false);

  // Guild staff and adventurers: visible inside the great hall, around the counter and tables.
  makeTownsperson(-23.0,-26.0,"merchant",25.2,Math.PI,false);
  makeTownsperson(-31.0,-18.0,"guard",26.4,Math.PI/2,false);
  makeTownsperson(-15.0,-18.5,"villager",27.6,-Math.PI/2,false);
  makeTownsperson(-27.5,-23.0,"villager",28.8,.2,false);

  // Two readers sit at the ground-floor study tables; the third resident
  // remains on the upper gallery among the books.
  makeTownsperson(-49.2,-90.55,"villager",29.1,Math.PI,false,"seated");
  makeTownsperson(-45.2,-87.45,"villager",30.2,0,false,"seated");
  makeTownsperson(-55.0,-93.0,"villager",31.3,Math.PI/2,false);


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
  makeTownsperson(-7.2,-114.1,"guard",14.9,0,false);
  makeTownsperson(7.2,-114.1,"guard",16.0,0,false);
  makeTownsperson(-11.4,-57.2,"guard",17.1,0,false);
  makeTownsperson(11.4,-57.2,"guard",18.2,0,false);
  // Ten stallkeepers, positioned behind their counters and facing the central lane.
  for(let row=0;row<marketStallRows.length;row++) {
    makeTownsperson(-6.65,marketStallRows[row],"merchant",30+row,-Math.PI/2,false);
    makeTownsperson(6.65,marketStallRows[row],"merchant",36+row,Math.PI/2,false);
  }
  // Children browsing the market; their smaller proportions distinguish them from adults.
  for(const [x,z,phase,heading] of [[-2.4,-16,41,.4],[2.2,-23,42,-.7],[-1.8,-34,43,.2]]) {
    const child=makeTownsperson(x,z,"villager",phase,heading,false);
    child.scaling.set(.72,.72,.72);
  }
  // A pair of friendly market dogs, with modeled muzzles, ears, collars and tails.
  const dogCoat=mat(scene,"market-dog-coat",new Color3(.62,.40,.22),.94);
  const dogCream=mat(scene,"market-dog-cream",new Color3(.88,.76,.57),.94);
  const dogNose=mat(scene,"market-dog-nose",new Color3(.055,.035,.025),.72);
  const dogEye=mat(scene,"market-dog-eye",new Color3(.045,.025,.015),.72);
  const dogCollar=mat(scene,"market-dog-collar",new Color3(.55,.10,.12),.62);
  function makeMarketDog(x,z,scale,heading) {
    const dog=new TransformNode("market-dog",scene);dog.position.set(x,.02,z);dog.rotation.y=heading;dog.scaling.setAll(scale);
    const part=(name,p,size,material)=>{
      const m=sharedActorPrimitive(name,"sphere",20);
      m.parent=dog;m.position.set(p[0],p[1],p[2]);m.scaling.set(size[0],size[1],size[2]);m.material=material;m.isPickable=false;return m;
    };
    part("market-dog-body",[0,.43,0],[.78,.48,.40],dogCoat);
    part("market-dog-chest",[0,.48,-.24],[.38,.48,.34],dogCream);
    part("market-dog-head",[0,.78,-.30],[.48,.48,.43],dogCoat);
    part("market-dog-muzzle",[0,.68,-.57],[.30,.22,.23],dogCream);
    part("market-dog-nose",[0,.72,-.69],[.12,.09,.08],dogNose);
    for(const side of [-1,1]) {
      part("market-dog-ear",[side*.19,.99,-.24],[.16,.30,.13],dogCoat);
      part("market-dog-eye",[side*.115,.83,-.49],[.055,.06,.035],dogEye);
      const leg=part("market-dog-leg",[side*.23,.19,side*.08],[.15,.40,.16],dogCoat);
      leg.rotation.z=side*.04;
    }
    part("market-dog-tail",[0,.65,.31],[.13,.40,.13],dogCoat).rotation.x=-.8;
    const collar=MeshBuilder.CreateTorus("market-dog-collar",{diameter:.38,thickness:.045,tessellation:20},scene);
    collar.parent=dog;collar.position.set(0,.70,-.30);collar.rotation.x=Math.PI/2;collar.material=dogCollar;
    return dog;
  }
  makeMarketDog(-2.6,-19.2,.88,-.35);
  makeMarketDog(2.9,-31.7,.76,.55);

  // Extra residents make the fountain square feel like a lived-in town.
  makeTownsperson(17,17,"merchant",17.1,Math.PI/2,false);
  makeTownsperson(21,-4,"villager",18.2,-.7,true);
  makeTownsperson(-9,-12,"villager",19.3,.5,true);
  makeTownsperson(2,8,"villager",20.4,Math.PI,false);
  // Staff: a guild receptionist, tavern server and welcoming adult hostesses.
  makeTownsperson(-20,-15.4,"hostess",21.2,Math.PI,false);
  makeTownsperson(-21,4.6,"hostess",22.4,Math.PI,false);
  makeTownsperson(52,5.2,"hostess",23.6,Math.PI,false);
  makeTownsperson(72,5.2,"hostess",24.8,Math.PI,false);
  // Inn guests sit and chat inside the taprooms; a server works near each bar.
  makeTownsperson(-25.2,4.0,"villager",65.1,Math.PI/2,false);
  makeTownsperson(-17.0,3.5,"merchant",66.2,-Math.PI/2,false);
  makeTownsperson(45.0,4.0,"villager",67.3,Math.PI,false);
  makeTownsperson(69.0,4.2,"merchant",68.4,Math.PI,false);
  // More adventurers gather around the guild tables and notice board.
  makeTownsperson(-18.0,-17.0,"guard",69.5,Math.PI/2,false);
  makeTownsperson(-29.0,-21.0,"villager",70.6,-Math.PI/2,false);
  // Adult hostess staff for the Velvet Rose, stationed throughout its lounge.
  makeTownsperson(86.0,-10.0,"hostess",26.1,Math.PI,false);
  makeTownsperson(96.0,-10.0,"hostess",27.3,Math.PI,false);
  makeTownsperson(86.0,-9.8,"hostess",28.5,Math.PI/2,false);
  makeTownsperson(96.0,-9.8,"hostess",29.7,-Math.PI/2,false);
  makeTownsperson(91.2,-10.2,"hostess",31.43,Math.PI,false,"beckoning");
  makeTownsperson(85.5,-11.0,"hostess",32.1,0,false);
  makeTownsperson(97.0,-11.0,"hostess",33.3,0,false);
  // A small, lively mix of visitors and staff: keep the crowd light for mobile performance.
  makeTownsperson(86.5,-10.5,"merchant",34.5,Math.PI/2,false);
  makeTownsperson(95.5,-10.8,"villager",35.7,-Math.PI/2,false);
  makeTownsperson(87.0,-11.2,"maid",36.9,0,false);
  // Courtesans and visitors are placed clearly inside the Velvet Rose salon.
  makeTownsperson(84.8,-8.8,"hostess",39.1,Math.PI/2,false);
  makeTownsperson(92.8,-8.8,"hostess",40.2,Math.PI,false);
  makeTownsperson(97.0,-9.0,"hostess",41.3,-Math.PI/2,false);
  makeTownsperson(86.5,-11.2,"villager",42.4,Math.PI/2,false);
  makeTownsperson(94.8,-11.0,"merchant",43.5,-Math.PI/2,false);
  makeTownsperson(97.0,-10.6,"villager",44.6,Math.PI,false);

  // A few clothed townspeople make the public baths feel like a shared civic space.
  makeTownsperson(-101.5,-48.5,"villager",34.1,Math.PI,false);
  makeTownsperson(-82.5,-48.5,"merchant",35.2,Math.PI,false);
  makeTownsperson(-101.5,-68.0,"villager",36.3,0,false);
  makeTownsperson(-82.5,-68.0,"villager",37.4,0,false);
  makeTownsperson(-92.0,-49.0,"hostess",38.5,Math.PI,false);

  // Give the walking residents real street-to-street routes instead of tiny circles.
  const walkingRoutes=[
    [[-5,24],[-13,21],[-17,13],[-8,8],[1,14],[4,22],[-5,24]],
    [[3,25],[12,23],[22,24],[30,17],[25,10],[17,14],[3,25]],
    [[31,4],[36,10],[36,20],[29,24],[24,18],[28,10],[31,4]],
    [[29,-20],[22,-18],[16,-23],[12,-28],[7,-27],[3,-23],[10,-18],[20,-16],[29,-20]],
    [[-34,1],[-31,9],[-24,13],[-17,10],[-15,3],[-22,-2],[-34,1]],
    [[35,12],[31,19],[24,23],[15,20],[18,13],[27,8],[35,12]],
    [[6,31],[14,29],[24,29],[31,23],[27,16],[18,18],[6,31]],
    [[21,-4],[28,-6],[32,-13],[28,-19],[21,-16],[17,-10],[21,-4]],
    [[-9,-12],[-5,-8],[-1,-12],[1,-19],[-3,-25],[-8,-24],[-9,-12]]
  ];
  people.forEach((person,index)=>{
    const route=walkingRoutes[index%walkingRoutes.length].map(([x,z])=>new Vector3(x,0,z));
    person.route=route;person.waypointIndex=1;person.speed=1.05+(index%4)*.12;
    person.root.position.x=route[0].x;person.root.position.z=route[0].z;
  });
  // Additional pedestrians make the guild lane, brook crossing and tavern approach feel inhabited.
  const extraRoutes=[
    [[-7,-4],[-3,2],[5,7],[9,14],[5,21],[-2,18],[-7,-4]],
    [[-6,-27],[-2,-24],[3,-22],[9,-24],[14,-28],[17,-25],[12,-21],[4,-21],[-6,-27]],
    [[-28,17],[-20,19],[-14,15],[-12,8],[-19,5],[-27,9],[-28,17]],
    [[18,-28],[24,-26],[30,-22],[33,-16],[28,-12],[22,-15],[18,-28]],
    [[-1,30],[7,28],[13,23],[17,17],[11,12],[4,16],[-1,30]]
  ];
  extraRoutes.forEach((points,index)=>{
    const route=points.map(([x,z])=>new Vector3(x,0,z));
    const actor=makeTownsperson(route[0].x,route[0].z,index===1?"merchant":"villager",36+index*1.7,0,true);
    actor.route=route;actor.waypointIndex=1;actor.speed=1.0+(index%3)*.16;
  });
  const civicRoutes=[
    [[-45,20],[-51,17],[-58,12],[-62,3],[-57,-4],[-49,-1],[-45,20]],
    [[-75,30],[-70,23],[-64,18],[-58,19],[-55,27],[-63,32],[-75,30]],
    [[-61,-22],[-54,-25],[-48,-20],[-46,-12],[-53,-7],[-61,-12],[-61,-22]],
    [[28,-33],[34,-35],[41,-32],[46,-26],[42,-20],[35,-23],[28,-33]],
    [[-82,4],[-76,1],[-69,4],[-66,12],[-72,18],[-80,14],[-82,4]],
    [[81,18],[86,22],[94,26],[99,20],[96,12],[88,11],[81,18]],
    [[-48,30],[-42,27],[-36,22],[-34,14],[-40,10],[-47,15],[-48,30]],
    [[40,4],[45,8],[52,12],[59,10],[61,3],[54,-2],[47,0],[40,4]]
  ];
  civicRoutes.forEach((points,index)=>{
    const route=points.map(([x,z])=>new Vector3(x,0,z));
    const actor=makeTownsperson(route[0].x,route[0].z,index===2?"merchant":(index===3?"merchant":"villager"),45+index*1.4,0,true);
    actor.route=route;actor.waypointIndex=1;actor.speed=.92+(index%4)*.11;
  });
  };
  // Desktop receives the full moving population. Phones receive carefully placed,
  // fully modeled residents in each landmark rather than primitive placeholder people.
  if(!isTouchDevice) populateResidents();
  else {
    // Compact, detailed mobile cast; full crowd remains enabled on desktop.
    makeBathGuest(27.0,.88,61.0,"soaking",-.25,0);
    makeBathGuest(32.8,.88,64.5,"soaking",Math.PI+.25,1);
    makeBathGuest(25.8,.88,64.4,"soaking",-Math.PI/2,3);
    makeBathGuest(42.0,.79,60.8,"soaking",Math.PI/2,8);
    box(scene,"imperial-bath-treatment-marble-bed",[34.0,.55,52.8],[1.72,.42,2.35],hammamIvory);
    box(scene,"imperial-bath-treatment-linen",[34.0,.79,52.76],[1.48,.12,2.08],bathTowel);
    box(scene,"imperial-bath-treatment-headrest",[34.0,.91,52.02],[.72,.16,.46],hammamTile);
    cylinder(scene,"imperial-bath-treatment-oil-bowl",[32.88,.72,53.28],.38,.20,hammamGold,12);
    makeBathGuest(34.0,.38,52.8,"scrubbed",Math.PI/2,18);
    makeBathGuest(35.28,.10,52.88,"attendant",Math.PI/2,19);

    // Guild: a clerk, a guard and one more adventurer by the notice wall.
    makeTownsperson(-23.0,-26.0,"merchant",25.2,Math.PI,false);
    makeTownsperson(-31.0,-18.0,"guard",26.4,Math.PI/2,false);
    makeTownsperson(-16.5,-22.5,"villager",71.7,Math.PI,false);
    // A small, carefully placed crowd inside the three taprooms.
    makeTownsperson(-25.2,4.0,"villager",72.8,Math.PI/2,false);
    makeTownsperson(45.0,4.0,"villager",73.9,Math.PI,false);
    makeTownsperson(69.0,4.2,"merchant",75.0,Math.PI,false);

    // Two ground-floor readers sit at the study tables; one reader browses upstairs.
    makeTownsperson(-49.2,-90.55,"villager",29.1,Math.PI,false,"seated");
    makeTownsperson(-45.2,-87.45,"villager",30.2,0,false,"seated");
    makeTownsperson(-55.0,-93.0,"villager",31.3,Math.PI/2,false);
    makeTownsperson(-47.0,-82.0,"maid",35.7,Math.PI/2,false);

    // Palace attendants.
    makeTownsperson(-9.0,-126.0,"maid",21.1,-Math.PI/2,false);
    makeTownsperson(9.0,-126.0,"butler",22.4,Math.PI/2,false);
    makeTownsperson(-9.0,-139.0,"butler",23.7,-Math.PI/2,false);
    makeTownsperson(9.0,-139.0,"maid",24.8,Math.PI/2,false);

    // Four stallkeepers and two shoppers.
    for(let row=0;row<Math.min(2,marketStallRows.length);row++) {
      // Place each merchant behind the counter, on the stall's outer/service side.
      makeTownsperson(-8.85,marketStallRows[row],"merchant",40+row,-Math.PI/2,false);
      makeTownsperson(8.85,marketStallRows[row],"merchant",41+row,Math.PI/2,false);
    }
    makeTownsperson(-3.2,-13.0,"villager",47.1,.2,false);
    makeTownsperson(3.0,-29.0,"villager",48.2,Math.PI-.2,false);
    // A few extra townsfolk add life to the mobile plaza without spawning a dense crowd.
    makeTownsperson(-12.0,8.0,"villager",61.2,Math.PI/3,false);
    makeTownsperson(13.0,12.0,"merchant",62.3,-Math.PI/2,false);
    makeTownsperson(-18.0,22.0,"maid",63.4,Math.PI/2,false);
    makeTownsperson(20.0,-8.0,"guard",64.5,Math.PI,false);
  }

  // Coachmen hold the reins, noble passengers ride inside, and attendants help guests board.
  function addCoachPerson(coach,role,phase,localPosition,heading=0) {
    const root=makeTownsperson(coach.x,coach.z,role,phase,heading,false,"seated");
    // The seated pose is built from the ground up; place its pelvis on the
    // raised coachman's bench rather than lifting the whole figure too high.
    const seatHeight=1.18;
    if(coach.group) {
      root.parent=coach.group;
      root.position.set(localPosition[0],seatHeight,localPosition[2]);
    } else {
      root.position.set(coach.x+localPosition[0],seatHeight,coach.z+localPosition[2]);
    }
    root.rotation.y=heading;
    // Give the driver a clear, continuous pair of reins held in front of him.
    for(const side of [-1,1]) {
      const rein=MeshBuilder.CreateTube("royal-carriage-driver-rein",{
        path:[
          new Vector3(side*.30,.83,-.39),
          new Vector3(side*.34,.78,-.82),
          new Vector3(side*.29,.82,-1.35),
          new Vector3(side*.22,.96,-2.05)
        ],radius:.022,tessellation:7
      },scene);
      rein.material=horseLeather;
      rein.parent=root;
      rein.isPickable=false;
    }
    return root;
  }
  addCoachPerson(parkedRoyalCarriage,"butler",52.1,[0,1.58,-1.30]);
  addCoachPerson(parkedRoyalCarriage,"hostess",53.2,[.48,1.45,1.12]);
  addCoachPerson(travelingRoyalCarriage,"butler",54.3,[0,1.58,-1.30]);
  addCoachPerson(travelingRoyalCarriage,"villager",55.4,[-.48,1.45,1.12]);
  // The coach travels far beyond its spawn bounds. Keep its meshes active so the
  // static world octree cannot cull it permanently after it leaves the starting area.
  for(const mesh of travelingRoyalCarriage.group.getChildMeshes()) {
    mesh.alwaysSelectAsActiveMesh=true;
    mesh.isVisible=true;
  }
  const coachAttendant=makeTownsperson(parkedRoyalCarriage.x+2.8,parkedRoyalCarriage.z+1.0,"butler",56.5,Math.PI/2,false);
  coachAttendant.position.y=0;
  const arrivingNoble=makeTownsperson(parkedRoyalCarriage.x-2.8,parkedRoyalCarriage.z+1.5,"hostess",57.6,-Math.PI/2,false);
  arrivingNoble.position.y=0;

  // Small songbirds gather among the formal roses: some perch, others circle over the beds.
  const birdBodyMat=mat(scene,"rose-garden-bird-plumage",new Color3(.22,.27,.25),.82);
  const birdBreastMat=mat(scene,"rose-garden-bird-breast",new Color3(.72,.62,.43),.9);
  const birdBeakMat=mat(scene,"rose-garden-bird-beak",new Color3(.72,.39,.13),.72);
  const birds=[];
  function addGardenBird(x,y,z,perched=false,phase=0) {
    const root=new TransformNode("rose-garden-songbird",scene);
    root.position.set(x,y,z);
    const body=MeshBuilder.CreateSphere("songbird-body",{diameter:1,segments:10},scene);
    body.parent=root;body.scaling.set(.20,.16,.34);body.material=birdBodyMat;
    const breast=MeshBuilder.CreateSphere("songbird-breast",{diameter:1,segments:8},scene);
    breast.parent=root;breast.position.set(0,-.025,-.055);breast.scaling.set(.145,.12,.23);breast.material=birdBreastMat;
    const head=MeshBuilder.CreateSphere("songbird-head",{diameter:.22,segments:10},scene);
    head.parent=root;head.position.set(0,.105,-.19);head.material=birdBodyMat;
    const beak=MeshBuilder.CreateCylinder("songbird-beak",{diameterTop:0,diameterBottom:.075,height:.13,tessellation:5},scene);
    beak.parent=root;beak.rotation.x=Math.PI/2;beak.position.set(0,.085,-.32);beak.material=birdBeakMat;
    const tail=MeshBuilder.CreateBox("songbird-tail",{width:.12,height:.045,depth:.28},scene);
    tail.parent=root;tail.position.set(0,.015,.25);tail.rotation.x=-.18;tail.material=birdBodyMat;
    const wings=[];
    for(const side of [-1,1]) {
      const pivot=new TransformNode("songbird-wing-pivot",scene);pivot.parent=root;pivot.position.x=side*.09;
      const wing=MeshBuilder.CreateBox("songbird-wing",{width:.34,height:.045,depth:.22},scene);
      wing.parent=pivot;wing.position.x=side*.15;wing.rotation.y=side*.18;wing.material=birdBodyMat;
      wings.push({pivot,side});
    }
    birds.push({root,wings,perched,phase,home:new Vector3(x,y,z),radius:perched?0:2.8});
    return root;
  }
  // Golden-yellow finches perch on the imperial fountain rim and dip their beaks to drink.
  const yellowBirdMat=mat(scene,"golden-finch-plumage",new Color3(.96,.72,.08),.72),yellowWingMat=mat(scene,"golden-finch-wing",new Color3(.78,.48,.035),.82),yellowBreastMat=mat(scene,"golden-finch-breast",new Color3(1,.88,.28),.8),yellowBirds=[];
  function addYellowFinch(x,y,z,drink=false,phase=0){const root=new TransformNode("golden-finch",scene);root.position.set(x,y,z);const body=MeshBuilder.CreateSphere("golden-finch-body",{diameter:1,segments:12},scene);body.parent=root;body.scaling.set(.22,.18,.34);body.material=yellowBirdMat;const breast=MeshBuilder.CreateSphere("golden-finch-breast",{diameter:1,segments:10},scene);breast.parent=root;breast.position.set(0,-.035,-.055);breast.scaling.set(.16,.13,.24);breast.material=yellowBreastMat;const head=MeshBuilder.CreateSphere("golden-finch-head",{diameter:.24,segments:12},scene);head.parent=root;head.position.set(0,.12,-.20);head.material=yellowBirdMat;const beak=MeshBuilder.CreateCylinder("golden-finch-beak",{diameterTop:0,diameterBottom:.075,height:.14,tessellation:5},scene);beak.parent=root;beak.rotation.x=Math.PI/2;beak.position.set(0,.085,-.34);beak.material=birdBeakMat;const tail=MeshBuilder.CreateBox("golden-finch-tail",{width:.12,height:.045,depth:.30},scene);tail.parent=root;tail.position.set(0,.015,.26);tail.material=yellowWingMat;for(const side of [-1,1]){const wing=MeshBuilder.CreateBox("golden-finch-wing",{width:.25,height:.055,depth:.24},scene);wing.parent=root;wing.position.set(side*.14,.025,.015);wing.material=yellowWingMat;}yellowBirds.push({root,drink,phase,baseY:y});}
  addYellowFinch(6.15,2.20,5.1,false,.2);addYellowFinch(19.8,2.20,5,false,1.1);addYellowFinch(13.1,2.20,-2.15,true,2.4);addYellowFinch(13,2.20,12.15,true,3.6);addYellowFinch(10.4,2.20,10.3,false,4.7);
  // Perched birds sit on the garden pergolas and fountain rim.
  addGardenBird(-29.2,5.05,-43.0,true,.4);
  addGardenBird(25.4,4.95,-35.4,true,1.8);
  addGardenBird(30.0,2.35,-48.5,true,2.7);
  // A loose little flock passes above the roses at different heights.
  addGardenBird(-31.0,5.8,-34.0,false,.2);
  addGardenBird(-25.0,7.0,-42.0,false,1.7);
  addGardenBird(24.0,6.2,-45.0,false,3.1);
  addGardenBird(31.0,7.4,-31.0,false,4.4);

  // The animated horse is also deferred until the town is already playable.
  if(!isTouchDevice) setTimeout(() => { void (async () => {
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
  })(); }, 9000);
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

  // Post-processing render targets are a major memory cost on iPhone Safari.
  // Keep the full lighting/material scene, but reserve cinematic post effects for desktop.
  if(!isTouchDevice) {
    const cinematic=new DefaultRenderingPipeline("erinvale-cinematic",true,scene,[camera]);
    cinematic.samples=1;
    cinematic.fxaaEnabled=true;
    cinematic.bloomEnabled=true;
    cinematic.bloomThreshold=.88;
    cinematic.bloomWeight=.12;
    cinematic.bloomKernel=64;
    cinematic.imageProcessingEnabled=false;
  }
  let yaw=0,pitch=0,moveSource=()=>Vector3.Zero();
  const velocity=new Vector3();
  let libraryUpperLevel=false;
  let velvetRoseUpperLevel=false;
  const collides=(x,z)=>{
    if(Math.abs(x)>112)return true;
    // Upstairs in The Velvet Rose: keep the walkable suite clear of leftover ground-floor furniture blockers.
    if(velvetRoseUpperLevel&&x>83.45&&x<98.55&&z>-19.8&&z<-4.2)return false;
    // Solid library perimeter collision; keep only the east entrance open.
    const inLibraryZ=z>-97.0&&z<-71.0;
    const inLibraryX=x>-65.0&&x<-39.2;
    if(inLibraryZ&&x>-64.65&&x<-62.95)return true; // west wall
    if(inLibraryX&&z>-96.95&&z<-95.05)return true; // north wall
    if(inLibraryX&&z>-72.95&&z<-71.05)return true; // south wall
    if(inLibraryZ&&x>-41.05&&x<-39.45) {
      const inMainDoorway=z>-86.0&&z<-82.0;
      if(!inMainDoorway)return true;
    }
    // Block every upper-gallery edge not covered by the mezzanine deck or stair.
    if(libraryUpperLevel&&inLibraryX&&inLibraryZ) {
      const onStair=x>-49.25&&x<-42.15&&z>-93.1&&z<-91.6;
      const inStairwellOpening=x>-49.3&&z>-93.15&&z<-91.55;
      const onMainGallery=x>-62.0&&x<-44.0&&z>-95.45&&z<-90.0&&!inStairwellOpening;
      const onWestGallery=x>-62.0&&x<-60.0&&z>-90.5&&z<-73.6;
      if(!onStair&&!onMainGallery&&!onWestGallery)return true;
    }
    // Bookcase bodies and the books on their shelves are solid obstacles.
    for(const shelfZ of [-92,-87.75,-83.5,-79.25,-75])
      if(x>-63.15&&x<-61.85&&Math.abs(z-shelfZ)<2.05)return true;
    for(const shelfX of [-59,-54.5,-47.5,-43.5])for(const shelfZ of [-95,-73])
      if(Math.abs(x-shelfX)<1.98&&Math.abs(z-shelfZ)<.48)return true;
    if(libraryUpperLevel) {
      for(const shelfX of [-60.5,-57,-53.5,-50,-46.5])
        if(Math.abs(x-shelfX)<1.68&&Math.abs(z+95.35)<.32)return true;
      for(const shelfX of [-59.5,-54.5,-49.5,-44.5])
        if(Math.abs(x-shelfX)<2.0&&Math.abs(z+94.5)<.40)return true;
      for(const shelfZ of [-94,-91.8])
        if(Math.abs(x+62.0)<.38&&Math.abs(z-shelfZ)<1.08)return true;
      for(const shelfZ of [-87.7,-85.2,-80.5,-76.0])
        if(Math.abs(x+62.35)<.38&&Math.abs(z-shelfZ)<1.12)return true;
    }
    // Stair footprint is intentionally passable so visitors can climb to the gallery.
    // The hall is checked before the legacy z=-116 boundary and town obstacles.
    if(x>-26.2&&x<26.2&&z>-183.0&&z<-113.0) {
      if(Math.abs(x)>25.9||z<-182.5)return true;
      for(const columnX of [-23.2,23.2])for(const columnZ of [-166,-148.5,-131])
        if(Math.hypot(x-columnX,z-columnZ)<1.32)return true;
      // The white cross-balcony wall is solid, but its central double doorway stays open.
      if(Math.abs(z+120.35)<.82&&Math.abs(x)>4.95)return true;
      for(const deskX of [-9.2,9.2])if(Math.abs(x-deskX)<3.65&&z>-173.25&&z<-171.15)return true;
      return false;
    }
    if(Math.abs(z)>116)return true;
    for(const c of colliders) {
      if(x>c.minX-.5&&x<c.maxX+.5&&z>c.minZ-.5&&z<c.maxZ+.5) {
        const inDoor=Math.abs(x-c.doorX)<c.doorWidth/2 && Math.abs(z-c.doorZ)<2.2;
        const insideRoom=c.interior&&x>c.minX+.55&&x<c.maxX-.55&&z>c.minZ+.55&&z<c.maxZ-.55;
        const gatePassage=c.passThrough&&Math.abs(x-c.doorX)<c.doorWidth/2;
        if(c.name==="The Velvet Rose") {
          // Keep the exterior shell and the interior perimeter walls solid;
          // only the centered front doorway is an entrance/exit.
          if(insideRoom) {
            const againstSideWall=x<c.minX+.95||x>c.maxX-.95;
            const againstBackWall=z<c.minZ+.9;
            const againstFrontWall=z>c.maxZ-.9&&!inDoor;
            if(againstSideWall||againstBackWall||againstFrontWall)return true;
            continue;
          }
          if(inDoor)continue;
          return true;
        }
        if(insideRoom||gatePassage)continue;
        if(!inDoor)return true;
      }
    }
    // Reserve a clear corridor for the new stair flight; furniture colliders must not block it.
    if(x>82.9&&x<86.5&&z<=-10.0&&z>=-18.6)return false;
    // Fountain basin, market counters, and the remaining cliff shoulders are solid.
    if(Math.hypot(x-13,z-5)<8.0)return true;
    // Ground-floor furniture obstacles must not become invisible walls for visitors upstairs.
    if(!velvetRoseUpperLevel) for(const o of obstacles) if(Math.hypot(x-o.x,z-o.z)<o.r+.42)return true;
    // The old palace-garden hedge/terrace movement barrier is removed.
    // Keep the garden and public-library approach freely walkable.
    return false;
  };
  const location=document.querySelector("#location-name");
  function getLocation(x,z) {
    if(x<-12&&z>0)return "銅鹿亭 — Copper Stag Tavern";
    if(x<-8&&z<-8&&z>-26)return "冒険者ギルド";
    if(x>10&&z<-5&&z>-29)return "王都の市場";
    if(x>34&&z>-3&&z<35)return "酒場通り — The Lantern Quarter";
    if(x>11&&x<49&&z>35&&z<86)return "帝国浴場 — THERMAE · HAMMAM";
    if(x<-39&&x>-66&&z>-98&&z<-68)return "王立図書館 — PUBLIC ROYAL LIBRARY";
    if(z<-72)return "王宮 — 王城の中庭";
    if(z<-45)return "王城への大通り";
    if(Math.hypot(x-13,z-5)<16)return "皇帝の噴水広場";
    return "王都エリンヴェイル";
  }
  let seatedAt=null;
  let savedStandingY=1.72;
  function interact() {
    const px=camera.position.x,pz=camera.position.z;
    if(seatedAt) {
      camera.position.x=seatedAt.standX;
      camera.position.z=seatedAt.standZ;
      camera.position.y=savedStandingY;
      seatedAt=null;
      document.querySelector("#hint").textContent="椅子から立ち上がった。";
      return;
    }
    let nearestSeat=null,seatDistance=Infinity;
    for(const seat of librarySeats) {
      const d=Math.hypot(px-seat.x,pz-seat.z);
      if(d<1.45&&d<seatDistance){nearestSeat=seat;seatDistance=d;}
    }
    if(nearestSeat) {
      savedStandingY=camera.position.y;
      seatedAt={...nearestSeat,standX:px,standZ:pz};
      camera.position.x=nearestSeat.x;
      camera.position.z=nearestSeat.z;
      camera.position.y=2.02;
      yaw=nearestSeat.yaw;
      pitch=0;
      camera.rotation.y=Math.PI-yaw;
      camera.rotation.x=0;
      document.querySelector("#hint").textContent="読書席に座った。もう一度「調べる／座る」を押すと立ち上がる。";
      return;
    }
    const doors=scene.metadata?.doorLeaves||[];
    let nearest=null,nearestDistance=Infinity;
    for(const door of doors) {
      // Measure on the ground plane. The bath uses its shared doorway center,
      // not either elevated hinge, so both leaves are reliably reachable.
      const distance=Math.hypot(camera.position.x-door.position.x,camera.position.z-door.position.z);
      const reach=door.name==="imperial-hammam-entry-double-door"?12:7.5;
      if(distance<reach&&distance<nearestDistance){nearest=door;nearestDistance=distance;}
    }
    if(nearest) {
      const opening=!nearest.open;
      const pair=nearest.name==="imperial-hammam-entry-double-door"
        ?doors.filter(door=>door.name===nearest.name):[nearest];
      for(const leaf of pair) {
        leaf.open=opening;
        const target=leaf.home+(opening?(leaf.pivot.position.x<camera.position.x?-.95:.95):0);
        Animation.CreateAndStartAnimation("door-swing",leaf.pivot,"rotation.y",30,18,leaf.pivot.rotation.y,target,Animation.ANIMATIONLOOPMODE_CONSTANT);
      }
      if(this.onDoor)this.onDoor(opening);
      document.querySelector("#hint").textContent=opening?"重厚な両開き扉が軋みながら開いた。":"扉を閉めた。";
      return;
    }
    const x=camera.position.x,z=camera.position.z;
    let message="石畳の広場。遠くに王城と世界樹が見える。";
    if(x<-39&&x>-66&&z>-98&&z<-68)message="王立図書館。王族だけでなく、エリンヴェイルのすべての国民に開かれた公共図書館。自由に本を読んだり調べものをしたりできる。";
    else if(Math.hypot(x+21,z-6)<13)message="銅鹿亭。旅人たちが集う酒場。扉を通って中も見てみよう。";
    else if(Math.hypot(x+21,z+16)<13)message="冒険者ギルド。掲示板には依頼書が並んでいる。";
    else if(Math.hypot(x-13,z-5)<16)message="石造りの大噴水広場。水音を聞きながら、街の人々がベンチで語らう憩いの場所。";
    else if(x>24.15&&x<35.85&&z>58.35&&z<66.05)message="湯船に浸かっている。湯気と水音に包まれ、ゆっくり身体を温めよう。";
    else if(x>11&&x<49&&z>35&&z<86)message="帝国浴場。岩のトンネルを抜けると、湯気に包まれた隠れ家的な温泉が広がる。";
    else if(z<-45)message="王城へ続く大門。街の喧騒が遠のき、王宮の静けさが近づいてくる。";
    else if(x>34&&z>-3&&z<35)message="酒場通り。旅人や商人、冒険者たちが夜まで集う街の一角。";
    else if(x>10&&z<-5)message="市場の屋台。果物や旅の道具が並んでいる。";
    document.querySelector("#hint").textContent=message;
  }

  // High-polygon clipped shrubs keep their rounded, natural silhouettes while sharing draw calls.
  const courtShrubMeshes=scene.meshes.filter(mesh=>
    (mesh.name==="palace-court-topiary"||mesh.name==="palace-turning-island-shrub") &&
    !mesh.isDisposed() && mesh.material===courtHedge && !mesh.parent
  );
  if(courtShrubMeshes.length>1) {
    const courtShrubBatch=Mesh.MergeMeshes(courtShrubMeshes,true,true,undefined,false,false);
    if(courtShrubBatch) {courtShrubBatch.name="palace-court-high-detail-shrub-batch";courtShrubBatch.material=courtHedge;courtShrubBatch.isPickable=false;}
  }

  // The guild contains many individually modeled but stationary props.
  // Batch them by their existing material to cut draw calls without removing
  // any geometry, texture, decoration, or changing their world-space layout.
  const guildAnimatedNames = /glow|flame|sign-face|readable-face/;
  const guildBatches = new Map();
  for (const mesh of [...scene.meshes]) {
    if (!mesh.name.startsWith("guild-") || guildAnimatedNames.test(mesh.name)) continue;
    if (mesh.parent || mesh.isDisposed() || !mesh.material || Array.isArray(mesh.material)) continue;
    if (!guildBatches.has(mesh.material)) guildBatches.set(mesh.material, []);
    guildBatches.get(mesh.material).push(mesh);
  }
  let guildBatchIndex = 0;
  for (const [material, parts] of guildBatches) {
    if (parts.length < 2) continue;
    const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, false);
    if (merged) {
      merged.name = "guild-static-batch-" + guildBatchIndex++;
      merged.material = material;
      merged.isPickable = false;
    }
  }

  // The Velvet Rose is richly furnished, but its many fixed ornaments do not
  // need separate draw calls. Merge by their original material; retain every
  // modeled detail and keep emissive bulbs separate so their glow remains crisp.
  const velvetRoseBatches = new Map();
  for (const mesh of [...scene.meshes]) {
    if (!mesh.name.startsWith("velvet-rose-") || mesh.name.includes("glow") || mesh.name.includes("bulb")) continue;
    if (mesh.parent || mesh.isDisposed() || !mesh.material || Array.isArray(mesh.material)) continue;
    if (!velvetRoseBatches.has(mesh.material)) velvetRoseBatches.set(mesh.material, []);
    velvetRoseBatches.get(mesh.material).push(mesh);
  }
  let velvetRoseBatchIndex = 0;
  for (const [material, parts] of velvetRoseBatches) {
    if (parts.length < 2) continue;
    const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, false);
    if (merged) {
      merged.name = "velvet-rose-static-batch-" + velvetRoseBatchIndex++;
      merged.material = material;
      merged.isPickable = false;
    }
  }

  // Batch the detailed market props by their original materials; keep sign faces and
  // translucent wares separate so labels and glass remain crisp.
  const marketBatches=new Map();
  for(const mesh of [...scene.meshes]) {
    if(!mesh.name.startsWith("market-")||mesh.name.includes("sign-face")||mesh.name.includes("apothecary-jar"))continue;
    if(mesh.isDisposed()||!mesh.material||Array.isArray(mesh.material)||mesh.getTotalVertices()===0)continue;
    if(!marketBatches.has(mesh.material))marketBatches.set(mesh.material,[]);
    mesh.computeWorldMatrix(true);
    marketBatches.get(mesh.material).push(mesh);
  }
  let marketBatchIndex=0;
  for(const [material,parts] of marketBatches) {
    if(parts.length<2)continue;
    const merged=Mesh.MergeMeshes(parts,true,true,undefined,false,false);
    if(merged){merged.name="market-detail-batch-"+marketBatchIndex++;merged.material=material;merged.isPickable=false;}
  }

  // iPhone emergency profile: the bath's layered transparent steam and
  // close-up guest models are the largest burst when the camera faces the pools.
  // Keep the architecture, pools, water, dome and all town geometry; omit only
  // those optional bath effects/figures on touch devices and disable its point lights.
  if(isTouchDevice) {
    for(const mesh of [...scene.meshes]) {
      if(/imperial-bath-(?:rising-steam|treatment-steam|dense-steam-bank|fine-steam-wisp)/.test(mesh.name)) {
        mesh.dispose(false,false);
      }
    }
    for(const light of scene.lights) {
      if(light.name==="imperial-bath-oculus-daylight"||light.name==="imperial-bath-warm-wall-light") {
        light.setEnabled(false);
      }
    }
    bathSteamPuffs.length=0;
    bathActors.length=0;
  }

  // Spatial octree culling preserves every detailed mesh while reducing
  // work for distant and off-screen districts.
  scene.createOrUpdateSelectionOctree(64, 2);

  const shadowNames = /facade-|side-wall-|rear-wall|roof-left|roof-right|ridge|corner-post|oak-barrel|old-tree-trunk|plaza-tree-trunk|world-tree-trunk|gatehouse-tower|castle-tower|street-lamp-post|market-post|emperor-statue/;
  if(shadow) for (const mesh of scene.meshes) {
    if (shadowNames.test(mesh.name)) shadow.addShadowCaster(mesh, false);
  }

  // Static world geometry never changes after construction. Freeze its world
  // matrices so Babylon does not recalculate thousands of transforms every frame.
  // Keep the animated foliage and water live; actor parts and doors are parented
  // and are intentionally excluded from this pass.
  const animatedMeshes = new Set([
    ...canopy.map(item => item.mesh),
    waterRing,
    basinInnerBand,
  ]);
  for (const mesh of scene.meshes) {
    if (!mesh.parent && !animatedMeshes.has(mesh) && !mesh.isDisposed()) {
      mesh.freezeWorldMatrix();
    }
  }

  return {
    scene,
    setMovementSource(fn){moveSource=fn;},
    onMovement:null,
    onDoor:null,
    turn(dx,dy){yaw+=dx;pitch=Scalar.Clamp(pitch+dy,-1.05,1.05);camera.rotation.y=Math.PI-yaw;camera.rotation.x=pitch;},
    interact,
    update(dt){
      const input=seatedAt?Vector3.Zero():moveSource();
      const step=Math.min(dt,.045);
      const inBathPool=camera.position.x>24.15&&camera.position.x<35.85&&camera.position.z>58.35&&camera.position.z<66.05;
      const speed=inBathPool?2.25:4.4;
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
      const onLanding=camera.position.z<stairEndZ&&camera.position.z>=-129.0&&Math.abs(camera.position.x)<14.0;
      const insideRoyalLobby=camera.position.x>-26.0&&camera.position.x<26.0&&camera.position.z<-113.0&&camera.position.z>-183.0;
      const onGreatBridge=Math.abs(camera.position.x-bridgeX)<2.85&&camera.position.z>=bridgeZ-bridgeHalf&&camera.position.z<=bridgeZ+bridgeHalf;
      const onSmallBridge=Math.abs(camera.position.x-sx)<2.0&&camera.position.z>=sz-smallHalf&&camera.position.z<=sz+smallHalf;
      const lobbyStairT=Scalar.Clamp((-camera.position.z-132)/39,0,1);
      const lobbyStairCenterX=18*(1-lobbyStairT);
      const onLobbyGrandStair=camera.position.z<=-132&&camera.position.z>=-171.5&&Math.abs(Math.abs(camera.position.x)-lobbyStairCenterX)<3.55;
      const onLobbyStairLanding=camera.position.z<-171.0&&camera.position.z>=-174.0&&Math.abs(camera.position.x)<5.2;
      const onLobbyUpperGallery=camera.position.z<-173.35&&camera.position.z>-182.4&&Math.abs(camera.position.x)<19.2;
      const lobbyStairFloor=openHallLobbyTop+7.58*lobbyStairT;
      // Stair progression changes the camera elevation smoothly; the top landing
      // latches the visitor onto the upper gallery until they descend again.
      // Velvet Rose stair and upper-floor navigation. The stair runs from the
      // salon floor at z=-8 to the gallery landing at z=-13; once upstairs,
      // the camera stays on the second-floor deck until it returns to the stair.
      const roseStairX=84.7;
      const onVelvetRoseStair=Math.abs(camera.position.x-roseStairX)<1.55&&camera.position.z<=-10.5&&camera.position.z>=-18.2;
      const roseStairT=Scalar.Clamp((-camera.position.z-10.5)/7.7,0,1);
      let onVelvetRoseUpper=false;
      const onRoseUpperDeck=camera.position.x>83.55&&camera.position.x<99.0&&camera.position.z>-20.0&&camera.position.z<-8.7;
      if(onVelvetRoseStair&&roseStairT>.94)velvetRoseUpperLevel=true;
      else if(onVelvetRoseStair&&roseStairT<.06)velvetRoseUpperLevel=false;
      if(velvetRoseUpperLevel&&onRoseUpperDeck)onVelvetRoseUpper=true;
      if(velvetRoseUpperLevel&&!onRoseUpperDeck&&!onVelvetRoseStair) {
        // Stop the visitor at the gallery edge instead of allowing a fall.
        camera.position.x=Scalar.Clamp(camera.position.x,83.75,98.65);
        camera.position.z=Scalar.Clamp(camera.position.z,-19.65,-9.0);
        onVelvetRoseUpper=true;
      }
      const roseFloorY=onVelvetRoseStair?roseStairT*4.45:(onVelvetRoseUpper?4.45:0);
      const onLibraryStair=camera.position.z>-93.1&&camera.position.z<-91.6&&camera.position.x>-49.25&&camera.position.x<-42.15;
      const libraryStairT=Scalar.Clamp((-42.55-camera.position.x)/6.0,0,1);
      if(onLibraryStair) {
        if(libraryStairT>.94)libraryUpperLevel=true;
        else if(libraryStairT<.06)libraryUpperLevel=false;
      }
      const onLibraryGallery=libraryUpperLevel&&(
        (camera.position.x>-62.0&&camera.position.x<-44.0&&camera.position.z>-95.45&&camera.position.z<-90.0)||
        (camera.position.x>-62.0&&camera.position.x<-60.0&&camera.position.z>-90.5&&camera.position.z<-73.6)
      );
      const libraryFloorY=onLibraryStair?1.72+libraryStairT*5.25:(onLibraryGallery?6.97:1.72);
      camera.position.y=seatedAt?2.02:(onVelvetRoseStair||onVelvetRoseUpper?roseFloorY+1.72:(camera.position.x>-64.5&&camera.position.x<-39.4&&camera.position.z>-97&&camera.position.z<-71?libraryFloorY:(inBathPool?1.34:(onGreatBridge?bridgeSurface(camera.position.z)+1.72:
        (onSmallBridge?smallSurface(camera.position.z)+1.72:
        (onRoyalStair?1.72+stairFloor:(onLobbyGrandStair?lobbyStairFloor+1.72:((onLobbyStairLanding||onLobbyUpperGallery)?openHallGalleryY+1.72:((onLanding||insideRoyalLobby)?10.34:1.72)))))))));
      camera.rotation.y=Math.PI-yaw;camera.rotation.x=pitch;
      location.textContent=getLocation(camera.position.x,camera.position.z);
      const moving=input.lengthSquared()>.025 && (Math.abs(camera.position.x-(camera._lastFootX??camera.position.x)) + Math.abs(camera.position.z-(camera._lastFootZ??camera.position.z))>.001);
      camera._lastFootX=camera.position.x;camera._lastFootZ=camera.position.z;
      if(this.onMovement)this.onMovement(moving,camera.position,getLocation(camera.position.x,camera.position.z));
      const time=performance.now()*.001;
      bathLanterns.forEach(lamp=>{
        const flicker=.94+Math.sin(time*5.1+lamp.phase)*.045+Math.sin(time*8.3+lamp.phase*1.7)*.018;
        lamp.flame.scaling.y=flicker;lamp.light.intensity=.48*flicker;
      });
      bathSteamPuffs.forEach((puff,index)=>{
        const cycle=(time*puff.speed+puff.phase)%3.8;
        puff.mesh.position.x=puff.x+Math.sin(time*.55+puff.phase)*puff.drift;
        puff.mesh.position.z=puff.z+Math.cos(time*.42+puff.phase)*puff.drift*.55;
        puff.mesh.position.y=puff.y+cycle*.72;
        const fade=Math.sin(Math.PI*cycle/3.8);
        const swell=.82+fade*.48;
        puff.mesh.scaling.x=swell*(.88+(index%3)*.08);
        puff.mesh.scaling.y=swell*(1.35+(index%4)*.16);
        puff.mesh.scaling.z=swell*(.9+(index%2)*.12);
      });
      bathActors.forEach(actor=>{
        actor.root.position.y=actor.baseY+Math.sin(time*.72+actor.phase)*.022;
        if(actor.pose==="attendant") {
          actor.root.rotation.z=Math.sin(time*1.15+actor.phase)*.035;
          actor.workingArms?.forEach(arm=>{arm.mesh.rotation.x=-.30+Math.sin(time*2.1+actor.phase+arm.side)*.18;});
        } else if(actor.pose==="soaking") {
          actor.root.rotation.z=Math.sin(time*.48+actor.phase)*.012;
        } else if(actor.pose==="scrubbed") {
          actor.root.rotation.x=Math.sin(time*.38+actor.phase)*.008;
        }
      });
      canopy.forEach(o=>{o.mesh.rotation.z=o.base+Math.sin(time*.35+o.phase)*.025;o.mesh.position.y=o.baseY+Math.sin(time*.35+o.phase)*.16;});
      // Subtle fountain ripples and falling droplets keep the water from feeling static.
      waterRing.scaling.x=1+Math.sin(time*1.2)*.025;
      basinInnerBand.scaling.x=1+Math.sin(time*.9)*.012;
      if(movingCarriage) {
        const target=movingCarriage.route[movingCarriage.waypointIndex],dx=target.x-movingCarriage.group.position.x,dz=target.z-movingCarriage.group.position.z,distance=Math.hypot(dx,dz);
        if(distance<.55)movingCarriage.waypointIndex=(movingCarriage.waypointIndex+1)%movingCarriage.route.length;
        else {
          const stride=Math.min(distance,movingCarriage.speed*step);
          const nextX=movingCarriage.group.position.x+dx/distance*stride;
          const nextZ=movingCarriage.group.position.z+dz/distance*stride;
          // The whole carriage needs a generous clearance radius. If any
          // registered world obstacle is in its swept path, halt before contact.
          const carriageRadius=2.75;
          const blockedByObject=obstacles.some(o=>Math.hypot(nextX-o.x,nextZ-o.z)<o.r+carriageRadius);
          const blockedByBuilding=colliders.some(c=>
            nextX>c.minX-carriageRadius&&nextX<c.maxX+carriageRadius&&
            nextZ>c.minZ-carriageRadius&&nextZ<c.maxZ+carriageRadius&&
            !(c.interior&&nextX>c.minX+.55&&nextX<c.maxX-.55&&nextZ>c.minZ+.55&&nextZ<c.maxZ-.55)
          );
          if(!blockedByObject&&!blockedByBuilding) {
            movingCarriage.group.position.x=nextX;
            movingCarriage.group.position.z=nextZ;
            // Ease the coach toward the travel heading instead of snapping at each waypoint.
            const targetYaw=Math.atan2(-dx,-dz);
            const yawDelta=Math.atan2(Math.sin(targetYaw-movingCarriage.group.rotation.y),Math.cos(targetYaw-movingCarriage.group.rotation.y));
            movingCarriage.group.rotation.y+=yawDelta*(1-Math.exp(-3.2*step));
            movingCarriage.horse.position.y=.015+Math.abs(Math.sin(time*8.5))*.045;
            movingCarriage.horse.rotation.x=Math.sin(time*8.5)*.012;
            movingCarriage.horse.getChildMeshes().forEach((limb,index)=>{
              if(limb.name==="horse-leg-muscle"||limb.name==="horse-cannon-bone")
                limb.rotation.x=Math.sin(time*8.5+(index%2)*Math.PI)*.16;
            });
          }
        }
        movingCarriage.group.position.y=carriageRoadHeight(movingCarriage.group.position.z);
      }
      people.forEach(person=>{
        if(!person.route||person.route.length<2)return;
        const target=person.route[person.waypointIndex];
        const dx=target.x-person.root.position.x,dz=target.z-person.root.position.z;
        const distance=Math.hypot(dx,dz);
        if(distance<.35) person.waypointIndex=(person.waypointIndex+1)%person.route.length;
        else {
          const stride=Math.min(distance,person.speed*step);
          person.root.position.x+=dx/distance*stride;
          person.root.position.z+=dz/distance*stride;
          person.root.rotation.y=Math.atan2(dx,dz)+Math.PI;
          person.root.position.y=Math.sin(time*8+person.phase)*.025;
        }
      });
      yellowBirds.forEach(bird=>{const dip=bird.drink?Math.max(0,Math.sin(time*1.8+bird.phase))*.20:0;bird.root.position.y=bird.baseY-dip;bird.root.rotation.x=bird.drink?Math.sin(time*1.8+bird.phase)*.16:Math.sin(time*2.4+bird.phase)*.025;bird.root.rotation.y=Math.sin(time*.55+bird.phase)*.18;});
      birds.forEach(bird=>{
        if(bird.perched)return;
        const t=time*.32+bird.phase;
        bird.root.position.x=bird.home.x+Math.sin(t)*bird.radius;
        bird.root.position.z=bird.home.z+Math.cos(t*.8)*bird.radius*.8;
        bird.root.position.y=bird.home.y+Math.sin(t*1.7)*.7;
        bird.root.rotation.y=Math.atan2(Math.cos(t)*bird.radius*.8,Math.cos(t)*bird.radius)+Math.PI/2;
        bird.wings.forEach(wing=>{wing.pivot.rotation.z=wing.side*(.12+Math.sin(time*13+bird.phase)*.52);});
      });
    }
  };
}
