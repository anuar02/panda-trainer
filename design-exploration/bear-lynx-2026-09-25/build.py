#!/usr/bin/env python3
"""Rebuild saved-image crops, Lanczos proofs, overlays, comparison and provenance."""
from pathlib import Path
from collections import deque
from PIL import Image,ImageDraw,ImageChops
import json,hashlib,html
ROOT=Path(__file__).resolve().parent;REPO=ROOT.parents[1]
PAPER='#f4f2ed';INK='#111110';LANCZOS=Image.Resampling.LANCZOS
META={};CROP_REPORT={}
POSES=[('hello','Привет','Стоит и машет лапой; гиря рядом.'),('swing','Тренируемся','Две лапы на ручке, гиря поднята перед корпусом.'),('rest','Отдых','Сидит рядом с гирей, глаза закрыты.'),('wait','Ждём','Сидит, наклонив голову; лапа лежит на ручке гири.')]
CHARACTERS=[('b','B','Медведь','Круглые уши, широкое тело, светлая морда и живот.'),('l','L','Рысь','Кисточки ушей, угловатые щёки и короткий хвост; без пятен.')]
BOXES={'hello':(60,5,495,447),'swing':(600,5,1000,447),'rest':(1070,65,1495,447),'wait':(65,500,495,932),'silhouette':(625,500,915,932),'avatar':(1060,500,1480,932)}
HOLES={'hello':(418,350),'swing':(919,164),'rest':(1421,346),'wait':(425,810)}
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def jwrite(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
def record(file,method,inputs,**kw):META[file]={'method':method,'inputs':[{'file':p,'sha256':sha(ROOT/p)}for p in inputs],**kw}
def save(im,file,method,inputs,**kw):im.save(ROOT/file);record(file,method,inputs,**kw)
def fit(im,n):
 ratio=min(n/im.width,n/im.height);return im.resize((round(im.width*ratio),round(im.height*ratio)),LANCZOS)
def matte(raw,hole=None):
 im=Image.alpha_composite(Image.new('RGBA',raw.size,PAPER),raw.convert('RGBA')).convert('RGB');w,h=im.size;px=im.load()
 dark={(x,y)for y in range(h)for x in range(w)if min(px[x,y])<160};seen=set();clear=set();hole_area=0
 for y in range(h):
  for x in range(w):
   if (x,y)in dark or (x,y)in seen:continue
   q=deque([(x,y)]);seen.add((x,y));group=[];edge=False
   while q:
    a,b=q.popleft();group.append((a,b));edge|=a==0 or b==0 or a==w-1 or b==h-1
    for c,d in[(a-1,b),(a+1,b),(a,b-1),(a,b+1)]:
     if 0<=c<w and 0<=d<h and (c,d)not in dark and (c,d)not in seen:seen.add((c,d));q.append((c,d))
   if edge or hole in group:clear.update(group)
   if hole in group:hole_area=len(group)
 alpha=Image.new('L',(w,h),255);ap=alpha.load()
 for a,b in clear:ap[a,b]=0
 out=im.convert('RGBA');out.putalpha(alpha);bbox=alpha.getbbox()
 return out.crop(bbox),{'trim_bbox':bbox,'handle_hole_pixels':hole_area}
def crops():
 for key,*_ in CHARACTERS:
  sheet=Image.open(ROOT/f'sheets/{key}.png');assert sheet.size==(1536,1024),sheet.size
  boxes=dict(BOXES);boxes['figure']=(80,5,369,445) if key=='l' else (95,35,369,445);boxes['head']=(169,5,329,170) if key=='l' else (176,38,320,166)
  CROP_REPORT[key]={}
  for role,box in boxes.items():
   src=f'sheets/{key}.png';raw=sheet.crop(box);cropfile=f'assets/{key}-{role}-crop.png';save(raw,cropfile,'Pillow exact crop of generated sheet',[src],box=box)
   hole=HOLES.get(role);hole=(hole[0]-box[0],hole[1]-box[1])if hole else None
   cut,detail=matte(raw,hole)
   save(cut,f'assets/{key}-{role}.png','Background component matting; enclosed face/belly retained, explicit kettle hole opened',[cropfile],**detail)
   CROP_REPORT[key][role]={'source':src,'crop':box,'hole_seed':hole,**detail}
 jwrite(ROOT/'evidence/crops.json',CROP_REPORT)
def proofs():
 measures=[]
 for key,*_ in CHARACTERS:
  for role in ['head','figure']:
   src=f'assets/{key}-{role}.png';im=Image.open(ROOT/src)
   for n in[24,48,96]:
    small=fit(im,n-2);pos=((n-small.width)//2,(n-small.height)//2)
    for bg,col in[('paper',PAPER),('white','#ffffff')]:
     out=Image.new('RGBA',(n,n),col);out.alpha_composite(small,pos)
     save(out.convert('RGB'),f'sizes/{key}-{role}-{bg}-{n}.png','Pillow Lanczos, aspect ratio retained, 1 px margin',[src],pixels=n,background=col)
    mask=Image.new('L',(n,n));mask.paste(small.getchannel('A'),pos);binary=mask.point(lambda a:255 if a>=128 else 0);bbox=binary.getbbox();rows=[]
    for y in range(n):
     runs=[];start=None
     for x in range(n+1):
      active=x<n and bool(binary.getpixel((x,y)))
      if active and start is None:start=x
      if not active and start is not None:runs.append([start,x-1]);start=None
     if runs:rows.append({'y':y,'runs':runs})
    measures.append({'character':key,'role':role,'size':n,'bbox':bbox,'top_nonempty_rows':rows[:6]})
 jwrite(ROOT/'evidence/small-size.json',measures)
 renders=json.loads((ROOT/'evidence/mark-renders.json').read_text())
 for r in renders['renders']:
  assert sha(ROOT/r['source'])==r['source_sha256']
  record(r['file'],'Chromium SVG rasterization at exact dimensions, DPR1',[r['source'],'render-marks.cjs'],size=r['size'],background=r['background'])
 for key in['k1','k2']:
  for mode in['light','dark']:
   src=f'sizes/{key}-icon-{mode}.png';icon=Image.open(ROOT/src).convert('RGBA');assert icon.size==(60,60)
   grid=Image.new('RGB',(260,172),'#ebe9e3');d=ImageDraw.Draw(grid)
   for i in range(6):
    x=16+84*(i%3);y=16+80*(i//3)
    if i==0:grid.paste(icon,(x,y),icon)
    else:d.rounded_rectangle((x,y,x+59,y+59),radius=14,fill=['#c1c0bc','#b7b6b2','#d1d0cc','#aeada9','#dad9d5'][i-1])
   save(grid,f'sizes/{key}-grid-{mode}.png','60 px app icon among five gray placeholders',[src])
def overlays():
 capture=json.loads((ROOT/'evidence/capture.json').read_text());checks=[]
 for name,size,x,y in[('home',52,33,167),('empty-program',110,31,161)]:
  basefile=f'screens/base/{name}.png';clearfile=f'screens/base/{name}-cleared.png';base=Image.open(ROOT/basefile).convert('RGB');clear=Image.open(ROOT/clearfile).convert('RGB')
  removed=ImageChops.difference(base,clear).getbbox();assert removed,'No original illustration removed'
  s=next(s for s in capture['screens'] if s['name']==name)
  protected=[n for n in s['nodes']if n['tag']in ['H1','H2','H3','P','BUTTON']]
  for key,*_ in CHARACTERS:
   asset=f'assets/{key}-wait.png';cut=fit(Image.open(ROOT/asset),size);pos=(x+(size-cut.width)//2,y+(size-cut.height)//2);out=clear.convert('RGBA');out.alpha_composite(cut,pos);out=out.convert('RGB')
   overlay=(pos[0],pos[1],pos[0]+cut.width,pos[1]+cut.height);diff=ImageChops.difference(base,out);outside=diff.copy();draw=ImageDraw.Draw(outside)
   for box in[removed,overlay]:draw.rectangle((box[0],box[1],box[2]-1,box[3]-1),fill=0)
   assert outside.getbbox()is None
   for n in protected:
    r=n['rect'];box=(max(0,int(r['x'])),max(0,int(r['y'])),min(375,int(r['x']+r['width'])),min(844,int(r['y']+r['height'])))
    if box[2]>box[0]and box[3]>box[1]:assert diff.crop(box).getbbox()is None,(name,key,n['text'])
   file=f'screens/{key}-{name}.png';save(out,file,'Replace original empty-state art with one Lanczos-resized waiting pose',[basefile,clearfile,asset],removed_bbox=removed,overlay_bbox=overlay)
   checks.append({'file':file,'mascot_max_size':size,'overlay_bbox':overlay,'removed_art_bbox':removed,'changed_outside_art_and_overlay':0,'protected_text_and_button_rectangles_unchanged':True})
 jwrite(ROOT/'evidence/overlay-verification.json',checks)

CSS='''
:root{font-family:Inter,Arial,sans-serif;background:#f4f2ed;color:#111110;font-synthesis:none}*{box-sizing:border-box}body{margin:0}h1,h2,h3{font-family:Montserrat,Arial,sans-serif;letter-spacing:-.045em}h1{font-size:clamp(40px,5vw,70px);line-height:1.08;margin:18px 0 24px}h2{font-size:32px;margin:12px 0 16px}h3{font-size:22px;margin:8px 0 14px}p{line-height:1.6}header,main,footer{max-width:1120px;margin:auto;padding:0 24px}header{padding-top:56px;padding-bottom:32px}.kicker{font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:#5c5a55}.lead{max-width:770px;font-size:18px}.meta,figcaption{font-size:13px;color:#5c5a55;line-height:1.6}a{color:inherit;text-underline-offset:4px}img{display:block;max-width:100%}nav{display:flex;gap:8px;flex-wrap:wrap;border-block:1px solid #d8d4cc;padding:14px max(24px,calc((100vw - 1072px)/2));background:#f4f2ed}nav a,button{font:inherit;font-size:12px;padding:10px 14px;background:none;border:1px solid #c9c5bb;border-radius:24px;text-decoration:none;cursor:pointer}button[aria-pressed=true]{background:#111110;color:white;border-color:#111110}section{padding:40px 0;border-bottom:1px solid #d8d4cc}.twocol{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}figure{margin:0;min-width:0}.stage{height:340px;padding:20px;display:flex;align-items:flex-end;justify-content:center;background:#ffffff50;border:1px solid #dedbd3;border-radius:12px}.stage>a{display:block;width:100%;height:100%}.stage img{width:100%;height:100%;object-fit:contain;object-position:center bottom}.pose{margin-top:32px}.pose h3{font-size:18px}.species{display:flex;align-items:center;gap:12px;margin-bottom:16px}.species b{font-size:22px}.species span{font-size:11px;letter-spacing:.1em;color:#5c5a55}figcaption{margin:12px 0 8px}.detail-stage{height:240px}.native{display:flex;gap:14px;justify-content:space-between;align-items:flex-end;padding:12px;background:#f4f2ed;min-height:132px;max-width:320px;margin:10px 0}.native.white{background:white;outline:1px solid #e4e1da}.native img{max-width:none}.cell{display:flex;align-items:center;flex-direction:column;gap:8px;font-size:11px;text-decoration:none}.panel{padding:20px;border:1px solid #dedbd3;background:#ffffff75;border-radius:12px;min-width:0}.size-label{font-size:12px;font-weight:600;margin:24px 0 4px}.grids{display:flex;flex-wrap:wrap;gap:12px}.grid{width:260px;height:172px}.markhero{width:120px;height:120px}.screen{max-width:375px;margin:auto}.screen img{width:375px;height:auto;outline:1px solid #d8d4cc}.note{max-width:790px;border-left:2px solid #111110;padding:6px 0 6px 18px;font-size:14px;line-height:1.7;margin:24px 0}.sheetlink{display:inline-block;margin-right:18px}footer{padding-top:28px;padding-bottom:44px;font-size:12px;line-height:1.8}a:focus-visible,button:focus-visible{outline:2px solid #111110;outline-offset:4px}@media(max-width:700px){header,main,footer{padding-left:16px;padding-right:16px}header{padding-top:34px}.twocol{gap:12px}.stage{height:230px;padding:12px}.detail-stage{height:160px}.stack{grid-template-columns:1fr}.panel{padding:16px}.species b{font-size:17px}h2{font-size:27px}.lead{font-size:16px}nav{padding:12px 16px}.pose h3{font-size:16px}}@media(max-width:380px){.stage{height:195px;padding:8px}.detail-stage{height:140px}.species{gap:6px}.species b{font-size:15px}}
'''
def image(file,alt,cls='',size=None):
 im=Image.open(ROOT/file)if file.endswith('.png')else None;w,h=size or (im.size if im else (100,100))
 return f'<a href="{file}"><img src="{file}" class="{cls}" width="{w}" height="{h}" alt="{html.escape(alt)}"></a>'
def native(prefix,sizes,bg,label):
 return f'<div class="native {bg}">'+''.join(f'<a class="cell" href="sizes/{prefix}-{bg}-{n}.png"><img src="sizes/{prefix}-{bg}-{n}.png" width="{n}" height="{n}" alt="{label}, {n} px, {bg}"><span>{n}</span></a>'for n in sizes)+'</div>'
def page():
 out='<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Медведь и рысь — маскот с гирей</title><link rel="stylesheet" href="../../prototype/css/fonts.css"><style>'+CSS+'</style></head><body><header><div class="kicker">Исследование · 25 сентября 2026</div><h1>Медведь или рысь.<br>Гиря остаётся знаком.</h1><p class="lead">Два персонажа в одном плоском стиле. Четыре одинаковые позы, реальные размеры и клиентские экраны для сравнения.</p><p class="meta">GPT Image · SVG-знаки нарисованы вручную · направление не выбрано</p></header><nav><a href="#poses">Позы</a><a href="#details">Силуэты и головы</a><a href="#sizes">Размеры</a><a href="#marks">K1 / K2</a><a href="#screens">Экраны</a><a href="NOTES.md">Отчёт</a></nav><main><section id="poses"><div class="kicker">01 · Поза к позе</div><h2>Один набор действий.</h2><div class="twocol">'
 for key,code,name,desc in CHARACTERS:out+=f'<div><div class="species"><span>{code}</span><b>{name}</b></div><p class="meta">{desc}</p></div>'
 out+='</div>'
 for role,title,desc in POSES:
  out+=f'<div class="pose"><h3>{title}</h3><div class="twocol">'
  for key,code,name,_ in CHARACTERS:out+=f'<figure class="pose-card"><div class="stage">'+image(f'assets/{key}-{role}.png',f'{name}: {title}')+f'</div><figcaption>{name}. {desc}</figcaption></figure>'
  out+='</div></div>'
 out+='<p class="meta">Полные исходные листы: <a class="sheetlink" href="sheets/b.png">B · медведь</a><a href="sheets/l.png">L · рысь</a></p></section><section id="details"><div class="kicker">02 · Постоянные признаки</div><h2>Силуэт и лицо.</h2>'
 for role,title in [('silhouette','Силуэты без деталей'),('avatar','Головы с листов')]:
  out+=f'<h3>{title}</h3><div class="twocol">'
  for key,code,name,_ in CHARACTERS:out+='<figure><div class="stage detail-stage">'+image(f'assets/{key}-{role}.png',f'{name}: {title}')+f'</div><figcaption>{name}. '+('Круглые уши.' if key=='b' else 'Уши с кисточками и угловатые щёки.')+'</figcaption></figure>'
  out+='</div>'
 out+='</section><section id="sizes"><div class="kicker">03 · Pillow Lanczos</div><h2>24, 48 и 96 пикселей.</h2><p class="lead">Голова и полная фигура вырезаны именно из позы «Привет». Каждый PNG показан в натуральном размере, на бумаге и белом.</p><div class="twocol stack">'
 for key,code,name,_ in CHARACTERS:
  out+=f'<article class="panel"><div class="kicker">{code}</div><h3>{name}</h3>'
  for role,label in[('head','Голова из «Привет»'),('figure','Фигура без отдельно стоящей гири')]:
   out+=f'<p class="size-label">{label}</p>'
   for bg in['paper','white']:out+=native(f'{key}-{role}',[24,48,96],bg,name+' · '+label)
  out+='</article>'
 out+='</div><p class="meta">Миниатюры не дорисованы. Читаемость вида животного и его характера с пользователями не проверялась.</p></section><section id="marks"><div class="kicker">04 · Самостоятельный SVG-знак</div><h2>Гиря для иконки.</h2><p class="lead">Без глаз и числа. Два контура, один Ember-акцент на ручке. Светлый и тёмный варианты по 60 × 60 px.</p><div class="twocol stack">'
 for key,title,desc in[('k1','K1 · Классическая','Высокая ручка с большим просветом и округлое тело.'),('k2','K2 · Коренастая','Широкое тело, более низкая и толстая ручка.')]:
  out+=f'<article class="panel">'+image(f'mark/{key}.svg',title,'markhero',(120,120))+f'<h3>{title}</h3><p class="meta">{desc}</p>'
  for bg in['paper','white']:out+=native(key,[16,24,48,96],bg,title)
  out+='<div class="grids">'
  for mode,label in[('light','Светлая'),('dark','Тёмная')]:out+='<figure>'+image(f'sizes/{key}-grid-{mode}.png',f'{title}: {label} иконка среди пяти серых заглушек','grid')+f'<figcaption><a href="mark/{key}-icon-{mode}.svg">{label} · SVG</a> · <a href="sizes/{key}-icon-{mode}.png">PNG 60 px</a></figcaption></figure>'
  out+='</div></article>'
 out+='</div></section><section id="screens"><div class="kicker">05 · Клиент, 375 px</div><h2>Вместо исходной иллюстрации.</h2><p class="lead">Чистый демосценарий «Пусто». В программе маскот заменяет блокнот; на главной — значок календаря. Остальные элементы и размеры карточек сохранены.</p><button id="toggle" aria-pressed="true" type="button">Экраны: с маскотом</button>'
 for name,title,desc in[('empty-program','Пустая программа','Поза «Ждём» · максимум 110 px.'),('home','Главная без записей','Поза «Ждём» · максимум 52 px, в существующем месте значка.')]:
  out+=f'<div class="pose"><h3>{title}</h3><div class="twocol stack">'
  for key,code,cname,_ in CHARACTERS:
   file=f'screens/{key}-{name}.png';base=f'screens/base/{name}.png'
   out+=f'<figure class="screen"><a href="{file}"><img class="overlay" src="{file}" data-overlay="{file}" data-base="{base}" width="375" height="844" alt="{cname}, {title}"></a><figcaption>{cname}. {desc}<br><a href="{base}">Исходный снимок</a></figcaption></figure>'
  out+='</div></div>'
 out+='<div class="note">Это наложения на реальные снимки, а не внедрение маскота в приложение. Подписи и кнопки не перекрыты. На главной размер ограничен исходным местом значка: детали лица и число на гире там теряются.</div></section><section><div class="kicker">Наблюдения</div><h2>Выбор остаётся открытым.</h2><p class="lead">Полные замечания по стилю, постоянству персонажей, малым размерам и ограничениям проверки собраны в отчёте.</p><p><a href="NOTES.md">Прочитать NOTES.md</a></p></section></main><footer>Исследование, не утверждённый бренд. Пользовательская проверка не проводилась.<br><a href="prompts.json">Промпты</a> · <a href="manifest.json">Источники и SHA-256</a> · <a href="build.py">Сборка</a></footer><script>document.getElementById("toggle").addEventListener("click",function(){const show=this.getAttribute("aria-pressed")!=="true";this.setAttribute("aria-pressed",String(show));this.textContent=show?"Экраны: с маскотом":"Экраны: исходные";document.querySelectorAll(".overlay").forEach(i=>{i.src=show?i.dataset.overlay:i.dataset.base;i.parentElement.href=i.src;});});</script></body></html>'
 (ROOT/'index.html').write_text(out)
def manifest():
 capture=json.loads((ROOT/'evidence/capture.json').read_text())
 for s in capture['screens']:
  assert sha(ROOT/s['file'])==s['sha256'];record(s['file'],'Playwright screenshot; clean client context'+('; original art hidden only in browser memory'if s.get('change')else ''),['capture.cjs','evidence/capture.json'],url=capture['url'])
 for key,*_ in CHARACTERS:record(f'sheets/{key}.png','Built-in GPT Image generation and refinement',['prompts.json'],prompt_id=key.upper())
 before=json.loads((ROOT/'evidence/prototype-before.json').read_text());after={str(f.relative_to(REPO)):sha(f)for f in(REPO/'prototype').rglob('*')if f.is_file()};assert before==after,'Prototype changed'
 pngs=[]
 for f in sorted(ROOT.rglob('*.png')):
  file=str(f.relative_to(ROOT));im=Image.open(f);source=META.get(file)
  if source is None:
   assert file.startswith('evidence/'),file
   source={'method':'Chromium comparison-page verification screenshot','inputs':[{'file':'index.html','sha256':sha(ROOT/'index.html')}]}
  pngs.append({'file':file,'sha256':sha(f),'width':im.width,'height':im.height,'source':source})
 jwrite(ROOT/'manifest.json',{'study':'Медведь и рысь с гирей','date':'2026-09-25','handoff':'../CODEX-BEAR-LYNX-HANDOFF.md','handoff_sha256':sha(ROOT.parent/'CODEX-BEAR-LYNX-HANDOFF.md'),'prototype_unchanged':True,'prototype_sources':before,'source_sha256':{str(f.relative_to(ROOT)):sha(f)for f in ROOT.rglob('*')if f.is_file()and f.suffix in['.svg','.py','.cjs','.html','.md']},'png':pngs})
if __name__=='__main__':
 crops();proofs();overlays();page();manifest();print('Built 8 pose crops, 24 animal size proofs, 2 SVG marks, 4 icon grids and 4 screen replacements; prototype unchanged')
