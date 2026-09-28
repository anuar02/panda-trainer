const { chromium }=require('@playwright/test');
const fs=require('node:fs');
const baseURL=process.env.BASE_URL||'http://127.0.0.1:4187';
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:390,height:844}});await p.goto(`${baseURL}/?visual=instrument`);const issues=[];
for(const screen of ['t-today','t-schedule','t-new','t-inbox','t-clients','t-client','t-library','t-billing','t-profile','t-session','c-home','c-program','c-history','c-progress','c-profile','c-first']){
await p.evaluate(screen=>{Store.set({role:screen[0]==='t'?'trainer':'client',screen,scenario:'normal',sheet:null});if(screen==='t-session')Store.logging.open('s1');},screen);
const low=await p.evaluate(()=>{
 const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d',{willReadFrequently:true});
 const rgba=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);const v=[...ctx.getImageData(0,0,1,1).data];return [v[0]/255,v[1]/255,v[2]/255,v[3]/255];};
 const over=(a,b)=>[0,1,2].map(i=>a[i]*a[3]+b[i]*(1-a[3])).concat(1);
 const lum=c=>c.slice(0,3).reduce((n,v,i)=>n+(v<=.04045?v/12.92:((v+.055)/1.055)**2.4)*[.2126,.7152,.0722][i],0);
 const bg=el=>{const chain=[];for(let n=el;n;n=n.parentElement)chain.unshift(n);let color=[1,1,1,1];for(const n of chain){const cs=getComputedStyle(n);if(cs.backgroundImage!=='none')return null;color=over(rgba(cs.backgroundColor),color);}return color;};
 return [...document.querySelectorAll('#screen *')].filter(e=>e.getBoundingClientRect().width>0&&!e.closest('[disabled],.sr-only,svg')&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).flatMap(e=>{const cs=getComputedStyle(e),back=bg(e);if(!back||cs.visibility==='hidden')return [];const color=over(rgba(cs.color),back),a=lum(color),b=lum(back),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);const large=parseFloat(cs.fontSize)>=24||(parseFloat(cs.fontSize)>=18.66&&Number(cs.fontWeight)>=700);if(ratio+0.05>=(large?3:4.5))return [];return [{text:e.textContent.trim().slice(0,75),class:e.className,ratio:+ratio.toFixed(2),foreground:cs.color,background:back.slice(0,3).map(v=>Math.round(v*255))}];});
});if(low.length)issues.push({screen,low});}
fs.writeFileSync(__dirname+'/contrast.json',JSON.stringify(issues,null,2));console.log(JSON.stringify(issues,null,2));await b.close();})();
