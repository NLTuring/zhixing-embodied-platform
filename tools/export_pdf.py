# -*- coding: utf-8 -*-
"""把 docx 导出为 PDF（原生支持中文路径）。

说明：本机 Word.Application 由 WPS 提供实现，实测有三个坑：
  1. 若用 Dispatch 附着到已存在的（可能已损坏的）实例，导出会抛"发生意外"，
     必须用 DispatchEx 起一个独立实例；
  2. 隐藏窗口（Visible=False）下 WPS 会拒绝导出，需 Visible=True；
  3. 实例创建后 PDF 导出过滤器需要数秒才就绪，过早 SaveAs 会抛"发生意外"。
因此这里用 DispatchEx + Visible=True + 就绪延时 + 多轮重试。

Word/WPS 打开时会自动更新目录域（脚本已在 docx 中设置 w:updateFields），
因此导出的 PDF 目录带真实页码。

用法：
    python tools/export_pdf.py [源docx路径] [目标pdf路径]
不带参数时导出主文档到 preview/brief.pdf。
"""
import os
import sys
import time

import win32com.client as wc

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = (sys.argv[1] if len(sys.argv) > 1 else
       os.path.join(BASE, '具身智能任务规划中间件与仿真评测平台-项目简介文档.docx'))
OUT = (sys.argv[2] if len(sys.argv) > 2 else
       os.path.join(BASE, 'preview', 'brief.pdf'))
# 必须转成绝对路径：COM 调用按 Word/WPS 自己的当前目录解析相对路径，
# 传相对路径会导致 SaveAs 抛"发生意外"。
SRC = os.path.abspath(SRC)
OUT = os.path.abspath(OUT)

WD_FORMAT_PDF = 17
PROGIDS = ('Word.Application',)
SETTLE_SECONDS = 2
ROUNDS = 3

if not os.path.exists(SRC):
    raise SystemExit('源文件不存在：%s' % SRC)

os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
if os.path.exists(OUT):
    os.remove(OUT)

ok = False
for progid in PROGIDS:
    if ok:
        break
    app = None
    doc = None
    print('--- 尝试 %s ---' % progid)
    try:
        app = wc.DispatchEx(progid)          # 独立实例，避免附着到坏实例
    except Exception as e:
        print('  创建实例失败:', str(e)[:120])
        continue
    try:
        try:
            app.Visible = True               # WPS 需要可见窗口才能导出
            app.DisplayAlerts = 0
        except Exception:
            pass
        try:
            doc = app.Documents.Open(os.path.abspath(SRC), False, False)
        except Exception as e:
            print('  打开失败:', str(e)[:150])
            continue
        print('  打开成功，等待导出过滤器就绪…')
        time.sleep(SETTLE_SECONDS)
        try:
            print('  页数 =', doc.ComputeStatistics(2))
        except Exception as e:
            print('  页数统计失败:', str(e)[:80])
        try:
            doc.Fields.Update()
            for toc in doc.TablesOfContents:
                toc.Update()
            print('  目录域已更新')
        except Exception as e:
            print('  目录更新失败（可忽略）:', str(e)[:100])

        for rnd in range(1, ROUNDS + 1):
            if ok:
                break
            for name, fn in (('SaveAs2', lambda: doc.SaveAs2(OUT, WD_FORMAT_PDF)),
                             ('SaveAs', lambda: doc.SaveAs(OUT, WD_FORMAT_PDF)),
                             ('ExportAsFixedFormat',
                              lambda: doc.ExportAsFixedFormat(OUT, WD_FORMAT_PDF))):
                if ok:
                    break
                try:
                    fn()
                    if os.path.exists(OUT) and os.path.getsize(OUT) > 0:
                        ok = True
                        print('  导出方式 = %s（第 %d 轮）' % (name, rnd))
                        break
                except Exception as e:
                    print('  %s 失败: %s' % (name, str(e)[:110]))
            if not ok and rnd < ROUNDS:
                print('  重试前等待 3 秒…')
                time.sleep(3)
    finally:
        try:
            if doc is not None:
                doc.Close(0)
        except Exception:
            pass
        try:
            if app is not None:
                app.Quit()
        except Exception:
            pass

print('结果 =', 'PDF 已生成 %.1f KB' % (os.path.getsize(OUT) / 1024.0)
      if os.path.exists(OUT) else 'PDF 缺失')
sys.exit(0 if ok else 1)
