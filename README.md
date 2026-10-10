# 知行 · 具身智能任务规划中间件与仿真评测平台

> 一句话：让具身智能的任务规划**可验证、可比较、可复现**。

本仓库为挑战杯参赛项目的材料母版。核心交付物是**项目简介文档**——
一份读完即可直接撰写商业计划书、直接搭建答辩 PPT 的说明文档。

## 交付物

| 文件 | 说明 |
|---|---|
| [具身智能任务规划中间件与仿真评测平台-项目简介文档.docx](具身智能任务规划中间件与仿真评测平台-项目简介文档.docx) | **主交付物**，全文档宋体，含封面 / 自动目录 / 十三章正文 / 五个附录 |
| [具身智能任务规划中间件与仿真评测平台-商业计划书简略样板.docx](具身智能任务规划中间件与仿真评测平台-商业计划书简略样板.docx) | **配套交付物**：商业计划书的简略样板。保留完整的十三章骨架与全部数据接口，每章只给精简正文与关键表格，读完即可按它扩写为完整版 BP；末尾附"定稿检查清单"（全文档宋体） |
| [docs/01-项目速览与痛点.md](docs/01-项目速览与痛点.md) | 项目速览、四种长度简介、核心数据卡、三层痛点与证据清单 |
| [docs/02-产品与技术方案.md](docs/02-产品与技术方案.md) | 产品定位与形态、核心功能、统一理论内核、五层架构、技术栈与边界 |
| [docs/03-创新点与竞品分析.md](docs/03-创新点与竞品分析.md) | 四条创新点的四段式论证、竞品矩阵、差异化定位与四层壁垒 |
| [docs/04-市场商业模式与团队规划.md](docs/04-市场商业模式与团队规划.md) | 市场分层与测算、商业模式画布、财务、团队、里程碑、风险 |
| [docs/05-成果与BP·PPT拆解指南.md](docs/05-成果与BP·PPT拆解指南.md) | **附录 A–E**：商业计划书章节对照表、PPT 页面结构与讲稿、答辩问答库、素材证据清单、数据核实要求 |
| [tools/content.py](tools/content.py) | **文档全部内容**，用一套小型 DSL 描述，改内容只改这一个文件 |
| [tools/build_brief.py](tools/build_brief.py) | 排版引擎（宋体强制、目录域、标题不孤行、小表整表同页）与主文档生成脚本 |
| [tools/bp_sample.py](tools/bp_sample.py) | 商业计划书简略样板的生成脚本，复用同一排版引擎（封面与输出路径可参数化） |
| [tools/verify_brief.py](tools/verify_brief.py) | 字体与结构自检：逐 run 校验宋体、残留标记、目录域与标题层级 |
| [tools/check_quotes.py](tools/check_quotes.py) | 语法预检：找出内容里引号不成对的行（中文内容最易踩的坑） |
| [tools/export_pdf.py](tools/export_pdf.py) · [tools/render_png.py](tools/render_png.py) | 用 Word COM 导出 PDF 并逐页渲染 PNG，用于版式验收 |
| [preview/brief.pdf](preview/brief.pdf) · `preview/pages/` | 上述流程产出的 PDF 与逐页图片 |

## 怎么用

1. **写商业计划书**：先打开《商业计划书简略样板》定结构，再打开主文档的附录 A，按章节对照表逐章取用正文内容填入。
2. **做答辩 PPT**：打开附录 B，按页面结构表逐页制作，表中已给出标题、核心内容、视觉素材、讲稿要点与时长。
3. **准备答辩问答**：附录 C 的 Q1–Q14 逐条演练，其中 Q10 必须背诵。
4. **推进项目**：附录 D 是核验表，按优先级自上而下完成。
5. **提交前自查**：附录 E 列出所有待核实数据，必须逐项清零。

## 修改方式

内容全部位于 `tools/content.py`，用一套小型 DSL 描述
（`h1/h2/p/b/tbl/code` 等），排版逻辑位于 `tools/build_brief.py`。改完重跑：

```bash
python tools/build_brief.py
```

脚本会同时刷新 docx 与 docs/ 下的 Markdown 分卷，两者内容天然一致。
全文档字体统一为**宋体**（含西文与数字），由 `force_song_everywhere()`
与逐 run 的 `rFonts` 设置双重保证。

排版上有两条自动化规则，改内容后无需手工调版：

- **小表格整表同页**：估算行数 ≤ 21 的表格自动保持在同一页，
  避免被拆断后只剩一两行孤悬在下一页；需要强制或禁止可对 `tbl()`
  传 `keep=True/False`。
- **标题与表格不孤行**：标题、表格表头行、附录 C 的问题段落均设为
  "与下段同页"，避免标题或问题落在页底而内容翻页。

改完内容后建议依次执行：

```bash
python tools/check_quotes.py tools/content.py   # 引号预检
python tools/build_brief.py                     # 生成主文档 docx + md
python tools/bp_sample.py                       # 生成商业计划书简略样板
python tools/verify_brief.py                    # 主文档字体结构自检
python tools/export_pdf.py && python tools/render_png.py   # 导出并出图
```

`verify_brief.py`、`export_pdf.py`、`render_png.py` 都支持传入路径参数，因此同一套工具也能校验与导出样板文档，例如：

```bash
python tools/verify_brief.py "…商业计划书简略样板.docx" tools/_verify_bp.txt
python tools/export_pdf.py "…商业计划书简略样板.docx" preview/bp_sample.pdf
python tools/render_png.py preview/bp_sample.pdf preview/bp_pages
```

注意：导出 PDF 时必须用**绝对路径**（脚本已内部转换）。COM 调用按 Word/WPS 自己的当前目录解析相对路径，传相对路径会让 SaveAs 抛"发生意外"；另外本机需用 `DispatchEx`独立实例且 `Visible=True`，否则 WPS 会拒绝导出。

说明：本文档每一章都从新的一页开始，因此每章**最后一页**留白偏多，
这是该排版约定的正常结果（正式申报材料普遍如此），并非缺陷。
若希望消除留白，把对应章节的 `pb()` 标记删去即可让正文连续排版。

## 待办（优先级从高到低）

- [ ] ★ 选定首发滩头用户（高校具身智能实验室 / 整机厂商算法团队）并完成 3–5 家访谈
- [ ] ★ 跑通"规划—仿真验证—自动修复"最小闭环，并录屏存档
- [ ] ★ 复现公开 LLM 规划方法，统计"语义合理但物理不可行"的计划占比（痛点一的核心证据）
- [ ] 完成第二个本体 / 第二个仿真器的接入，验证技能跨本体复用率
- [ ] 完成附录 E 中全部标注 ★ 的数据核实
- [ ] 确认品牌名（现用"知行"为建议名）与参赛赛道
