from pathlib import Path
from PIL import Image, ImageDraw
from collections import deque
import json
ROOT=Path(__file__).resolve().parent
CROPS={'g1':{'hero':[85,210,520,735],'waiting':[930,420,1160,690]},'g2':{'hero':[55,180,495,735],'waiting':[900,455,1130,725]},'g3':{'hero':[85,265,590,765],'waiting':[965,455,1195,680]}}
def matte(im):
    im=Image.alpha_composite(Image.new('RGBA',im.size,'#f4f2ed'),im.convert('RGBA')).convert('RGB');w,h=im.size;px=im.load();ink=set((x,y)for y in range(h)for x in range(w)if min(px[x,y])<150)
    seen=set();holes=[]
    for y in range(h):
      for x in range(w):
        if (x,y)in ink or (x,y)in seen:continue
        q=deque([(x,y)]);seen.add((x,y));group=[];edge=False
        while q:
          a,b=q.popleft();group.append((a,b));edge|=a==0 or b==0 or a==w-1 or b==h-1
          for n in [(a-1,b),(a+1,b),(a,b-1),(a,b+1)]:
            if 0<=n[0]<w and 0<=n[1]<h and n not in ink and n not in seen:seen.add(n);q.append(n)
        if not edge:holes.append(group)
    handle=max(holes,key=len)
    for hole in holes:
      if hole is not handle:ink.update(hole)
    alpha=Image.new('L',(w,h));ap=alpha.load()
    for x,y in ink:ap[x,y]=255
    out=im.convert('RGBA');out.putalpha(alpha);bbox=alpha.getbbox();return out.crop(bbox),{'handle_hole_pixels':len(handle),'trim_bbox':bbox}
def main():
    report={}
    for g,regions in CROPS.items():
      sheet=Image.open(ROOT/f'sheets/{g}.png')
      report[g]={}
      for role,box in regions.items():
        raw=sheet.crop(box);raw.save(ROOT/f'assets/{g}-{role}-crop.png')
        cut,detail=matte(raw);cut.save(ROOT/f'assets/{g}-{role}.png');report[g][role]={'sheet':f'sheets/{g}.png','crop':box,**detail}
      hero=Image.open(ROOT/f'assets/{g}-hero.png');sil=Image.new('RGBA',hero.size,'#111110');sil.putalpha(hero.getchannel('A'));sil.save(ROOT/f'assets/{g}-silhouette.png')
    (ROOT/'evidence/crops.json').write_text(json.dumps(report,indent=2))
if __name__=='__main__':main()
