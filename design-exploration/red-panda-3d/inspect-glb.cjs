const fs=require('node:fs');
const crypto=require('node:crypto');
const file=process.argv[2];
const b=fs.readFileSync(file);
if(b.readUInt32LE(0)!==0x46546c67)throw new Error('Not a GLB');
const j=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());
let faces=0;
for(const m of j.meshes||[])for(const p of m.primitives){if((p.mode??4)!==4)throw new Error('Non-triangle primitive');faces+=(p.indices!==undefined?j.accessors[p.indices].count:j.accessors[p.attributes.POSITION].count)/3;}
const report={file,sha256:crypto.createHash('sha256').update(b).digest('hex'),bytes:b.length,face_count:faces,face_count_source:'Sum of triangle index accessor counts / 3 in downloaded GLB',rig_limit:300000,rig_limit_passed:faces<=300000,textured:(j.materials||[]).some(m=>m.pbrMetallicRoughness?.baseColorTexture!==undefined),skins:(j.skins||[]).map(s=>({joints:s.joints.length})),animations:(j.animations||[]).map(a=>({name:a.name,channels:a.channels.length})),extensions:j.extensionsUsed||[]};
console.log(JSON.stringify(report,null,2));
if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify(report,null,2));
