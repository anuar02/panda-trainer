"""Deterministic, hand-authored vector masters. No raster tracing or generated marks."""
from pathlib import Path
import math, json
ROOT=Path(__file__).resolve().parent
BLUE='#2b48d6'; INK='#111110'

def smooth(points):
    if len(points)==2:
        a,b=points
        return [(a[0]+(b[0]-a[0])*t/24,a[1]+(b[1]-a[1])*t/24) for t in range(25)]
    out=[]
    for i in range(len(points)-1):
        p0,p1,p2,p3=points[max(0,i-1)],points[i],points[i+1],points[min(len(points)-1,i+2)]
        for j in range(16):
            t=j/16
            out.append(tuple(.5*((2*p1[k])+(-p0[k]+p2[k])*t+(2*p0[k]-5*p1[k]+4*p2[k]-p3[k])*t*t+(-p0[k]+3*p1[k]-3*p2[k]+p3[k])*t*t*t) for k in [0,1]))
    return out+[points[-1]]

def stroke(points,style='ballpoint',width=None,color='currentColor'):
    pts=smooth(points);w=width or {'ballpoint':1.75,'nib':1.9,'marker':3}[style]
    if style=='ballpoint':
        d='M'+' L'.join(f'{x:.2f} {y:.2f}' for x,y in pts)
        return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"/>'
    sides=[[],[]]
    for i,(x,y) in enumerate(pts):
        prev,nxt=pts[max(0,i-1)],pts[min(len(pts)-1,i+1)]
        dx,dy=nxt[0]-prev[0],nxt[1]-prev[1];l=math.hypot(dx,dy) or 1;t=i/(len(pts)-1)
        weight=(.18+.92*math.sin(math.pi*t)**.4)*(.88+.18*math.sin(t*8)) if style=='nib' else .97+.05*math.sin(i*1.6)+.035*math.cos(i*.7)
        half=w*weight/2
        sides[0].append((x-dy/l*half,y+dx/l*half));sides[1].append((x+dy/l*half,y-dx/l*half))
    d='M'+' L'.join(f'{x:.2f} {y:.2f}' for x,y in sides[0]+sides[1][::-1])+'Z'
    return f'<path d="{d}" fill="{color}"/>'

def svg(w,h,body,color=BLUE,title=''):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" style="color:{color}" role="img"><title>{title}</title>{body}</svg>'
# Single-line Cyrillic lettering, each glyph authored as open paths; no font dependency.
GLYPHS={
'д':[[(1,13),(3,5),(8,5),(8,13)],[(0,17),(0,13),(10,13),(10,17)]],
'е':[[(1,9),(8,9),(7,5),(3,5),(1,9),(2,13),(7,13),(9,11)]],
'р':[[(1,19),(2,5),(2,8),(5,5),(8,6),(8,11),(5,13),(2,12)]],
'ж':[[(0,5),(4,9),(0,13)],[(5,4),(5,14)],[(10,5),(6,9),(10,13)]],
'и':[[(1,5),(1,12),(3,13),(8,5),(8,13),(10,12)]],
'с':[[(9,6),(6,5),(2,7),(1,11),(4,13),(8,12)]],
'п':[[(1,13),(2,5),(8,5),(8,13),(10,12)]],
'н':[[(1,5),(1,13)],[(8,5),(8,13)],[(1,9),(8,9)]],
'у':[[(1,5),(3,12),(7,9)],[(9,5),(6,17),(3,19),(1,17)]],
'в':[[(2,13),(3,3),(7,1),(9,3),(7,6),(3,8),(8,7),(10,10),(8,13),(2,13)]],
'л':[[(0,13),(3,12),(5,5),(8,5),(9,13)]],
'щ':[[(1,5),(1,13),(5,13),(5,5)],[(5,13),(9,13),(9,5)],[(9,13),(11,13),(11,17)]],
'й':[[(1,5),(1,12),(3,13),(8,5),(8,13),(10,12)],[(3,1),(5,3),(8,1)]],
'а':[[(8,6),(4,5),(1,9),(2,13),(5,12),(8,6),(8,13),(10,12)]],
'з':[[(1,6),(5,5),(8,7),(5,9),(8,11),(5,14),(1,13)]],
'т':[[(0,5),(10,5)],[(5,5),(5,13)]],
'2':[[(1,5),(3,2),(8,2),(9,5),(2,13),(9,13)]],
'5':[[(9,2),(2,2),(1,8),(6,7),(9,9),(8,13),(3,14),(1,12)]],
',':[[(4,13),(2,17)]],
'+':[[(1,8),(9,8)],[(5,4),(5,12)]],
'ю':[[(0,5),(0,13)],[(0,9),(4,9)],[(8,5),(5,6),(4,10),(6,13),(9,12),(10,8),(8,5)]],
' ':[]}
def writing(text,style):
    out=[];x=3
    for ch in text:
        for pts in GLYPHS[ch]:out.append(stroke([(px+x+py*.08,py+2)for px,py in pts],style,width={'ballpoint':1.35,'nib':1.55,'marker':2.2}[style]))
        x+=7 if ch==' ' else 11
    return x+4,24,''.join(out)

def make():
    assets=[]
    circle=[(34+29*math.cos(t),21+17*math.sin(t)) for t in [i*2*math.pi/30 for i in range(31)]]
    marks={
    'check':(24,24,[[(4,12),(9,18),(19,5)]]),
    'circle':(68,42,[circle]),
    'underline':(122,12,[[(3,7),(35,6),(78,8),(119,5)]]),
    'arrow':(48,24,[[(3,19),(19,16),(32,9),(42,5)],[(32,4),(43,4),(41,14)]]),
    'bracket':(18,74,[[(14,3),(7,5),(8,30),(3,37),(8,43),(7,68),(14,71)]]),
    'asterisk':(24,24,[[(12,3),(11,21)],[(3,8),(21,16)],[(4,18),(20,5)]]),
    }
    for style in ['ballpoint','nib','marker']:
        folder=ROOT/'marks'/style;folder.mkdir(parents=True,exist_ok=True)
        for name,(w,h,paths) in marks.items():
            body=''.join(stroke(p,style) for p in paths)
            if name=='arrow':
                _,_,label=writing('+2,5',style);body+='<g transform="translate(47 0)">'+label+'</g>';w=108
            if style=='marker':body='<g opacity=".9">'+body+'</g>'
            (folder/(name+'.svg')).write_text(svg(w,h,body,title=name))
        for name,text in [('note-spine','держи спину'),('note-next','+2,5 в следующий раз')]:
            w,h,body=writing(text,style)
            if style=='marker':body='<g opacity=".9">'+body+'</g>'
            (folder/(name+'.svg')).write_text(svg(w,h,body,title=text))
        assets.append({'id':style,'marks':list(marks)+['note-spine','note-next']})
    logos={
    'b1-hand':stroke([(24,25),(43,44),(68,70)],width=9)+stroke([(78,19),(55,48),(24,79)],width=9),
    'b2-dual':stroke([(25,25),(74,74)],width=9)+stroke([(76,24),(25,75)],width=9,color=BLUE),
    'b3-type':'<path fill="currentColor" d="M28 20 50 42 72 20 80 28 58 50 80 72 72 80 50 58 28 80 20 72 42 50 20 28Z"/>',
    'c1-strict':''.join(stroke([(x,23),(x,77)],width=7)for x in[26,42,58,74])+stroke([(15,68),(85,32)],width=7),
    'c2-hand':''.join(stroke(p,width=6.8)for p in[[(24,24),(26,48),(25,77)],[(41,20),(42,46),(44,76)],[(58,22),(57,49),(59,79)],[(75,25),(74,48),(76,75)]])+stroke([(14,69),(44,52),(86,30)],width=7,color=BLUE)
    }
    for name,body in logos.items():(ROOT/'logos'/f'{name}.svg').write_text(svg(100,100,body,INK,name))
    (ROOT/'evidence/vector-assets.json').write_text(json.dumps({'marks':assets,'logos':list(logos),'hand_authored':True},indent=2))
if __name__=='__main__':make()
