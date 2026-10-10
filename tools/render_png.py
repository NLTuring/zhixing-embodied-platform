# -*- coding: utf-8 -*-
"""把导出的 PDF 逐页渲染为 PNG，供视觉验收使用。"""
import os
import sys

import pymupdf

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# 可选参数：argv[1] = 待渲染 pdf 路径，argv[2] = 图片输出目录
PDF = (sys.argv[1] if len(sys.argv) > 1 else
       os.path.join(BASE, 'preview', 'brief.pdf'))
OUTDIR = (sys.argv[2] if len(sys.argv) > 2 else
          os.path.join(BASE, 'preview', 'pages'))
os.makedirs(OUTDIR, exist_ok=True)

doc = pymupdf.open(PDF)
print('总页数 =', doc.page_count)

paths = []
for i, page in enumerate(doc, start=1):
    pix = page.get_pixmap(dpi=130)
    p = os.path.join(OUTDIR, 'page-%02d.png' % i)
    pix.save(p)
    paths.append(p)
doc.close()

print('已渲染 %d 张 -> %s' % (len(paths), OUTDIR))
for p in paths:
    print(p)
