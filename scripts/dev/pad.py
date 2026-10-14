import sys
from PIL import Image
src,dst=sys.argv[1],sys.argv[2]
im=Image.open(src).convert('RGB'); w,h=im.size; H=2400; W=1350; r=H/h
im2=im.resize((round(w*r),H),Image.LANCZOS); bg=Image.new('RGB',(W,H),im2.getpixel((6,400)))
bg.paste(im2,((W-im2.size[0])//2,0)); bg.save(dst)
