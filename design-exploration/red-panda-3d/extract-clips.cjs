// Export animation data only; keep original Meshy GLBs and geometry unchanged.
const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage();
 await page.goto('http://127.0.0.1:8766/design-exploration/red-panda-3d/');
 await page.waitForFunction(()=>window.panda?.ready);
 const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'manifest.json'),'utf8'));
 fs.mkdirSync(path.join(__dirname,'assets/clips'),{recursive:true});
 for(const item of manifest.animations){
  const source=item.source||item.file;
  const json=await page.evaluate(async file=>{
   const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
   const {AnimationClip}=await import('three');
   const data=await new GLTFLoader().loadAsync(file);
   if(!data.animations.length)throw new Error('No animation: '+file);
   return AnimationClip.toJSON(data.animations[0]);
  },source);
  item.source=source;item.file=`assets/clips/${item.id}.json`;
  fs.writeFileSync(path.join(__dirname,item.file),JSON.stringify(json));
  console.log(item.id,json.duration,fs.statSync(path.join(__dirname,item.file)).size);
 }
 fs.writeFileSync(path.join(__dirname,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
