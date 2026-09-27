const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=__dirname;
(async()=>{const b=await chromium.launch();const p=await b.newPage({deviceScaleFactor:1});const renders=[];
try{for(const key of ['k1','k2']){
 for(const size of [16,24,48,96])for(const [bg,color]of[['paper','#f4f2ed'],['white','#ffffff']]){
  const source=`mark/${key}.svg`,file=`sizes/${key}-${bg}-${size}.png`,svg=fs.readFileSync(path.join(root,source),'utf8');
  await p.setViewportSize({width:size,height:size});await p.setContent(`<style>html,body{margin:0;background:${color}}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);await p.screenshot({path:path.join(root,file)});renders.push({file,source,size,background:color});
 }
 for(const mode of ['light','dark']){
  const source=`mark/${key}-icon-${mode}.svg`,file=`sizes/${key}-icon-${mode}.png`,svg=fs.readFileSync(path.join(root,source),'utf8');
  await p.setViewportSize({width:60,height:60});await p.setContent(`<style>html,body{margin:0;background:transparent}svg{width:60px;height:60px;display:block}</style>${svg}`);await p.screenshot({path:path.join(root,file),omitBackground:true});renders.push({file,source,size:60,background:'transparent'});
 }
}for(const r of renders)r.source_sha256=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,r.source))).digest('hex');fs.writeFileSync(path.join(root,'evidence/mark-renders.json'),JSON.stringify({browser:b.version(),deviceScaleFactor:1,renders},null,2));console.log(`Rendered ${renders.length} SVG size/icon PNGs`)}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
