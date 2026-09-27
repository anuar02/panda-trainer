import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {preserveMascotHead} from './mascot-rig.js';

const stage=document.querySelector('#stage'),loading=document.querySelector('#loading');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const query=new URLSearchParams(location.search);
const loader=new GLTFLoader();
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(33,1,.01,100);
const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.NeutralToneMapping;
stage.append(renderer.domElement);
renderer.domElement.setAttribute('aria-label','3D-панда. Перетаскивайте для вращения.');
renderer.domElement.setAttribute('role','img');
const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;controls.enablePan=false;controls.minDistance=2.6;controls.maxDistance=7;controls.maxPolarAngle=Math.PI*.76;controls.autoRotateSpeed=1.4;
scene.add(new THREE.HemisphereLight(0xffffff,0xa5a096,2.5));
const key=new THREE.DirectionalLight(0xfff5e5,2.4);key.position.set(-3,5,5);scene.add(key);
const rim=new THREE.DirectionalLight(0xffffff,1.3);rim.position.set(3,3,-3);scene.add(rim);
const group=new THREE.Group();scene.add(group);
const shadowCanvas=document.createElement('canvas');shadowCanvas.width=128;shadowCanvas.height=128;
const ctx=shadowCanvas.getContext('2d'),gradient=ctx.createRadialGradient(64,64,0,64,64,64);
gradient.addColorStop(0,'rgba(62,46,27,0.17)');gradient.addColorStop(1,'rgba(62,46,27,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
const shadow=new THREE.Mesh(new THREE.PlaneGeometry(2,1.6),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));
shadow.rotation.x=-Math.PI/2;shadow.position.y=.002;scene.add(shadow);
let model,mixer,current,config,paused=reduced.matches,speed=1,activeId=null;
const actions=new Map(),promises=new Map(),restPose=new Map();
function resetView(){controls.target.set(0,1.03,0);camera.position.set(0,1.27,4.85);controls.update();}
resetView();
function resize(){renderer.setSize(stage.clientWidth,stage.clientHeight);camera.aspect=stage.clientWidth/stage.clientHeight;camera.updateProjectionMatrix();}
new ResizeObserver(resize).observe(stage);resize();
function setPause(value){paused=value;document.querySelector('#pause').setAttribute('aria-pressed',String(value));document.querySelector('#pause').setAttribute('aria-label',value?'Продолжить движение':'Приостановить движение');document.querySelector('#pause').textContent=value?'▶':'Ⅱ';}
setPause(paused);
document.querySelector('#pause').onclick=()=>setPause(!paused);
document.querySelector('#reset-view').onclick=resetView;
document.querySelector('#rotate').onclick=e=>{controls.autoRotate=!controls.autoRotate;e.currentTarget.setAttribute('aria-pressed',String(controls.autoRotate));};
document.querySelector('#speed').oninput=e=>{speed=Number(e.target.value);document.querySelector('#speed-value').value=`${+speed.toFixed(2)}×`;};
reduced.addEventListener('change',e=>{if(e.matches){setPause(true);controls.autoRotate=false;document.querySelector('#rotate').setAttribute('aria-pressed','false');}});
function normalizeClip(clip){
  const copy=clip.clone();
  // Keep the mascot's proportions stable across differently scaled mocap clips.
  for(const track of copy.tracks){
    const [name,property]=track.name.split('.');const bone=restPose.get(name);if(!bone)continue;
    if(property==='scale'){for(let i=0;i<track.values.length;i+=3)bone.scale.toArray(track.values,i);}
    if(name==='Hips'&&property==='position'){
      const firstY=track.values[1];
      for(let i=0;i<track.values.length;i+=3){track.values[i]=bone.position.x;track.values[i+1]+=bone.position.y-firstY;track.values[i+2]=bone.position.z;}
    }
    if(property==='quaternion'&&['Head','neck','Hips'].includes(name)){
      const q=new THREE.Quaternion(),base=bone.quaternion.clone();
      const weight=name==='Hips'?.3:.15;
      for(let i=0;i<track.values.length;i+=4){q.fromArray(track.values,i);base.clone().slerp(q,weight).toArray(track.values,i);}
    }
  }
  return copy;
}
async function getAction(item){
  if(actions.has(item.id))return actions.get(item.id);
  if(!promises.has(item.id))promises.set(item.id,(async()=>{
    let clip;
    if(item.file.endsWith('.json')){
      const response=await fetch(item.file);if(!response.ok)throw new Error(`Не загружено движение: ${item.label}`);
      clip=THREE.AnimationClip.parse(await response.json());
    }else{
      const data=await loader.loadAsync(item.file);
      if(!data.animations.length)throw new Error(`Нет движения: ${item.label}`);
      clip=data.animations[0];
    }
    const action=mixer.clipAction(normalizeClip(clip));
    const loop=['idle','walk','run'].includes(item.id);
    action.setLoop(loop?THREE.LoopRepeat:THREE.LoopOnce,loop?Infinity:1);action.clampWhenFinished=true;
    actions.set(item.id,action);return action;
  })());
  return promises.get(item.id);
}
async function select(id,{unpause=true}={}){
  const item=config.animations.find(a=>a.id===id);if(!item)return;
  activeId=id;
  document.querySelectorAll('[data-action]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.action===id)));
  const button=document.querySelector(`[data-action="${id}"]`);button.disabled=true;
  try{
    const action=await getAction(item);if(activeId!==id)return;
    if(action!==current){action.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();if(current){current.fadeOut(.3);action.fadeIn(.3);}current=action;}
    document.querySelector('#mood-title').textContent=item.title;
    document.querySelector('#mood-description').textContent=item.description;
    if(unpause)setPause(false);
    window.panda.active=id;
  }catch(error){document.querySelector('#mood-description').textContent='Движение не загрузилось. Попробуйте ещё раз.';promises.delete(id);console.error(error);}
  finally{button.disabled=false;}
}
window.panda={ready:false,select,resetView,setPause,scene,camera,renderer,controls,group,actions};
try{
  const response=await fetch('./manifest.json');if(!response.ok)throw new Error('Не найден manifest.json');config=await response.json();
  const gltf=await loader.loadAsync(query.get('model')||config.model);model=gltf.scene;
  model.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  const factor=2/size.y;group.scale.setScalar(factor);group.position.set(-center.x*factor,-box.min.y*factor,-center.z*factor);group.add(model);
  model.traverse(n=>{if(n.isMesh){n.frustumCulled=false;for(const m of (Array.isArray(n.material)?n.material:[n.material])){
    m.metalness=0;m.roughness=1;m.normalMap=null;m.roughnessMap=null;m.metalnessMap=null;m.side=THREE.FrontSide;
    // Meshy's tightly packed UV islands bleed into white gutters with mipmaps.
    if(m.map){m.map.minFilter=THREE.LinearFilter;m.map.generateMipmaps=false;m.map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());m.map.needsUpdate=true;}
    m.needsUpdate=true;
  }}});
  mixer=new THREE.AnimationMixer(model);
  mixer.addEventListener('finished',e=>{if(e.action===current)select('idle',{unpause:false});});
  window.panda.rigCorrection=preserveMascotHead(model);
  model.traverse(n=>{if(n.isBone)restPose.set(n.name,{position:n.position.clone(),quaternion:n.quaternion.clone(),scale:n.scale.clone()});});
  if(query.has('model'))config.animations=[];
  for(const item of config.animations){const b=document.createElement('button');b.dataset.action=item.id;b.textContent=item.label;b.setAttribute('aria-pressed','false');b.onclick=()=>select(item.id);document.querySelector('#actions').append(b);}
  Object.assign(window.panda,{model,mixer,config,sourceSize:size.toArray(),bones:[]});
  model.traverse(n=>{if(n.isBone)window.panda.bones.push(n.name);});
  if(config.animations.length)await select(config.animations[0].id,{unpause:false});
  loading.hidden=true;window.panda.ready=true;
}catch(error){loading.textContent='Не удалось загрузить панду. Откройте страницу через локальный сервер и обновите её.';console.error(error);window.panda.error=String(error);}
const clock=new THREE.Clock();
renderer.setAnimationLoop(()=>{const delta=Math.min(clock.getDelta(),.05);if(document.hidden)return;if(mixer&&!paused)mixer.update(delta*speed);controls.update();renderer.render(scene,camera);});
