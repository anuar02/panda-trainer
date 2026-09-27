#!/usr/bin/env python3
"""Build static comparison + deterministic raster proofs. Existing GPT Image boards are inputs.
python3 build.py --prepare ; node render.cjs ; python3 build.py
Use --render to execute rasterization as part of the build. No network or generation call.
"""
from pathlib import Path
import base64, json, hashlib, re, subprocess, sys, html
from PIL import Image, ImageChops, ImageDraw
import vectors
ROOT=Path(__file__).resolve().parent; REPO=ROOT.parents[1]
STYLES=[('ballpoint','A1','Шариковая ручка','Ровная линия 1,75 px с круглыми концами; короткие заметки набраны собственными рукописными контурами.'),('nib','A2','Капиллярная ручка','Толщина мягко меняется по ходу движения, начало и конец штриха сужаются.'),('marker','A3','Маркер','Линия около 3 px с небольшими неровностями края и непрозрачностью 90%.')]
LOGOS=[('b1-hand','B1','Рукописный ×','Два штриха разной длины, небольшой изгиб и смещённое пересечение.'),('b2-dual','B2','Два штриха','Чернильный штрих встречается с синим: второй след обозначает запись тренера.'),('b3-type','B3','Знак в строке','Равные диагонали с прямыми окончаниями и геометрией, близкой к Montserrat.'),('c1-strict','C1','Ровный счёт','Четыре равных вертикальных штриха и пятый диагональный штрих.'),('c2-hand','C2','Пятая запись','Четыре чуть различающихся штриха; пятый, синий, фиксирует завершённое занятие.')]
LABELS={'check':'Записано','circle':'Обвести число','underline':'Подчеркнуть','arrow':'Указать прибавку','bracket':'Сгруппировать','asterisk':'Акцент','note-spine':'«держи спину»','note-next':'«+2,5 в следующий раз»'}
SCREENS=[('today','Сегодня','Заметка к назначенной программе. Гипотеза размещения: такой рукописной заметки в прототипе пока нет.'),('journal','Личный журнал','Записаны 50 × 10 и 52,5 × 10. Обводка выделяет прибавку относительно прошлых 50 × 10.'),('client-progress','Прогресс клиента','Предложение «+2,5 в следующий раз» написано от лица тренера. Это пример, а не рекомендация приложения.')]
def sha(f):return hashlib.sha256(f.read_bytes()).hexdigest()
def jwrite(f,data):f.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
def uri(file):
    f=ROOT/file;mime='image/svg+xml' if f.suffix=='.svg' else 'image/png'
    return 'data:'+mime+';base64,'+base64.b64encode(f.read_bytes()).decode()
def inline(file,size=None,color=None):
    s=(ROOT/file).read_text()
    if size:s=re.sub(r'width="[^"]+"',f'width="{size}"',s,count=1);s=re.sub(r'height="[^"]+"',f'height="{size}"',s,count=1)
    if color:s=s.replace('color:#111110','color:'+color)
    return s

def prepare():
    vectors.make();jobs=[]
    placements={
      'today':[('note-spine',217,217,121,24),('underline',116,263,59,9)],
      'journal':[('circle',56,387,68,42)],
      'client-progress':[('note-next',139,533,204,24),('underline',33,559,79,9)]}
    for style,*_ in STYLES:
        for name,_,_ in SCREENS:
            ovs=[]
            for mark,x,y,w,h in placements[name]:
                asset=f'marks/{style}/{mark}.svg'
                if mark=='underline':
                    asset=f'marks/{style}/underline-{name}.svg'
                    body=vectors.stroke([(2,4),(w*.3,3),(w*.65,5),(w-2,3)],style)
                    if style=='marker':body='<g opacity=".9">'+body+'</g>'
                    (ROOT/asset).write_text(vectors.svg(w,h,body,title='Подчёркивание'))
                ovs.append({'asset':asset,'x':x,'y':y,'width':w,'height':h})
            body=f'<img src="{uri("screens/base/"+name+".png")}" width="375" height="844">'
            for o in ovs:body+=f'<img src="{uri(o["asset"])}" style="position:absolute;left:{o["x"]}px;top:{o["y"]}px;width:{o["width"]}px;height:{o["height"]}px">'
            jobs.append(dict(file=f'screens/{style}-{name}.png',width=375,height=844,html=body,sources=['screens/base/'+name+'.png']+[o['asset']for o in ovs],kind='screen-overlay',overlays=ovs))
    ov={'asset':'logos/c2-hand.svg','x':115,'y':475,'width':44,'height':44}
    jobs.append(dict(file='screens/c2-package.png',width=375,height=844,html=f'<img src="{uri("screens/base/client-package.png")}" width="375" height="844"><img src="{uri(ov["asset"])}" style="position:absolute;left:115px;top:475px;width:44px;height:44px">',sources=['screens/base/client-package.png',ov['asset']],kind='screen-overlay',overlays=[ov]))
    for name,*_ in LOGOS:
        for bg,col in [('paper','#f4f2ed'),('white','#ffffff')]:
            for size in [16,24,48,96]:
                jobs.append(dict(file=f'sizes/{name}-{bg}-{size}.png',width=size,height=size,html=f'<div style="width:{size}px;height:{size}px;background:{col}">'+inline(f'logos/{name}.svg',size)+'</div>',sources=[f'logos/{name}.svg'],kind='native-size'))
        for mode,bg,ink in [('light','#f4f2ed','#111110'),('dark','#111110','#f4f2ed')]:
            # Light/dark app contexts use monochrome: blue is reserved for a new coach entry.
            body=inline(f'logos/{name}.svg',40,ink).replace('#2b48d6',ink)
            icon=f'<div style="width:60px;height:60px;padding:10px;border-radius:14px;background:{bg}">{body}</div>'
            jobs.append(dict(file=f'sizes/{name}-app-{mode}.png',width=60,height=60,html=icon,sources=[f'logos/{name}.svg'],kind='app-icon'))
            grey=['#c4c3bf','#b8b7b3','#d0cfcb','#aeada9','#dbdad6'];grid=[]
            for i in range(6):
                cell=icon if i==0 else f'<div style="width:60px;height:60px;border-radius:14px;background:{grey[i-1]}"></div>'
                grid.append('<div>'+cell+'</div>')
            jobs.append(dict(file=f'sizes/{name}-grid-{mode}.png',width=260,height=172,html='<div style="padding:16px;display:grid;grid-template-columns:repeat(3,60px);gap:20px 24px;background:#eeede9">'+''.join(grid)+'</div>',sources=[f'logos/{name}.svg'],kind='app-grid'))
    for style,*_ in STYLES:
        cells=[]
        for mark in ['check','asterisk']:
            for size in [16,24,48]:cells.append(f'<div style="width:64px;height:60px;display:flex;align-items:center;justify-content:center">'+inline(f'marks/{style}/{mark}.svg',size)+'</div>')
        jobs.append(dict(file=f'sizes/{style}-symbols.png',width=192,height=120,html='<div style="display:grid;grid-template-columns:repeat(3,64px);background:#f4f2ed">'+''.join(cells)+'</div>',sources=[f'marks/{style}/check.svg',f'marks/{style}/asterisk.svg'],kind='mark-proof'))
    jwrite(ROOT/'evidence/render-jobs.json',jobs)

CSS='''
:root{color:#111110;background:#f4f2ed;font-family:Inter,Arial,sans-serif;font-synthesis:none}*{box-sizing:border-box}body{margin:0}a{color:inherit;text-underline-offset:4px}button{font:inherit}header,main,footer{max-width:1250px;margin:auto;padding:0 24px}header{padding-top:64px;padding-bottom:40px}.eyebrow,.kicker{font-size:11px;text-transform:uppercase;letter-spacing:.14em;font-weight:700;color:#5c5a55}h1,h2,h3{font-family:Montserrat,Arial,sans-serif;letter-spacing:-.045em}h1{font-size:clamp(38px,5vw,68px);max-width:900px;line-height:1.06;margin:20px 0}h2{font-size:34px;line-height:1.15;margin:12px 0}h3{font-size:23px;margin:0 0 10px}.intro{max-width:700px;font-size:19px;line-height:1.55}.meta{font-size:12px;color:#5c5a55;line-height:1.7}.nav{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:#f4f2edee;backdrop-filter:blur(10px);border-top:1px solid #dedbd3;border-bottom:1px solid #dedbd3;padding:12px max(24px,calc((100vw - 1202px)/2));}.nav a,.nav button{border:1px solid #ccc8bf;border-radius:20px;padding:9px 14px;background:transparent;text-decoration:none;font-size:12px;cursor:pointer;white-space:nowrap}.nav button{margin-left:auto}.nav button[aria-pressed=true]{background:#111110;color:#fff;border-color:#111110}section{scroll-margin-top:90px;border-top:1px solid #d4d1c9;padding:42px 0 54px}.lead{max-width:760px;color:#5c5a55;font-size:15px;line-height:1.65}.mood{margin:28px 0 38px;display:grid;grid-template-columns:1.5fr 1fr;gap:28px;align-items:center}.mood img{display:block;width:100%;height:auto;border-radius:8px}.mood figcaption{font-size:14px;line-height:1.7;color:#5c5a55}.variant{margin-top:38px;padding-top:28px;border-top:1px solid #d4d1c9}.descriptor{margin:8px 0 24px;color:#5c5a55;line-height:1.5;font-size:14px}.kit{display:grid;grid-template-columns:repeat(6,1fr);gap:1px;border:1px solid #e2dfd7;background:#e2dfd7;margin-bottom:26px}.mark{background:#fff;padding:14px 12px;min-height:100px;display:flex;flex-direction:column;align-items:center;justify-content:space-between;gap:12px}.mark img{max-width:100%;height:32px;object-fit:contain}.mark span{font-size:10px;color:#5c5a55;text-align:center}.mark.long{grid-column:span 3}.mark.long img{height:24px}.screens{display:grid;grid-template-columns:repeat(3,minmax(0,375px));justify-content:space-between;gap:20px}.screen{margin:0;min-width:0}.screen>a{display:block}.screen img{display:block;width:100%;height:auto;outline:1px solid #ddd9d0}.screen figcaption{font-size:12px;line-height:1.55;color:#5c5a55;padding:14px 0;max-width:365px}.screen b{display:block;color:#111110;font-size:14px;margin-bottom:6px}.logo-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.logo-grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}.logo-card{background:#fff;border:1px solid #e2dfd7;border-radius:12px;padding:24px;min-width:0}.logo-hero{display:flex;align-items:center;justify-content:center;height:140px;background:#f4f2ed;border-radius:8px;margin:20px 0}.logo-hero img{width:96px;height:96px}.line-example{font-family:Montserrat,sans-serif;font-size:30px;font-weight:700;display:flex;gap:12px;align-items:center;justify-content:center}.line-example img{width:28px;height:28px}.close-compare{display:flex;gap:30px;align-items:center;margin:20px 0;padding:16px 10px;background:#f4f2ed;border-radius:8px}.close-cell{display:flex;flex-direction:column;align-items:center;gap:8px;font-size:10px;color:#5c5a55}.close-cell div{width:40px;height:40px;display:grid;place-items:center}.close-cell .sign{width:24px;height:24px}.close-cell .system{width:40px;height:40px}.native-row{display:flex;align-items:flex-end;justify-content:space-between;gap:8px;min-height:135px;padding:12px 10px;margin:8px 0;background:#f4f2ed}.native-row.white{background:#fff;outline:1px solid #eceae5}.native-cell{display:flex;flex-direction:column;align-items:center;gap:8px;font-size:10px;color:#5c5a55}.native-cell img{display:block;max-width:none}.size-heading{font-size:11px;color:#5c5a55;line-height:1.5;margin:20px 0 6px}.appgrid{display:flex;flex-wrap:wrap;gap:14px}.appgrid figure{margin:0}.appgrid img{width:260px;height:172px;display:block;max-width:100%;object-fit:contain}.appgrid figcaption{font-size:10px;color:#5c5a55;margin:8px 0}.package{display:grid;grid-template-columns:375px 1fr;gap:36px;margin-top:34px;align-items:start}.proof{margin:22px 0}.proof summary{cursor:pointer;font-size:12px;color:#5c5a55}.proof img{display:block;margin:16px 0;width:192px;height:120px}.mini-title{font-size:13px;font-weight:700;line-height:1.6}footer{padding-top:28px;padding-bottom:50px;border-top:1px solid #d4d1c9;font-size:12px;color:#5c5a55;line-height:1.8}button:focus-visible,a:focus-visible,summary:focus-visible{outline:2px solid #111110;outline-offset:4px}@media(max-width:1000px){.logo-grid,.logo-grid.two{grid-template-columns:1fr}.logo-card{display:block}.native-row{max-width:320px}.appgrid{gap:20px}.screens{gap:14px}.kit{grid-template-columns:repeat(3,1fr)}.mood{grid-template-columns:1fr}.mood img{max-width:750px}.package{grid-template-columns:minmax(0,375px) 1fr}.nav button{margin-left:0}}@media(max-width:650px){header,main,footer{padding-left:16px;padding-right:16px}header{padding-top:36px}.intro{font-size:17px}.nav{position:relative;padding:12px 16px;backdrop-filter:none}.screens{grid-template-columns:minmax(0,375px);justify-content:center;gap:25px}.kit{grid-template-columns:repeat(3,1fr)}.mood{gap:12px}section{padding-top:32px}h2{font-size:28px}.logo-card{padding:16px}.package{grid-template-columns:minmax(0,375px);justify-content:center}.appgrid{justify-content:center}h1{font-size:42px}.native-row{gap:6px;padding:10px 6px}}
'''
def mood(letter,name,desc):return f'<figure class="mood"><a href="mood/{name}.png"><img src="mood/{name}.png" alt="Мудборд {letter}: бумага, ручка и след чернил" width="1536" height="1024"></a><figcaption><div class="kicker">Материал · GPT Image</div><p>{desc}</p>Это образ материала. Точные знаки ниже нарисованы в SVG вручную.</figcaption></figure>'
def screen_img(file,base,title,desc):return f'<figure class="screen"><a href="{file}"><img class="overlay-screen" data-overlay="{file}" data-base="{base}" src="{file}" width="375" height="844" alt="{title}: реальные демоданные с рукописными отметками"></a><figcaption><b>{title}</b>{desc}<br><a href="{base}">Исходный снимок · 375 px</a></figcaption></figure>'
def logo_card(logo):
    name,code,title,desc=logo
    out=f'<article class="logo-card"><div class="kicker">{code}</div><h3>{title}</h3><p class="descriptor">{desc}</p><a class="logo-hero" href="logos/{name}.svg"><img src="logos/{name}.svg" alt="{title}" width="96" height="96"></a>'
    if name=='b3-type':out+='<div class="line-example" aria-label="50 на 10">50<img src="logos/b3-type.svg" alt="умножить на">10</div>'
    if name.startswith('b'):
        out+=f'<div class="close-compare"><div class="close-cell"><div><img class="sign" src="logos/{name}.svg" alt="Знак {code}"></div>Знак · 24 px</div><div class="close-cell"><div><img class="system" src="sizes/system-close.png" alt="Настоящая кнопка закрытия из прототипа"></div>Закрыть · 24 px</div></div>'
    out+='<p class="size-heading">Реальный растр · DPR 1 · 16 / 24 / 48 / 96 px<br>Бумага, затем белая поверхность. Изображения не растянуты.</p>'
    for bg in ['paper','white']:
        out+=f'<div class="native-row {bg}">'
        for size in [16,24,48,96]:out+=f'<a class="native-cell" href="sizes/{name}-{bg}-{size}.png"><img src="sizes/{name}-{bg}-{size}.png" width="{size}" height="{size}" alt="{code}, {bg}, {size} пикселей"><span>{size}</span></a>'
        out+='</div>'
    out+='<p class="size-heading">Иконка 60 × 60 · светлая и тёмная<br>Рядом пять серых заглушек: дневник, расписание, тренировки, питание, привычки. Чужих логотипов нет.</p><div class="appgrid">'
    for mode,label in [('light','Светлая'),('dark','Тёмная')]:out+=f'<figure><a href="sizes/{name}-app-{mode}.png"><img src="sizes/{name}-grid-{mode}.png" width="260" height="172" alt="{label} иконка {code} рядом с пятью серыми заглушками"></a><figcaption>{label} · монохромный знак</figcaption></figure>'
    return out+'</div></article>'

def page():
    out='<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Почерк тренера — исследование айдентики</title><link rel="stylesheet" href="../../prototype/css/fonts.css"><style>'+CSS+'</style></head><body><header><div class="eyebrow">Исследование айдентики · 25 сентября 2026</div><h1>Почерк тренера.</h1><p class="intro">За каждой записью — человек.<br>Три способа сделать присутствие тренера видимым: через почерк, знак умножения и счёт занятий.</p><p class="meta">3 характера штриха · 5 знаков · реальные экраны 375 px<br>Исследование, не утверждённый бренд. Прототип сохранён без изменений.</p></header><nav class="nav" aria-label="Направления"><a href="#a">A · Почерк</a><a href="#b">B · ×</a><a href="#c">C · Счёт</a><a href="NOTES.md">Наблюдения</a><button type="button" id="toggle" aria-pressed="true">Экраны: с отметками</button></nav><main>'
    out+='<section id="a"><div class="kicker">A · Основной визуальный язык</div><h2>Записано рукой.</h2><p class="lead">Восемь отметок в трёх исполнениях. На экране — одна или две: рядом с назначенной программой, записанным подходом или комментарием к прогрессу.</p>'+mood('A','a-handwriting','Шариковая ручка, капиллярное перо и маркер: один набор движений, три разных следа на бумаге.')
    for style,code,title,desc in STYLES:
        out+=f'<article class="variant"><div class="kicker">{code}</div><h3>{title}</h3><p class="descriptor">{desc}</p><div class="kit">'
        for mark,label in LABELS.items():out+=f'<a class="mark {"long" if mark.startswith("note") else ""}" href="marks/{style}/{mark}.svg"><img src="marks/{style}/{mark}.svg" alt="{label}"><span>{label}</span></a>'
        out+='</div><div class="screens">'
        for name,title,desc in SCREENS:out+=screen_img(f'screens/{style}-{name}.png',f'screens/base/{name}.png',title,desc)
        out+=f'</div><details class="proof"><summary>Галочка и акцент при 16, 24 и 48 px</summary><img src="sizes/{style}-symbols.png" alt="Два символа: слева 16, в центре 24, справа 48 пикселей" width="192" height="120"></details></article>'
    out+='</section><section id="b"><div class="kicker">B · Знак умножения</div><h2>Тренер × клиент.</h2><p class="lead">Знак из записи «50 × 10». Каждый вариант показан рядом с кнопкой закрытия: две диагонали совпадают по общей структуре. Вопрос путаницы остаётся открытым.</p>'+mood('B','b-multiplication','Пересечение двух движений ручки и привычная запись веса с повторами.')+'<div class="logo-grid">'+''.join(logo_card(l)for l in LOGOS[:3])+'</div></section>'
    out+='<section id="c"><div class="kicker">C · Счётные палочки</div><h2>Ещё одна запись.</h2><p class="lead">Четыре штриха и пятый поперёк. Счёт приобретает форму, а синий штрих фиксирует действие тренера.</p>'+mood('C','c-tallies','Накопление записей, небольшая нерегулярность почерка и пятая отметка, сделанная сейчас.')+'<div class="logo-grid two">'+''.join(logo_card(l)for l in LOGOS[3:])+'</div><div class="package">'+screen_img('screens/c2-package.png','screens/base/client-package.png','C2 · Прогресс пакета','Пять палочек соответствуют реальным «12 · использовано 5». Число и подпись остаются на месте.')+'<div><h3>Пять занятий из двенадцати.</h3><p class="lead">Знак добавлен в свободное место строки «Занятий». Он повторяет фактическое число использованных занятий и не подменяет остаток или сумму к оплате.</p><p class="lead">Синий — пятая запись тренера. В иконке приложения оба цветных знака показаны монохромно: без контекста текущей записи синий не используется.</p><p class="meta">Скриншот: чистая карточка Айгерим Бековой, вкладка «Оплаты». Интерфейс и демоданные не редактировались.</p></div></div></section></main><footer><p>Опциональный «Дуэт» в эту итерацию не включён. Здесь сопоставляются обязательные направления A–C.</p><p>Пользовательская проверка не проводилась. Выбор направления остаётся открытым.</p><a href="NOTES.md">Отчёт</a> · <a href="manifest.json">Источники и SHA-256</a> · <a href="prompts.json">Промпты GPT Image</a> · <a href="../../prototype/index.html?now=08:00">Открыть прототип</a></footer><script>document.getElementById("toggle").addEventListener("click",function(){const on=this.getAttribute("aria-pressed")!=="true";this.setAttribute("aria-pressed",String(on));this.textContent=on?"Экраны: с отметками":"Экраны: исходные";document.querySelectorAll(".overlay-screen").forEach(img=>{img.src=on?img.dataset.overlay:img.dataset.base;img.parentElement.href=img.src;});});</script></body></html>'
    (ROOT/'index.html').write_text(out)

def verify_pixels():
    renders=json.loads((ROOT/'evidence/renders.json').read_text())
    result=[]
    for r in renders['renders']:
        assert sha(ROOT/r['file'])==r['sha256'], 'Stale rendered PNG: '+r['file']
        for source,digest in r['source_sha256'].items():assert sha(ROOT/source)==digest, 'Stale render input: '+source
        if r['kind']!='screen-overlay':continue
        base=Image.open(ROOT/r['sources'][0]).convert('RGB');final=Image.open(ROOT/r['file']).convert('RGB')
        diff=ImageChops.difference(base,final).convert('RGB');mask=Image.new('1',base.size);draw=ImageDraw.Draw(mask)
        for o in r['overlays']:draw.rectangle((o['x'],o['y'],o['x']+o['width'],o['y']+o['height']),fill=1)
        outside=0;changed=0
        for rgb,m in zip(diff.getdata(),mask.getdata()):
            if any(rgb):changed+=1;outside+=not m
        assert outside==0,(r['file'],outside)
        assert changed>0,r['file']
        result.append(dict(file=r['file'],changed_pixels=changed,changed_outside_svg_bounds=outside,marks=len(r['overlays'])))
    jwrite(ROOT/'evidence/overlay-verification.json',result)
    observations={}
    for style,*_ in STYLES:
        base=Image.open(ROOT/'screens/base/journal.png').convert('RGB');final=Image.open(ROOT/f'screens/{style}-journal.png').convert('RGB')
        touched=sum(max(base.getpixel((x,y)))<100 and base.getpixel((x,y))!=final.getpixel((x,y)) for y in range(387,430)for x in range(55,125))
        assert touched==0, (style,'Glyph overlap',touched)
        observations[style]={'dark_glyph_pixels_touched':touched}
    for name,*_ in LOGOS:
        observations[name]={}
        for size in [16,24,48,96]:
            im=Image.open(ROOT/f'sizes/{name}-white-{size}.png').convert('RGB')
            occupied=[(x,y)for y in range(size)for x in range(size)if min(im.getpixel((x,y)))<160]
            obs={'pixels_below_160':len(occupied),'bounds':[min(x for x,y in occupied),min(y for x,y in occupied),max(x for x,y in occupied),max(y for x,y in occupied)]}
            if name.startswith('c'):
                row=[min(im.getpixel((x,round(size*.3))))<160 for x in range(size)]
                obs['separate_runs_at_30_percent_height']=sum(v and (i==0 or not row[i-1])for i,v in enumerate(row))
            observations[name][size]=obs
    jwrite(ROOT/'evidence/raster-observations.json',observations)

def manifest():
    captures=json.loads((ROOT/'evidence/capture.json').read_text());
    for capture in captures['screens']:assert sha(ROOT/capture['file'])==capture['sha256'], 'Stale base PNG'
    renderdata=json.loads((ROOT/'evidence/renders.json').read_text());renders={r['file']:r for r in renderdata['renders']}
    pngs=[]
    for f in sorted(ROOT.rglob('*.png')):
        file=str(f.relative_to(ROOT));im=Image.open(f)
        if file in renders:source={'method':'Chromium SVG rasterization / composition','inputs':[{'file':s,'sha256':sha(ROOT/s)}for s in renders[file]['sources']],'kind':renders[file]['kind']}
        elif file.startswith('screens/base/'):source={'method':'Playwright screenshot, clean browser context and UI actions','capture':'evidence/capture.json','capture_sha256':sha(ROOT/'evidence/capture.json'),'url':captures['url'],'screen':f.stem}
        elif file.startswith('mood/'):source={'method':'built-in GPT Image','prompts':'prompts.json','prompts_sha256':sha(ROOT/'prompts.json'),'asset':file}
        elif file=='sizes/system-close.png':source={'method':'Playwright locator screenshot','capture':'evidence/capture.json','capture_sha256':sha(ROOT/'evidence/capture.json'),'element':'button.topbar__btn[aria-label="Закрыть"]'}
        else:source={'method':'Browser comparison-page verification','inputs':['index.html']}
        pngs.append(dict(file=file,sha256=sha(f),width=im.width,height=im.height,source=source))
    before=json.loads((ROOT/'evidence/prototype-before.json').read_text())
    after={str(f.relative_to(REPO)):sha(f)for f in (REPO/'prototype').rglob('*') if f.is_file()}
    assert before==after,'Prototype files changed during study'
    sources={str(f.relative_to(ROOT)):sha(f)for f in ROOT.rglob('*')if f.is_file()and f.suffix in ['.svg','.py','.cjs','.html']}
    jwrite(ROOT/'manifest.json',{'study':'Почерк тренера','date':'2026-09-25','handoff':'../CODEX-IDENTITY-VARIANTS-HANDOFF.md','handoff_sha256':sha(ROOT.parent/'CODEX-IDENTITY-VARIANTS-HANDOFF.md'),'prototype_unchanged':True,'prototype_sources':before,'renderer':{'browser':renderdata['browser'],'deviceScaleFactor':1},'source_sha256':sources,'png':pngs})
if __name__=='__main__':
    if '--prepare' in sys.argv or '--render' in sys.argv:prepare()
    if '--prepare' in sys.argv:print('Prepared SVG masters and render jobs');sys.exit()
    if '--render' in sys.argv:subprocess.run(['node',str(ROOT/'render.cjs')],check=True)
    page();verify_pixels();manifest();print('Built index.html, verified overlays and prototype hashes, wrote manifest.json')
