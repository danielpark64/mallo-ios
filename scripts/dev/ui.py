#!/usr/bin/env python3
"""adb UI 도우미: ui.py <serial> tap "<글자>" [n번째] | list | shot <이름>"""
import subprocess, sys, re, time, os
S=os.environ.get('UI_SHOT_DIR', '/tmp')
def adb(serial,*a,**k): return subprocess.run(['adb','-s',serial,*a],capture_output=True,**k)
def dump(serial):
    adb(serial,'shell','uiautomator','dump','/sdcard/ui.xml')
    x=adb(serial,'shell','cat','/sdcard/ui.xml').stdout.decode('utf-8','ignore')
    out=[]
    for m in re.finditer(r'<node[^>]*?text="([^"]*)"[^>]*?content-desc="([^"]*)"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', x):
        t,cd,a,b,c,d=m.groups(); label=t or cd
        if label: out.append((label,(int(a)+int(c))//2,(int(b)+int(d))//2))
    return out
serial,cmd=sys.argv[1],sys.argv[2]
if cmd=='list':
    for l,x,y in dump(serial): print(l[:40],x,y)
elif cmd=='tap':
    want=sys.argv[3]; nth=int(sys.argv[4]) if len(sys.argv)>4 else 0
    hits=[e for e in dump(serial) if e[0]==want] or [e for e in dump(serial) if want in e[0]]
    if len(hits)<=nth: print('NOTFOUND',want); sys.exit(1)
    l,x,y=hits[nth]; adb(serial,'shell','input','tap',str(x),str(y)); print('tap',l[:30],x,y)
elif cmd=='shot':
    name=sys.argv[3]; p=f'{S}/{name}.png'
    open(p,'wb').write(adb(serial,'exec-out','screencap','-p').stdout)
    subprocess.run(['sips','-Z','700',p,'--out',f'{S}/{name}s.png'],capture_output=True); print(p)
