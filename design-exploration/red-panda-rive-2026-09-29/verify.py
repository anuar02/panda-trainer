from pathlib import Path
import subprocess, json, os
import xml.etree.ElementTree as ET
from PIL import Image, ImageChops
ROOT = Path(__file__).resolve().parent
RIVE = os.environ.get('RIVE_BIN', str(Path.home()/'.rive/bin/rive'))
OUT = ROOT/'review';OUT.mkdir(exist_ok=True)
cases = [
 ('idle', ['--advance=1'], 'idle'),
 ('wave', ['--advance=1','--pointer=click@148,531','--advance=40'], 'wave'),
 ('wave-return', ['--advance=1','--pointer=click@148,531','--advance=210'], 'idle'),
 ('tap', ['--advance=1','--pointer=click@240,240','--advance=12'], 'tap'),
 ('tap-return', ['--advance=1','--pointer=click@240,240','--advance=100'], 'idle'),
 ('wave-repeat', ['--advance=1','--pointer=click@148,531','--advance=210','--pointer=click@148,531','--advance=40'], 'wave'),
 ('tap-interrupt', ['--advance=1','--pointer=click@148,531','--advance=30','--pointer=click@240,240','--advance=12'], 'tap'),
]
report=[]
for name,args,expected in cases:
    result=subprocess.run([RIVE,str(ROOT),f'--screenshot={OUT/name}.png',f'--data-dump={OUT/name}.json',*args],capture_output=True,text=True)
    assert result.returncode==0,result.stdout+result.stderr
    data=json.loads((OUT/f'{name}.json').read_text())
    state=next(p for p in data['viewModel']['properties'] if p['name']=='state')
    assert state['value']==expected,(name,state)
    report.append({'case':name,'state':expected,'passed':True})
for name in ['wave','tap']:
    a=Image.open(OUT/'idle.png').convert('RGB');b=Image.open(OUT/f'{name}.png').convert('RGB')
    assert ImageChops.difference(a,b).getbbox(),f'{name} did not move any pixels'
# Verify the transparent reusable artboard also receives pointer input.
subprocess.run([RIVE,str(ROOT/'mascot'),f'--screenshot={OUT}/mascot-tap.png',f'--data-dump={OUT}/mascot-tap.json','--advance=1','--pointer=click@240,250','--advance=12'],check=True,capture_output=True)
data=json.loads((OUT/'mascot-tap.json').read_text())
assert next(p['value'] for p in data['viewModel']['properties'] if p['name']=='state')=='tap'
# CLI screenshots include the previewer backdrop; inspect the authored artboard
# instead of treating screenshot alpha as evidence of runtime transparency.
artboard=ET.parse(ROOT/'mascot/scene.rml').getroot().find('Artboard')
assert artboard.find('Fill') is None,'Standalone artboard must have no background paint'
report.append({'case':'standalone tap + no artboard background paint','passed':True})
(OUT/'report.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
