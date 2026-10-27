import sys
from PIL import Image
d=sys.argv[1]; fs=[int(x) for x in sys.argv[2].split(',')]; cols=int(sys.argv[3]) if len(sys.argv)>3 else 4
w,h=405,720
rows=(len(fs)+cols-1)//cols
c=Image.new('RGB',(w*cols,h*rows))
for i,f in enumerate(fs):
    c.paste(Image.open(f'{d}/f_{f:04d}.jpg').resize((w,h)),((i%cols)*w,(i//cols)*h))
c.save(f'{d}/sheet.jpg',quality=88)
