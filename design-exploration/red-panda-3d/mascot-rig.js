// Viewer-side correction for this specific Meshy mascot. The raw GLB is preserved.
// Auto-rig assigned much of the oversized head to the raised right shoulder.
export function preserveMascotHead(model){
  const report=[];
  model.traverse(mesh=>{
    if(!mesh.isSkinnedMesh)return;
    const position=mesh.geometry.getAttribute('position');
    const indices=mesh.geometry.getAttribute('skinIndex');
    const weights=mesh.geometry.getAttribute('skinWeight');
    const head=mesh.skeleton.bones.findIndex(b=>b.name==='Head');
    if(head<0)return;
    let corrected=0;
    for(let i=0;i<position.count;i++){
      // Source geometry is 0.9773 m tall. Tail is on +X and stays outside this mask.
      const x=position.getX(i),y=position.getY(i);
      if(y>.555 && (x<.255 || y>.68)){
        indices.setXYZW(i,head,0,0,0);weights.setXYZW(i,1,0,0,0);corrected++;
      }
    }
    indices.needsUpdate=true;weights.needsUpdate=true;
    report.push({mesh:mesh.name,headVertices:corrected});
  });
  return report;
}
