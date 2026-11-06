# -*- coding: utf-8 -*-
import os

data = open(r'D:\dsh-openmaic-main\ecom-details-image-plugin\lib\index.js', encoding='utf-8').read()
print('src lib size:', len(data))
print('src prompt schema:', "type:'string'" in data)
print('src cost field:', 'cost' in data)
for prof in ['web', 'headless']:
    p = os.path.expanduser(r'~\.dsh\profiles\%s\node_modules\@demo\ecom-details-image-plugin\lib\index.js' % prof)
    if os.path.isfile(p):
        d = open(p, encoding='utf-8').read()
        print(prof, 'lib size:', len(d), 'prompt schema:', "type:'string'" in d)
    else:
        print(prof, 'lib MISSING')
