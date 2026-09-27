#!/usr/bin/env python3
"""Rebuild crops, Lanczos size proofs, screen overlays, static HTML and provenance. No generation API calls."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageChops
from collections import deque
import hashlib,json,html,re
import extract
ROOT=Path(__file__).resolve().parent;REPO=ROOT.parents[1]
PAPER='#f4f2ed';INK='#111110';LANCZOS=Image.Resampling.LANCZOS
G=[('g1','G1','Плоский геометрический','Округлое тело, плавная дуга ручки и один небольшой фрагмент Ember-ленты.'),('g2','G2','Чернильный','Слегка неровный край, светлый штрих на плече и след печатной фактуры.'),('g3','G3','Коренастый','Более широкое тело с плоским основанием и короткой толстой ручкой.')]
OTHER=[('d1','D1','Две повязки','Два равных напарника: Ember-лента у тренера и графитовая полоса у клиента.'),('d2','D2','Свисток и повязка','Роли различаются деталью на ручке: свисток у тренера, Ember-лента у клиента.'),('s1','S1','Простые блоки','Фигуры ближе к реальным пропорциям; гиря остаётся небольшим спутником сцены.'),('s2','S2','Мягкая геометрия','Условные взрослые фигуры с более крупными головами и округлыми формами.')]
S=[('home','Главная · пакет','7 на гире повторяет остаток пакета. Экран прокручен до этого блока.'),('empty-program','Пустая программа','0 в позе «Ждём». Гиря рядом с иллюстрацией пустого состояния, выше кнопки.'),('progress','Прогресс · посещения','0 относится к отсутствию отмеченных посещений за неделю, а не к весу или всем результатам клиента.')]
META={}
def sha(file):return hashlib.sha256(file.read_bytes()).hexdigest()
def writejson(file,value):file.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def register(file,method,inputs,**extra):META[file]={'method':method,'inputs':[{'file':p,'sha256':sha(ROOT/p)}for p in inputs],**extra}
def save(im,file,method,inputs,**extra):im.save(ROOT/file);register(file,method,inputs,**extra)
def fitted(im,n):
    w,h=im.size;ratio=min(n/w,n/h);return im.resize((round(w*ratio),round(h*ratio)),LANCZOS)
def on_square(im,n,bg):
    small=fitted(im,n-2 if n>=16 else n);out=Image.new('RGBA',(n,n),bg);out.alpha_composite(small,((n-small.width)//2,(n-small.height)//2));return out.convert('RGB')
def holes(binary):
    w,h=binary.size;seen=set();found=[]
    for y in range(h):
      for x in range(w):
        if binary.getpixel((x,y)) or (x,y)in seen:continue
        q=deque([(x,y)]);seen.add((x,y));group=[];edge=False
        while q:
          a,b=q.popleft();group.append((a,b));edge|=a==0 or b==0 or a==w-1 or b==h-1
          for c,d in [(a-1,b),(a+1,b),(a,b-1),(a,b+1)]:
            if 0<=c<w and 0<=d<h and (c,d)not in seen and not binary.getpixel((c,d)):seen.add((c,d));q.append((c,d))
        if not edge:found.append(group)
    return found

def assets():
    extract.main();cropdata=json.loads((ROOT/'evidence/crops.json').read_text())
    for g,*_ in G:
        for role in ['hero','waiting']:
            register(f'assets/{g}-{role}-crop.png','Pillow crop of generated sheet',[f'sheets/{g}.png'],crop=cropdata[g][role]['crop'])
            register(f'assets/{g}-{role}.png','Paper matting: retain eyes/number, open largest enclosed handle hole',[f'assets/{g}-{role}-crop.png'])
        register(f'assets/{g}-silhouette.png','Solid ink silhouette from original hero alpha',[f'assets/{g}-hero.png'])
        im=Image.open(ROOT/f'assets/{g}-seven-source.png');cut,detail=extract.matte(im)
        save(cut,f'assets/{g}-seven.png','Paper matting of GPT Image number edit',[f'assets/{g}-seven-source.png'],matting=detail)
    return cropdata

def proofs():
    observations=[]
    for g,*_ in G:
        for role in ['hero','silhouette']:
            im=Image.open(ROOT/f'assets/{g}-{role}.png').convert('RGBA')
            for n in [16,24,48,96]:
                for bg,color in [('paper',PAPER),('white','#ffffff')]:save(on_square(im,n,color),f'sizes/{g}-{role}-{bg}-{n}.png','Pillow Lanczos, aspect preserved, 1 px outer margin',[f'assets/{g}-{role}.png'],pixels=n,background=color)
                small=fitted(im,n-2);mask=Image.new('L',(n,n));mask.paste(small.getchannel('A'),((n-small.width)//2,(n-small.height)//2));binary=mask.point(lambda x:255 if x>=128 else 0)
                components=holes(binary);upper=[a for a in components if sum(y for x,y in a)/len(a)<n*.5]
                observations.append({'variant':g,'role':role,'size':n,'enclosed_handle_hole_pixels':max([len(a)for a in upper],default=0),'opaque_area_pixels':sum(v>=128 for v in mask.getdata()),'bbox':binary.getbbox()})
        sil=Image.open(ROOT/f'assets/{g}-silhouette.png').convert('RGBA')
        for mode,bg,fg in [('light',PAPER,INK),('dark',INK,PAPER)]:
            s=Image.new('RGBA',sil.size,fg);s.putalpha(sil.getchannel('A'));s=fitted(s,42)
            im=Image.new('RGBA',(60,60));ImageDraw.Draw(im).rounded_rectangle((0,0,59,59),radius=14,fill=bg);im.alpha_composite(s,((60-s.width)//2,(60-s.height)//2))
            save(im,f'sizes/{g}-icon-{mode}.png','60 px rounded app icon from hero silhouette',[f'assets/{g}-silhouette.png'],background=bg,foreground=fg)
            grid=Image.new('RGB',(260,172),'#ebe9e3');d=ImageDraw.Draw(grid)
            for i in range(6):
                x=16+(i%3)*84;y=16+(i//3)*80
                if i==0:grid.paste(im,(x,y),im)
                else:d.rounded_rectangle((x,y,x+59,y+59),radius=14,fill=['#c1c0bc','#b7b6b2','#d1d0cc','#aeada9','#dad9d5'][i-1])
            save(grid,f'sizes/{g}-grid-{mode}.png','App icon among five schematic gray placeholders',[f'sizes/{g}-icon-{mode}.png'])
    assert all(o['enclosed_handle_hole_pixels']>0 for o in observations),'Handle lost at a tested size'
    writejson(ROOT/'evidence/size-observations.json',observations)

def overlays():
    placements={'home':('seven',280,391,56),'empty-program':('waiting',226,166,96),'progress':('waiting',293,565,48)}
    checks=[]
    for g,*_ in G:
        for name,_,_ in S:
            role,x,y,size=placements[name];basefile=f'screens/base/{name}.png';asset=f'assets/{g}-{role}.png';base=Image.open(ROOT/basefile).convert('RGBA');im=fitted(Image.open(ROOT/asset).convert('RGBA'),size);x+=(size-im.width)//2;y+=(size-im.height)//2;final=base.copy();final.alpha_composite(im,(x,y));file=f'screens/{g}-{name}.png'
            save(final.convert('RGB'),file,'One alpha-composited mascot, Pillow Lanczos; base pixels preserved',[basefile,asset],overlay={'x':x,'y':y,'width':im.width,'height':im.height,'number':7 if name=='home' else 0})
            diff=ImageChops.difference(base.convert('RGB'),final.convert('RGB'));outside=diff.copy();ImageDraw.Draw(outside).rectangle((x,y,x+im.width-1,y+im.height-1),fill=0);assert outside.getbbox()is None
            # Readability: added mascot may not cover pre-existing dark glyphs/icons.
            ink_touched=sum(max(base.getpixel((xx,yy))[:3])<110 and base.getpixel((xx,yy))!=final.getpixel((xx,yy)) for yy in range(y,y+im.height)for xx in range(x,x+im.width))
            checks.append({'file':file,'outside_overlay_changed_pixels':0,'existing_dark_pixels_touched':ink_touched,'mascot_black_pixels':sum(max(v[:3])<80 and v[3]>128 for v in im.getdata()),'max_dimension':size,'overlay':META[file]['overlay']})
    writejson(ROOT/'evidence/overlay-verification.json',checks)
    assert all(c['existing_dark_pixels_touched']==0 for c in checks),'Overlay covers existing dark content'

CSS='''
:root{font-family:Inter,Arial,sans-serif;color:#111110;background:#f4f2ed;font-synthesis:none}*{box-sizing:border-box}body{margin:0}h1,h2,h3{font-family:Montserrat,Arial,sans-serif;letter-spacing:-.045em}h1{font-size:clamp(44px,5.6vw,78px);line-height:1.04;margin:20px 0 24px}h2{font-size:36px;margin:12px 0 16px}h3{font-size:24px;margin:8px 0 12px}a{color:inherit;text-underline-offset:4px}img{display:block}header,main,footer{max-width:1250px;margin:auto;padding:0 24px}header{padding-top:60px;padding-bottom:38px}.kicker{font-size:11px;letter-spacing:.15em;text-transform:uppercase;font-weight:700;color:#5c5a55}.lead{max-width:760px;font-size:18px;line-height:1.6}.meta,.desc{color:#5c5a55;font-size:13px;line-height:1.65}.heroes{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:38px}.hero{padding:22px 22px 18px;border:1px solid #dedbd3;border-radius:14px;background:#ffffff50}.hero img{width:100%;height:180px;object-fit:contain;object-position:center bottom;margin-bottom:20px}.hero>div{min-width:0}.hero h3{font-size:19px;overflow-wrap:anywhere}.nav{position:sticky;top:0;z-index:5;background:#f4f2edee;backdrop-filter:blur(8px);border-top:1px solid #dedbd3;border-bottom:1px solid #dedbd3;padding:12px max(24px,calc((100vw - 1202px)/2));display:flex;gap:8px;flex-wrap:wrap;align-items:center}.nav a,.nav button{font:inherit;font-size:12px;text-decoration:none;padding:9px 13px;background:transparent;border:1px solid #cecac1;border-radius:22px;cursor:pointer}.nav button{margin-left:auto}.nav button[aria-pressed=true]{background:#111110;border-color:#111110;color:#fff}section{padding:44px 0;border-bottom:1px solid #d4d0c7;scroll-margin-top:90px}.sheet{margin:28px 0 40px}.sheet img{width:100%;height:auto;border-radius:10px;outline:1px solid #e1ddd5}.sheet figcaption{font-size:13px;color:#5c5a55;line-height:1.6;margin-top:12px}.sheet figcaption strong{color:#111110}.size-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.size-card{background:#fff;border:1px solid #dedbd3;border-radius:12px;padding:20px;min-width:0}.native{display:flex;justify-content:space-between;align-items:flex-end;gap:8px;min-height:132px;background:#f4f2ed;padding:10px;margin:12px 0}.native.white{background:#fff;outline:1px solid #eeeae3}.cell{display:flex;flex-direction:column;align-items:center;gap:9px;font-size:10px;color:#5c5a55}.cell img{max-width:none}.size-title{font-size:12px;font-weight:600;margin:22px 0 6px}.grid{width:260px;height:172px;max-width:100%;object-fit:contain;margin:12px 0}.screens{display:grid;grid-template-columns:repeat(3,minmax(0,375px));justify-content:space-between;gap:20px;margin-top:26px}.screen{margin:0;min-width:0}.screen img{width:100%;height:auto;outline:1px solid #ddd8ce}.screen figcaption{font-size:12px;color:#5c5a55;line-height:1.55;margin:14px 0 0}.screen figcaption b{display:block;color:#111110;font-size:14px;margin-bottom:8px}.screen-variant{margin-top:40px;padding-top:26px;border-top:1px solid #d4d0c7}.notes{padding:20px;border-left:2px solid #111110;margin:26px 0;font-size:14px;line-height:1.7;max-width:780px}.notes p{margin:0 0 10px}.notes p:last-child{margin:0}footer{padding-top:28px;padding-bottom:50px;font-size:12px;color:#5c5a55;line-height:1.8}.nav a:focus-visible,.nav button:focus-visible,a:focus-visible{outline:2px solid #111110;outline-offset:3px}@media(max-width:1000px){.size-grid{grid-template-columns:1fr}.native{max-width:320px}.size-card .appgrids{display:flex;gap:20px;flex-wrap:wrap}.hero{padding:18px}.hero h3{font-size:16px}.nav button{margin-left:0}}@media(max-width:650px){header,main,footer{padding-left:16px;padding-right:16px}header{padding-top:34px}h1{font-size:46px}h2{font-size:30px}.heroes{grid-template-columns:1fr;gap:12px}.hero{display:grid;grid-template-columns:108px minmax(0,1fr);gap:18px;align-items:center}.hero img{height:130px;margin:0}.hero h3{font-size:18px}.nav{position:relative;padding:12px 16px}.screens{grid-template-columns:minmax(0,375px);justify-content:center;gap:28px}.sheet{margin-top:22px}.size-card{padding:16px}.appgrids{justify-content:center}.lead{font-size:17px}}
'''
def sheet(id,code,title,desc):
    im=Image.open(ROOT/f'sheets/{id}.png')
    return f'<figure class="sheet"><a href="sheets/{id}.png"><img src="sheets/{id}.png" width="{im.width}" height="{im.height}" alt="{code}: {title}, исследовательский лист GPT Image"></a><figcaption><strong>{code} · {title}.</strong> {desc}</figcaption></figure>'
def page():
    out='<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Гиря — исследование маскота</title><link rel="stylesheet" href="../../prototype/css/fonts.css"><style>'+CSS+'</style></head><body><header><div class="kicker">Исследование маскота · 25 сентября 2026</div><h1>Гиря.<br>Напарник рядом.</h1><p class="lead">Три характера одной формы, два дуэта и четыре сцены с людьми. Спокойный спутник тренировок с числом на животе.</p><p class="meta">«Пуд» — рабочее имя, не утверждённое название.<br>GPT Image · реальные клиентские экраны · проверка силуэта от 16 px</p><div class="heroes">'
    for id,code,title,desc in G:out+=f'<article class="hero"><a href="#'+id+f'"><img src="assets/{id}-hero.png" alt="Герой {code}"></a><div><div class="kicker">{code}</div><h3>{title}</h3><p class="desc">{desc}</p></div></article>'
    out+='</div></header><nav class="nav" aria-label="Разделы"><a href="#characters">G1–G3</a><a href="#duet">Дуэт</a><a href="#scenes">Сцены</a><a href="#sizes">Размеры</a><a href="#screens">Экраны</a><button id="toggle" type="button" aria-pressed="true">Экраны: с гирей</button></nav><main><section id="characters"><div class="kicker">01 · Персонаж</div><h2>Один силуэт. Шесть состояний.</h2><p class="lead">На каждом листе — герой, приветствие, разминка, мах, отдых, ожидание и подскок. Ручка, число и глаза остаются частью конструкции.</p>'
    for vals in G:out+=f'<div id="{vals[0]}" style="scroll-margin-top:90px">'+sheet(*vals)+'</div>'
    out+='</section><section id="duet"><div class="kicker">02 · Двое на равных</div><h2>Различие в детали.</h2><p class="lead">Две гири одного размера и с одинаковым числом 16. Знакомство, совместная тренировка и отдых.</p>'
    for vals in OTHER[:2]:out+=sheet(*vals)
    out+='</section><section id="scenes"><div class="kicker">03 · Иллюстративный язык</div><h2>Люди остаются главными.</h2><p class="lead">Тренер показывает движение, клиент занимается дома по плану. Гиря стоит рядом. На каждую сцену приходится одна маленькая Ember-деталь.</p>'
    for vals in OTHER[2:]:out+=sheet(*vals)
    out+='</section><section id="sizes"><div class="kicker">04 · Реальный растр</div><h2>Что остаётся в 24 пикселях.</h2><p class="lead">Герои вырезаны из листов и уменьшены Pillow Lanczos. Ниже — отдельные PNG в натуральных размерах: 16, 24, 48 и 96 px. Силуэты построены из тех же контуров, без глаз, числа и повязки.</p><div class="size-grid">'
    for g,code,title,desc in G:
        out+=f'<article class="size-card"><div class="kicker">{code}</div><h3>{title}</h3>'
        for role,label in [('hero','Герой'),('silhouette','Только силуэт')]:
            out+=f'<p class="size-title">{label} · бумага / белый</p>'
            for bg in ['paper','white']:
                out+=f'<div class="native {bg}">'
                for n in[16,24,48,96]:out+=f'<a class="cell" href="sizes/{g}-{role}-{bg}-{n}.png"><img src="sizes/{g}-{role}-{bg}-{n}.png" width="{n}" height="{n}" alt="{code}, {label}, {n} пикселей, {bg}"><span>{n}</span></a>'
                out+='</div>'
        out+='<p class="size-title">Иконка 60 × 60</p><p class="meta">Пять соседних серых блоков — условные приложения, без чужих логотипов.</p><div class="appgrids">'
        for mode,label in [('light','Светлая'),('dark','Тёмная')]:out+=f'<div><a href="sizes/{g}-icon-{mode}.png"><img class="grid" src="sizes/{g}-grid-{mode}.png" width="260" height="172" alt="{label} иконка {code} среди пяти серых заглушек"></a><p class="meta">{label} · монохромный силуэт</p></div>'
        out+='</div></article>'
    out+='</div></section><section id="screens"><div class="kicker">05 · Настоящий прототип, 375 px</div><h2>Одно появление на экран.</h2><p class="lead">На главной — в блоке пакета. В программе — рядом с пустым состоянием. В прогрессе — рядом с посещениями за неделю. Переключатель наверху показывает исходные снимки.</p><div class="notes"><p><b>Число зависит от контекста.</b> На листах 16 — число персонажа. В пакете 7 — фактический остаток. В пустом состоянии 0; в прогрессе 0 — отсутствие отмеченных посещений на этой неделе.</p><p>Эти наложения — исследование размещения, не реализованная функция. Число на гире не заменяет подписи и данные интерфейса.</p></div>'
    for g,code,title,desc in G:
        out+=f'<article class="screen-variant"><div class="kicker">{code}</div><h3>{title}</h3><p class="desc">{desc}</p><div class="screens">'
        for name,stitle,sub in S:
            file=f'screens/{g}-{name}.png';base=f'screens/base/{name}.png'
            out+=f'<figure class="screen"><a href="{file}"><img class="overlay" src="{file}" data-overlay="{file}" data-base="{base}" width="375" height="844" alt="{code}: {stitle}"></a><figcaption><b>{stitle}</b>{sub}<br><a href="{base}">Исходный снимок</a></figcaption></figure>'
        out+='</div></article>'
    out+='</section><section><div class="kicker">Наблюдения</div><h2>Что ещё нужно проверить.</h2><p class="lead">Просвет ручки сохраняется при уменьшении. Смысл числа, узнаваемость поз и влияние чёрной массы на внимание пока не проверялись с пользователями.</p><p class="meta">На этих трёх состояниях основные кнопки светлые. Поэтому сравнение с чёрной основной кнопкой здесь не подтверждено. В пустой программе остаётся исходная иллюстрация блокнота: рядом с гирей появляются два визуальных объекта.</p><p><a href="NOTES.md">Полный отчёт: расхождения, размеры и наложения</a></p></section></main><footer><p>Исследование, не утверждённый бренд. Направление не выбрано. Прототип и предыдущие изображения не изменены.</p><a href="NOTES.md">Отчёт</a> · <a href="prompts.json">Промпты и уточнения</a> · <a href="manifest.json">Источники и SHA-256</a> · <a href="../../prototype/index.html?now=08:00">Прототип</a></footer><script>document.getElementById("toggle").addEventListener("click",function(){const show=this.getAttribute("aria-pressed")!=="true";this.setAttribute("aria-pressed",String(show));this.textContent=show?"Экраны: с гирей":"Экраны: исходные";document.querySelectorAll(".overlay").forEach(i=>{i.src=show?i.dataset.overlay:i.dataset.base;i.parentElement.href=i.src;});});</script></body></html>'
    (ROOT/'index.html').write_text(out)

def manifest():
    capture=json.loads((ROOT/'evidence/capture.json').read_text())
    for s in capture['screens']:
        assert sha(ROOT/s['file'])==s['sha256']
        register(s['file'],'Playwright clean client context, UI actions; viewport 375x844, DPR1',['capture.cjs','evidence/capture.json'],url=capture['url'])
    for id,*_ in G+OTHER:register(f'sheets/{id}.png','Built-in GPT Image generation/refinement',['prompts.json'],prompt_id=id.upper())
    for id,*_ in G:register(f'assets/{id}-seven-source.png','Built-in GPT Image number edit',['prompts.json',f'assets/{id}-hero-crop.png'],prompt_id=id+'-seven')
    before=json.loads((ROOT/'evidence/prototype-before.json').read_text());after={str(f.relative_to(REPO)):sha(f)for f in(REPO/'prototype').rglob('*')if f.is_file()};assert before==after,'Prototype changed'
    pngs=[]
    for f in sorted(ROOT.rglob('*.png')):
        file=str(f.relative_to(ROOT));im=Image.open(f);source=META.get(file)
        if not source:
            assert file.startswith('evidence/'),file
            source={'method':'Chromium verification screenshot of comparison page','inputs':[{'file':'index.html','sha256':sha(ROOT/'index.html')}]}
        pngs.append({'file':file,'sha256':sha(f),'width':im.width,'height':im.height,'source':source})
    writejson(ROOT/'manifest.json',{'study':'Гиря','date':'2026-09-25','handoff':'../CODEX-GIRYA-HANDOFF.md','handoff_sha256':sha(ROOT.parent/'CODEX-GIRYA-HANDOFF.md'),'prototype_unchanged':True,'prototype_sources':before,'capture_browser':capture['browser'],'source_sha256':{str(f.relative_to(ROOT)):sha(f)for f in ROOT.rglob('*')if f.is_file()and f.suffix in['.py','.cjs','.html','.md']},'png':pngs})
if __name__=='__main__':
    assets();proofs();overlays();page();manifest();print('Built sheets comparison, 48 size proofs, 6 app icons, 6 grids, 9 overlays; prototype unchanged')
