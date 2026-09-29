"""Convert the existing v5 SVG geometry into editable Rive shapes; author a motion trial."""
from pathlib import Path
import xml.etree.ElementTree as E
import re, math, subprocess, json, shutil, copy
HERE = Path(__file__).resolve().parent
SOURCE = HERE.parent / 'red-panda-rig-2026-09-26/index.html'
# Only evaluate the declarations needed to reproduce the saved SVG, never its DOM driver.
html = SOURCE.read_text(); start = html.index('const C ='); end = html.index('\n}', html.index('function pandaMarkup')) + 2
markup = subprocess.check_output(['node', '-e', html[start:end] + '\nconsole.log(pandaMarkup("rive"));'], text=True)
svg = E.fromstring('<svg>' + markup + '</svg>')
(HERE / 'source-v5.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 460">' + markup + '</svg>')
seq = 1000
parts = {}
clips = {}
def el(tag, parent=None, **attrs):
    global seq
    seq += 1
    attrs.setdefault('id', f'0:{seq}')
    node = E.Element(tag, {k: str(v) for k, v in attrs.items()})
    if parent is not None: parent.append(node)
    return node
def color(value):
    s = value.lstrip('#')
    if len(s) == 3: s = ''.join(c*2 for c in s)
    return 'FF' + s.upper()
def paint(shape, fill, stroke=None, width=1, cap='butt', join='miter'):
    if fill and fill != 'none': el('SolidColor', el('Fill', shape), colorValue=color(fill))
    if stroke and stroke != 'none': el('SolidColor', el('Stroke', shape, thickness=width, cap=cap, join=join), colorValue=color(stroke))
def path(parent, d):
    ts = re.findall(r'[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?', d)
    i=0; cur=0j; command=None; prev_ctrl=None; verts=[]; contours=[]
    def add(p, c1=None, c2=None):
        if c1 is not None: verts[-1]['out']=c1
        verts.append({'p':p, 'in':c2})
    while i < len(ts):
        if ts[i].isalpha(): command=ts[i]; i+=1
        op=command.upper(); relative=command.islower()
        if op=='Z':
            if abs(verts[-1]['p']-verts[0]['p'])<1e-6:
                verts[0]['in']=verts[-1].get('in'); verts.pop()
            contours.append((verts,True)); cur=verts[0]['p']; verts=[]; prev_ctrl=None; command=None; continue
        count={'M':2,'L':2,'H':1,'V':1,'C':6,'S':4,'Q':4}[op]
        nums=list(map(float,ts[i:i+count]));i+=count
        def pt(a,b): return complex(a,b)+(cur if relative else 0)
        if op=='M':
            if verts: contours.append((verts,False))
            cur=pt(*nums);verts=[{'p':cur}];command='l' if relative else 'L';prev_ctrl=None;continue
        if op=='L': target=pt(*nums);add(target);prev_ctrl=None
        elif op=='H': target=complex(nums[0]+(cur.real if relative else 0),cur.imag);add(target);prev_ctrl=None
        elif op=='V': target=complex(cur.real,nums[0]+(cur.imag if relative else 0));add(target);prev_ctrl=None
        elif op=='C':
            c1=pt(*nums[:2]);c2=pt(*nums[2:4]);target=pt(*nums[4:]);add(target,c1,c2);prev_ctrl=c2
        elif op=='S':
            c1=2*cur-prev_ctrl if prev_ctrl is not None else cur;c2=pt(*nums[:2]);target=pt(*nums[2:]);add(target,c1,c2);prev_ctrl=c2
        elif op=='Q':
            q=pt(*nums[:2]);target=pt(*nums[2:]);add(target,cur+(q-cur)*2/3,target+(q-target)*2/3);prev_ctrl=None
        cur=target
    if verts: contours.append((verts,False))
    for vertices,closed in contours:
        pp=el('PointsPath',parent,isClosed=str(closed).lower())
        for v in vertices:
            p=v['p']; attrs={'x':round(p.real,5),'y':round(p.imag,5)}
            if v.get('in') is not None or v.get('out') is not None:
                for key in ['in','out']:
                    handle=v.get(key); delta=handle-p if handle is not None else 0j
                    attrs[key+'Rotation']=round(math.atan2(delta.imag,delta.real),7)
                    attrs[key+'Distance']=round(abs(delta),5)
                el('CubicDetachedVertex',pp,**attrs)
            else: el('StraightVertex',pp,**attrs)
def geometry(src,parent):
    a=src.attrib; tag=src.tag
    if tag=='path': path(parent,a['d'])
    elif tag in ['ellipse','circle']:
        rx=float(a.get('rx',a.get('r',0)));ry=float(a.get('ry',a.get('r',0)))
        el('Ellipse',parent,x=a.get('cx',0),y=a.get('cy',0),width=rx*2,height=ry*2)
    elif tag=='rect': el('Rectangle',parent,x=a.get('x',0),y=a.get('y',0),originX=0,originY=0,width=a['width'],height=a['height'],cornerRadiusTL=a.get('rx',0))
    else: raise ValueError(tag)
PIVOTS={'root':(200,420),'bodyG':(200,260),'earL':(118,92),'earR':(282,92),'ribbon':(322,112)}
def convert(src,parent,style=None,active_clips=()):
    style=dict(style or {'fill':'#000'});a=src.attrib
    for k in ['fill','stroke','stroke-width','stroke-linecap','stroke-linejoin']:
        if k in a:style[k]=a[k]
    if src.tag=='defs':
        for ch in src: convert(ch,parent,style)
        return
    if src.tag=='clipPath':
        clips[a['id']]=list(src)
        return
    clip=a.get('clip-path')
    if clip: active_clips=active_clips+(clip[5:-1],)
    part=a.get('data-part');name=part or a.get('data-face') or src.tag
    if src.tag=='g':
        attrs={'name':name}
        transform=a.get('transform','')
        if transform.startswith('translate'):
            xy=re.findall(r'[-\d.]+',transform);attrs.update(x=xy[0],y=xy[1] if len(xy)>1 else 0)
        elif transform.startswith('matrix'):
            assert transform=='matrix(-1 0 0 1 400 0)';attrs.update(x=400,scaleX=-1)
        bone=part in PIVOTS or part in ['tail','armL','armR']
        if part=='tail': attrs.update(x=292,y=372,rotation=math.radians(26))
        if part in PIVOTS: attrs.update(x=PIVOTS[part][0],y=PIVOTS[part][1])
        if part in ['armL','armR']:attrs['rotation']=math.radians(10 if part=='armL' else -10)
        if bone:attrs['length']=30
        if a.get('style')=='display:none' or a.get('data-face') in ['laugh','oh','frown']:attrs['opacity']=0
        if part and part.startswith('lid'):attrs['opacity']=0
        node=el('RootBone' if bone else 'Node',parent,**attrs)
        if part: parts[part]=node.attrib['id']
        if a.get('data-face'):parts[a['data-face']]=node.attrib['id']
        content=node
        if part in PIVOTS:content=el('Node',node,x=-PIVOTS[part][0],y=-PIVOTS[part][1])
        if part in ['eyeOpenL','eyeOpenR']:
            x=158 if part.endswith('L') else 242
            node.set('x',str(x));node.set('y','178');content=el('Node',node,x=-x,y=-178)
        for ch in src:
            if ch.tag in ['defs','clipPath']:convert(ch,content,style,active_clips)
        for ch in reversed(list(src)):
            if ch.tag not in ['defs','clipPath']:convert(ch,content,style,active_clips)
        return
    shape=el('Shape',parent,name=name,opacity=0 if a.get('data-face') in ['happy','oh','frown'] else 1)
    if part:parts[part]=shape.attrib['id']
    if a.get('data-face'):parts.setdefault(a['data-face'],[])
    if a.get('data-face')=='smile':parts['smile']=shape.attrib['id']
    geometry(src,shape)
    paint(shape,style.get('fill'),style.get('stroke'),style.get('stroke-width',1),style.get('stroke-linecap','butt'),style.get('stroke-linejoin','miter'))
    for clip in active_clips:
        mask=el('Shape',parent,name='Mask '+clip)
        for geometry_source in clips[clip]:geometry(geometry_source,mask)
        el('ClippingShape',shape,sourceId=mask.attrib['id'])
root=E.Element('Rive',version='1',kind='fragment')
art=el('Artboard',root,name='Panda trial',width=480,height=600,styleId='0:2',defaultStateMachineId='0:3',viewModelId='0:4',viewModelInstanceId='0:5',id='0:1')
el('LayoutComponentStyle',art,id='0:2')
el('SolidColor',el('Fill',art),colorValue='FFFAF4EB')
# Controls are above the illustration in draw order.
def text(parent,content,x,y,size,ink='#46241a'):
    node=el('Text',parent,x=x,y=y,originX=.5,name=content)
    style=el('TextStylePaint',node,fontSize=size,fontAssetId='0:6')
    el('SolidColor',el('Fill',style),colorValue=color(ink))
    el('TextValueRun',node,text=content,styleId=style.attrib['id'])
text(art,'PANDA / RIVE',240,26,14)
text(art,'Tap the panda. Watch it react.',240,455,19)
text(art,'v5 artwork • interactive motion study',240,566,12,'#876b5a')
def button(label,x,fill,ink):
    text(art,label,x,516,17,ink)
    shape=el('Shape',art,x=x,y=531,name=label)
    el('Rectangle',shape,width=166,height=48,cornerRadiusTL=16)
    paint(shape,fill)
    return shape.attrib['id']
wave_button=button('Wave',148,'#FF7A1F','#46241a')
tap_button=button('Tap reaction',332,'#EEDFD0','#46241a')
hit=el('Shape',art,x=240,y=268,name='Panda tap area')
el('Rectangle',hit,width=310,height=385,cornerRadiusTL=70);paint(hit,'#FAF4EB');hit.set('opacity','0.001')
container=el('Node',art,x=70,y=60,scaleX=.85,scaleY=.85,name='Panda')
# Shared masks live in the same transformed space as the original artwork.
for c in svg:
    if c.tag=='defs':convert(c,container)
for c in svg:
    if c.tag!='defs':convert(c,container)
sm=el('StateMachine',art,name='Panda',id='0:3')
def listener(target,prop,name):
    l=el('StateMachineListenerSingle',sm,targetId=target,listenerTypeValue='click',name=name)
    b=el('BindablePropertyTrigger',el('ListenerViewModelChange',l),propertyValue=1)
    el('DataBindContext',b,sourcePathIds=f'0:4-{prop}',propertyKey=686,direction='true')
listener(wave_button,'0:7','Wave button');listener(tap_button,'0:8','Tap button');listener(hit.attrib['id'],'0:8','Panda tap')
layer=el('StateMachineLayer',sm,name='Reactions')
el('AnyState',layer,x=0,y=-160);el('ExitState',layer,x=650,y=-160)
entry=el('EntryState',layer,x=0,y=0);el('StateTransition',entry,stateToId='0:20')
idle=el('AnimationState',layer,id='0:20',animationId='0:30',x=200,y=0)
wave=el('AnimationState',layer,id='0:21',animationId='0:31',x=450,y=-100,reset='true')
tap=el('AnimationState',layer,id='0:22',animationId='0:32',x=450,y=140,reset='true')
def transition(source,target,prop):
    tr=el('StateTransition',source,stateToId=target,duration=140)
    condition=el('TransitionViewModelCondition',tr)
    bind=el('BindablePropertyTrigger',el('TransitionPropertyViewModelComparator',condition))
    el('DataBindContext',bind,sourcePathIds=f'0:4-{prop}',propertyKey=686)
    el('TransitionValueTriggerComparator',condition)
transition(idle,'0:21','0:7');transition(idle,'0:22','0:8');transition(wave,'0:22','0:8')
for state,label in [(idle,'idle'),(wave,'wave'),(tap,'tap')]:
    b=el('BindablePropertyString',el('ListenerViewModelChange',state),propertyValue=label)
    el('DataBindContext',b,sourcePathIds='0:4-0:9',propertyKey=635,direction='true')
for state in [wave,tap]:el('StateTransition',state,stateToId='0:20',duration=180,enableExitTime='true',exitTimeIsPercetange='true',exitTime=100)
def timeline(name,id,duration,loop=False):return el('LinearAnimation',art,name=name,id=id,duration=duration,loopValue='loop' if loop else 'oneShot')
def keys(anim,part,key,values):
    obj=el('KeyedObject',anim,objectId=parts[part]);kp=el('KeyedProperty',obj,propertyKey=key)
    for frame,value in values:
        keyframe=el('KeyFrameDouble',kp,frame=frame,value=round(value,6),interpolationType='cubic')
        el('CubicEaseInterpolator',keyframe,x1=.42,y1=0,x2=.58,y2=1)
def angle(anim,part,values):keys(anim,part,15,[(t,math.radians(v)) for t,v in values])
idle_a=timeline('Idle','0:30',240,True)
for part,key,values in [
 ('root',16,[(0,1),(60,1.008),(120,1),(180,1.008),(240,1)]),
 ('root',17,[(0,1),(60,.988),(120,1),(180,.988),(240,1)]),
 ('root',91,[(0,420),(240,420)]),
 ('palmL',18,[(0,0)]),('laugh',18,[(0,0)]),('smile',18,[(0,1)])]:keys(idle_a,part,key,values)
for part in ['eyeOpenL','eyeOpenR']:keys(idle_a,part,17,[(0,1),(83,1),(88,.06),(93,1),(207,1),(212,.06),(217,1),(240,1)])
for part,vals in [('root',[(0,0),(240,0)]),('tail',[(0,22),(60,30),(120,22),(180,30),(240,22)]),('armL',[(0,10),(120,7),(240,10)]),('armR',[(0,-10),(120,-7),(240,-10)])]:angle(idle_a,part,vals)
wave_a=timeline('Wave','0:31',150)
for part,vals in [('armL',[(0,10),(22,145),(34,132),(46,155),(58,133),(70,155),(82,135),(96,148),(120,20),(150,10)]),('armR',[(0,-10),(40,-18),(100,-18),(150,-10)]),('root',[(0,0),(26,3),(105,3),(150,0)]),('tail',[(0,22),(25,34),(65,23),(100,32),(150,22)])]:angle(wave_a,part,vals)
for part,key,vals in [('palmL',18,[(0,0),(16,0),(22,1),(115,1),(130,0),(150,0)]),('root',17,[(0,1),(18,.975),(34,1.014),(110,1.014),(150,1)]),('root',16,[(0,1),(18,1.02),(34,.994),(110,.994),(150,1)]),('root',91,[(0,420),(150,420)]),('laugh',18,[(0,0),(24,1),(112,1),(150,0)]),('smile',18,[(0,1),(24,0),(112,0),(150,1)])]:keys(wave_a,part,key,vals)
for part in ['eyeOpenL','eyeOpenR']:keys(wave_a,part,17,[(0,1),(44,1),(48,.08),(53,1),(150,1)])
tap_a=timeline('Tap','0:32',66)
for part,vals in [('root',[(0,0),(8,-4),(20,4),(32,-2),(46,1),(66,0)]),('armL',[(0,10),(10,34),(24,16),(66,10)]),('armR',[(0,-10),(10,-34),(24,-16),(66,-10)]),('tail',[(0,22),(12,40),(26,16),(42,28),(66,22)])]:angle(tap_a,part,vals)
for part,key,vals in [('root',17,[(0,1),(8,.92),(18,1.04),(32,.99),(66,1)]),('root',16,[(0,1),(8,1.06),(18,.97),(32,1.01),(66,1)]),('root',91,[(0,420),(8,420),(18,407),(32,420),(66,420)]),('laugh',18,[(0,0),(8,1),(40,1),(66,0)]),('smile',18,[(0,1),(8,0),(40,0),(66,1)]),('palmL',18,[(0,0),(66,0)])]:keys(tap_a,part,key,vals)
for part in ['eyeOpenL','eyeOpenR']:keys(tap_a,part,17,[(0,1),(8,.08),(16,.08),(24,1),(66,1)])
vm=el('ViewModel',root,id='0:4',name='Panda',defaultInstanceId='0:5')
el('ViewModelPropertyTrigger',vm,id='0:7',name='wave');el('ViewModelPropertyTrigger',vm,id='0:8',name='tap')
el('ViewModelPropertyString',vm,id='0:9',name='state')
inst=el('ViewModelInstance',vm,id='0:5',name='Default',exports='true')
el('ViewModelInstanceTrigger',inst,viewModelPropertyId='0:7');el('ViewModelInstanceTrigger',inst,viewModelPropertyId='0:8')
el('ViewModelInstanceString',inst,viewModelPropertyId='0:9',propertyValue='idle')
assets=HERE/'assets';assets.mkdir(exist_ok=True)
shutil.copy(HERE.parents[1]/'prototype-fresh/assets/fonts/Inter-variable.ttf',assets/'Inter.ttf')
shutil.copy(HERE.parents[1]/'prototype-fresh/assets/fonts/inter-OFL.txt',assets/'inter-OFL.txt')
el('FontAsset',root,file='assets/Inter.ttf',id='0:6',name='Inter')
E.indent(root)
E.ElementTree(root).write(HERE/'scene.rml',encoding='unicode')
(HERE/'parts.json').write_text(json.dumps(parts,indent=2))
print('Wrote editable RML from existing v5 geometry. Parts:',len(parts))

mascot=copy.deepcopy(root)
ma=mascot.find('Artboard');ma.set('name','Red Panda');ma.set('width','480');ma.set('height','500')
for child in list(ma):
    if child.tag in ['Text','Fill'] or (child.tag=='Shape' and child.get('name')!='Panda tap area'):ma.remove(child)
    if child.tag=='Node' and child.get('name')=='Panda':
        child.set('x','40');child.set('y','20');child.set('scaleX','1');child.set('scaleY','1')
    if child.get('name')=='Panda tap area':child.set('x','240');child.set('y','250');child.set('opacity','0')
ms=ma.find('StateMachine')
for listener in list(ms):
    if listener.tag=='StateMachineListenerSingle' and listener.get('name')!='Panda tap':ms.remove(listener)
for child in list(mascot):
    if child.tag=='FontAsset':mascot.remove(child)
asset_project=HERE/'mascot';asset_project.mkdir(exist_ok=True)
E.indent(mascot);E.ElementTree(mascot).write(asset_project/'scene.rml',encoding='unicode')
(asset_project/'rive.yaml').write_text('name: red-panda\nmain: Red Panda\n')
