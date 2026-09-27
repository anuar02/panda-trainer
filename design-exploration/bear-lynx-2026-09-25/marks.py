from pathlib import Path
ROOT=Path(__file__).resolve().parent
INK='#111110';PAPER='#f4f2ed';EMBER='#ff7a1f'
GEOMETRY={
 'k1':('<path d="M23 45V28C23 12 33 6 50 6S77 12 77 28V45H65V28C65 20 61 18 50 18S35 20 35 28V45Z"/><path d="M27 39C18 48 12 61 12 73C12 87 20 94 32 94H68C80 94 88 87 88 73C88 61 82 48 73 39Z"/>','<path d="M64 10Q71 12 75 18L65 25Q63 20 59 19Z"/>'),
 'k2':('<path d="M17 46V31C17 16 29 12 50 12S83 16 83 31V46H68V31C68 26 61 26 50 26S32 26 32 31V46Z"/><path d="M22 40C10 50 6 62 6 75C6 89 16 94 31 94H69C84 94 94 89 94 75C94 62 90 50 78 40Z"/>','<path d="M67 13Q76 15 81 22L68 30Q65 27 62 26Z"/>')}
def make():
 for key,(body,tape) in GEOMETRY.items():
  for mode in ['mark','light','dark']:
   color=PAPER if mode=='dark' else INK
   bg=f'<rect width="100" height="100" rx="23.333" fill="{INK if mode=="dark" else PAPER}"/>' if mode!='mark' else ''
   shapes=f'<g fill="{color}">{body}</g><g fill="{EMBER}">{tape}</g>'
   if mode!='mark':shapes=f'<g transform="translate(14 12) scale(.72)">{shapes}</g>'
   filename=f'{key}.svg' if mode=='mark' else f'{key}-icon-{mode}.svg'
   title=f'{key.upper()} — '+('знак-гиря' if mode=='mark' else f'иконка {mode}')
   (ROOT/'mark'/filename).write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img"><title>{title}</title>{bg}{shapes}</svg>')
if __name__=='__main__':make()
