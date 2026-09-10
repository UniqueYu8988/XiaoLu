from __future__ import annotations

from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw
from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "doc"
TMP = ROOT / "tmp" / "docs" / "xiaolu_manual"
SHEET = ROOT / "assets" / "xiaolu" / "spritesheet.webp"
BOOKMARKS = ROOT / "assets" / "bookmarks"
SCREENSHOTS = ROOT / "docs" / "images" / "manual"
DOCX_PATH = OUT / "共学日记说明书.docx"

PURPLE = "76558F"
PURPLE_DARK = "4B315E"
LILAC = "E9DDF1"
CREAM = "FFF8E9"
PAPER = "FFFDF7"
PEACH = "F4CFA7"
ROSE = "EFA6B4"
GREEN = "A9C99E"
YELLOW = "F4D57B"
INK = "3A2C3E"
MUTED = "756A77"
WHITE = "FFFFFF"


def set_cell_shading(cell, fill: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_border(cell, color: str = PURPLE_DARK, size: int = 14, sides: Iterable[str] = ("top", "left", "bottom", "right")) -> None:
    # Word resolves adjacent cell borders independently. Keeping every ordinary
    # table edge at one pixel weight prevents thicker or broken-looking left
    # edges after PDF export; only the cover keeps its heavy frame.
    size = 24 if size >= 24 else 8
    tc_pr = cell._tc.get_or_add_tcPr()
    borders = tc_pr.first_child_found_in("w:tcBorders")
    if borders is None:
        borders = OxmlElement("w:tcBorders")
        tc_pr.append(borders)
    for side in sides:
        tag = f"w:{side}"
        edge = borders.find(qn(tag))
        if edge is None:
            edge = OxmlElement(tag)
            borders.append(edge)
        edge.set(qn("w:val"), "single")
        edge.set(qn("w:sz"), str(size))
        edge.set(qn("w:space"), "0")
        edge.set(qn("w:color"), color)


def set_cell_margins(cell, top: int = 100, start: int = 120, bottom: int = 100, end: int = 120) -> None:
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for m, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{m}"))
        if node is None:
            node = OxmlElement(f"w:{m}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_cell_width(cell, centimeters: float) -> None:
    cell.width = Cm(centimeters)
    tc_pr = cell._tc.get_or_add_tcPr()
    tc_w = tc_pr.find(qn("w:tcW"))
    if tc_w is None:
        tc_w = OxmlElement("w:tcW")
        tc_pr.append(tc_w)
    tc_w.set(qn("w:w"), str(round(centimeters / 2.54 * 1440)))
    tc_w.set(qn("w:type"), "dxa")


def set_repeat_table_header(row) -> None:
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


def keep_with_next(paragraph) -> None:
    p_pr = paragraph._p.get_or_add_pPr()
    keep = OxmlElement("w:keepNext")
    p_pr.append(keep)


def no_split(row) -> None:
    tr_pr = row._tr.get_or_add_trPr()
    cant_split = OxmlElement("w:cantSplit")
    tr_pr.append(cant_split)


def set_run_font(run, size: float, bold: bool = False, color: str = INK, name: str = "Microsoft YaHei") -> None:
    run.font.name = name
    run._element.rPr.rFonts.set(qn("w:eastAsia"), name)
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = RGBColor.from_string(color)


def add_text(paragraph, text: str, size: float = 9, bold: bool = False, color: str = INK, name: str = "Microsoft YaHei"):
    run = paragraph.add_run(text)
    set_run_font(run, size, bold, color, name)
    return run


def set_para(paragraph, before: float = 0, after: float = 0, line: float = 1.15, align=None) -> None:
    fmt = paragraph.paragraph_format
    fmt.space_before = Pt(before)
    fmt.space_after = Pt(after)
    fmt.line_spacing = line
    if align is not None:
        paragraph.alignment = align


def clear_cell(cell) -> None:
    cell.text = ""
    set_cell_margins(cell)
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER


def add_label(doc: Document, english: str, chinese: str) -> None:
    table = doc.add_table(rows=1, cols=2)
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    table.autofit = False
    left, right = table.rows[0].cells
    set_cell_width(left, 2.55)
    set_cell_width(right, 9.35)
    clear_cell(left)
    clear_cell(right)
    set_cell_shading(left, PURPLE_DARK)
    set_cell_shading(right, LILAC)
    set_cell_border(left, PURPLE_DARK, 16)
    set_cell_border(right, PURPLE_DARK, 16)
    p = left.paragraphs[0]
    set_para(p, align=WD_ALIGN_PARAGRAPH.CENTER)
    add_text(p, english, 6.5, True, WHITE, "Consolas")
    p = right.paragraphs[0]
    set_para(p)
    add_text(p, chinese, 13, True, PURPLE_DARK)
    doc.add_paragraph().paragraph_format.space_after = Pt(0)


def add_footer(section, page_no: str) -> None:
    footer = section.footer
    footer.is_linked_to_previous = False
    p = footer.paragraphs[0]
    p.clear()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_para(p)
    add_text(p, "XIAOLU STUDY JOURNAL  ·  ", 6.5, True, PURPLE, "Consolas")
    run = p.add_run()
    fld_char_1 = OxmlElement("w:fldChar")
    fld_char_1.set(qn("w:fldCharType"), "begin")
    instr_text = OxmlElement("w:instrText")
    instr_text.set(qn("xml:space"), "preserve")
    instr_text.text = " PAGE "
    fld_char_2 = OxmlElement("w:fldChar")
    fld_char_2.set(qn("w:fldCharType"), "end")
    run._r.extend((fld_char_1, instr_text, fld_char_2))
    set_run_font(run, 6.5, True, PURPLE, "Consolas")


def add_page(doc: Document, page_no: str) -> None:
    doc.add_page_break()
    add_footer(doc.sections[-1], page_no)


def extract_sprites() -> dict[str, Path]:
    TMP.mkdir(parents=True, exist_ok=True)
    source = Image.open(SHEET).convert("RGBA")
    cw, ch = source.width // 8, source.height // 11
    specs = {
        "idle": (0, 2),
        "look": (9, 0),
        "run_right": (1, 0),
        "run_left": (2, 0),
        "wave": (3, 2),
        "jump": (4, 2),
        "failed": (5, 5),
        "waiting": (6, 3),
        "focus": (7, 3),
        "review": (8, 4),
    }
    results: dict[str, Path] = {}
    for name, (row, col) in specs.items():
        frame = source.crop((col * cw, row * ch, (col + 1) * cw, (row + 1) * ch))
        alpha = frame.getchannel("A")
        box = alpha.getbbox()
        if box:
            frame = frame.crop(box)
        # A nearest-neighbour enlargement keeps the original pixel edges crisp.
        frame = frame.resize((frame.width * 3, frame.height * 3), Image.Resampling.NEAREST)
        path = TMP / f"sprite_{name}.png"
        frame.save(path)
        results[name] = path
    return results


def make_pixel_icon(label: str, fill: str, filename: str) -> Path:
    canvas = Image.new("RGBA", (360, 160), (255, 253, 247, 0))
    d = ImageDraw.Draw(canvas)
    d.rectangle((12, 12, 348, 148), fill="#4B315E")
    d.rectangle((20, 20, 340, 140), fill=f"#{fill}")
    # Decorative pixels; text stays in Word so Chinese rendering is reliable.
    for x, y in ((30, 30), (310, 30), (30, 110), (310, 110)):
        d.rectangle((x, y, x + 18, y + 18), fill="#FFF8E9")
    path = TMP / filename
    canvas.save(path)
    return path


def add_note_box(doc: Document, title: str, body: str, fill: str = CREAM, accent: str = PURPLE) -> None:
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = table.cell(0, 0)
    clear_cell(cell)
    set_cell_shading(cell, fill)
    set_cell_border(cell, accent, 14)
    p = cell.paragraphs[0]
    set_para(p, after=3)
    add_text(p, title, 9.5, True, accent)
    p = cell.add_paragraph()
    set_para(p, line=1.25)
    add_text(p, body, 8.3, False, INK)


def add_action_card(cell, image: Path, title: str, body: str, fill: str) -> None:
    clear_cell(cell)
    set_cell_shading(cell, fill)
    set_cell_border(cell, PURPLE_DARK, 10)
    p = cell.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_para(p, after=1)
    p.add_run().add_picture(str(image), height=Cm(2.0))
    p = cell.add_paragraph()
    set_para(p, after=1, align=WD_ALIGN_PARAGRAPH.CENTER)
    add_text(p, title, 8.4, True, PURPLE_DARK)
    p = cell.add_paragraph()
    set_para(p, line=1.12, align=WD_ALIGN_PARAGRAPH.CENTER)
    add_text(p, body, 6.8, False, MUTED)


def add_bullet(doc: Document, title: str, body: str, color: str = PURPLE) -> None:
    table = doc.add_table(rows=1, cols=2)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    dot, text = table.rows[0].cells
    set_cell_width(dot, 0.72)
    set_cell_width(text, 11.08)
    clear_cell(dot)
    clear_cell(text)
    set_cell_shading(dot, color)
    set_cell_border(dot, PURPLE_DARK, 8)
    p = dot.paragraphs[0]
    set_para(p, align=WD_ALIGN_PARAGRAPH.CENTER)
    add_text(p, "+", 9, True, WHITE, "Consolas")
    p = text.paragraphs[0]
    set_para(p, line=1.18)
    add_text(p, title + "  ", 8.4, True, INK)
    add_text(p, body, 7.35, False, MUTED)


def add_interface_page(doc: Document, english: str, title: str, intro: str, image: Path, note_title: str, note_body: str) -> None:
    add_page(doc, "")
    add_label(doc, english, title)
    p = doc.add_paragraph()
    set_para(p, after=5, line=1.28)
    add_text(p, intro, 8.2)

    frame = doc.add_table(rows=1, cols=1)
    frame.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = frame.cell(0, 0)
    clear_cell(cell)
    set_cell_shading(cell, PAPER)
    set_cell_border(cell, PURPLE_DARK, 10)
    set_cell_margins(cell, 100, 100, 100, 100)
    p = cell.paragraphs[0]
    set_para(p, align=WD_ALIGN_PARAGRAPH.CENTER)
    # The live panel is deliberately tall. Keep the screenshot, heading and
    # explanation together on one A5 page instead of letting Word push the
    # unsplittable image table onto the following page.
    p.add_run().add_picture(str(image), width=Cm(6.5))

    doc.add_paragraph().paragraph_format.space_after = Pt(0)
    add_note_box(doc, note_title, note_body, CREAM, PURPLE)


def build_document() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    sprites = extract_sprites()
    make_pixel_icon("", PEACH, "pixel_panel.png")

    doc = Document()
    section = doc.sections[0]
    section.page_width = Cm(14.8)
    section.page_height = Cm(21.0)
    section.top_margin = Cm(1.25)
    section.bottom_margin = Cm(1.15)
    section.left_margin = Cm(1.3)
    section.right_margin = Cm(1.3)
    section.header_distance = Cm(0.45)
    section.footer_distance = Cm(0.5)

    normal = doc.styles["Normal"]
    normal.font.name = "Microsoft YaHei"
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), "Microsoft YaHei")
    normal.font.size = Pt(9)
    normal.font.color.rgb = RGBColor.from_string(INK)
    normal.paragraph_format.space_after = Pt(4)
    normal.paragraph_format.line_spacing = 1.15

    # Cover
    cover = doc.add_table(rows=1, cols=1)
    cover.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = cover.cell(0, 0)
    clear_cell(cell)
    set_cell_shading(cell, CREAM)
    set_cell_border(cell, PURPLE_DARK, 24)
    set_cell_margins(cell, 220, 180, 220, 180)
    p = cell.paragraphs[0]
    set_para(p, after=5, align=WD_ALIGN_PARAGRAPH.CENTER)
    add_text(p, "XIAOLU STUDY JOURNAL", 8, True, PURPLE, "Consolas")
    p = cell.add_paragraph()
    set_para(p, after=2, align=WD_ALIGN_PARAGRAPH.CENTER)
    add_text(p, "共学日记说明书", 23, True, PURPLE_DARK)
    p = cell.add_paragraph()
    set_para(p, after=6, align=WD_ALIGN_PARAGRAPH.CENTER)
    add_text(p, "一份只属于我们两个人的学习约定", 9.2, False, MUTED)
    p = cell.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.add_run().add_picture(str(sprites["wave"]), height=Cm(7.1))
    p = cell.add_paragraph()
    set_para(p, after=3, align=WD_ALIGN_PARAGRAPH.CENTER)
    add_text(p, "她不是宠物。", 11, True, PURPLE_DARK)
    p = cell.add_paragraph()
    set_para(p, line=1.35, align=WD_ALIGN_PARAGRAPH.CENTER)
    add_text(p, "她是住在桌面上的学习搭子，\n替现实里的你来陪我、提醒我，也见证我们一起认真过的每一天。", 9, False, INK)
    p = doc.add_paragraph()
    set_para(p, before=8, align=WD_ALIGN_PARAGRAPH.CENTER)
    add_text(p, "VERSION 2.0.0  ·  2026", 6.8, True, PURPLE, "Consolas")
    add_footer(section, "00")

    # Page 1: identity and controls
    add_page(doc, "01")
    add_label(doc, "HELLO", "先认识一下小鹿")
    intro = doc.add_table(rows=1, cols=2)
    intro.alignment = WD_TABLE_ALIGNMENT.CENTER
    intro.autofit = False
    c0, c1 = intro.rows[0].cells
    set_cell_width(c0, 4.15); set_cell_width(c1, 7.65)
    clear_cell(c0); clear_cell(c1)
    set_cell_shading(c0, LILAC); set_cell_border(c0, PURPLE_DARK, 12)
    p = c0.paragraphs[0]; p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.add_run().add_picture(str(sprites["idle"]), height=Cm(4.35))
    set_cell_shading(c1, PAPER); set_cell_border(c1, PURPLE_DARK, 12)
    p = c1.paragraphs[0]; set_para(p, after=4)
    add_text(p, "为什么她会在这里？", 10.5, True, PURPLE_DARK)
    p = c1.add_paragraph(); set_para(p, line=1.35)
    add_text(p, "因为现实里的我们约好要互相监督学习。电脑里的小鹿代表你：她会在关键时间问我有没有到位，也会把每天的努力收进一本共学日记。", 8.2)
    p = c1.add_paragraph(); set_para(p, before=4, line=1.25)
    add_text(p, "所有记录只保存在这台电脑里，不会自动发给别人。", 7.5, True, PURPLE)

    p = doc.add_paragraph(); set_para(p, before=7, after=4)
    add_text(p, "三个最常用的操作", 11, True, PURPLE_DARK)
    controls = doc.add_table(rows=3, cols=1)
    controls.alignment = WD_TABLE_ALIGNMENT.CENTER
    items = [
        ("双击小鹿", "开始或结束一段学习计时。一天可以分成很多段，最后自动相加。", GREEN),
        ("右键小鹿", "打开像素风“共学日记”，看今日、任务、记录、统计与书签收藏。", PEACH),
        ("拖动小鹿", "把她挪到不挡视线的位置。她会朝拖动方向小跑，松手后恢复平常。", LILAC),
    ]
    for row, (title, body, fill) in zip(controls.rows, items):
        cell = row.cells[0]; clear_cell(cell); set_cell_shading(cell, fill); set_cell_border(cell, PURPLE_DARK, 10)
        p = cell.paragraphs[0]; set_para(p, after=1)
        add_text(p, title + "  ", 9, True, PURPLE_DARK)
        add_text(p, body, 7.7, False, INK)
        no_split(row)
    add_note_box(doc, "平常的她", "没有计时时，小鹿会安静待着，也会顺着鼠标方向看过来。暂停不用登记；想学时再双击就好。", CREAM, PURPLE)

    # Interface tour: real pages rendered with public demo data.
    add_interface_page(
        doc,
        "TODAY",
        "真实界面 · 今日与结算",
        "右键小鹿后，首页把当天最重要的事情放在同一屏：学习时间、综合进度、两项清关、五次在场、三科进度与今日背词。",
        SCREENSHOTS / "manual-today.png",
        "这是一份演示日记",
        "截图由 2.0.0 界面直接渲染，日期、学科进度与累计数字均为虚构演示数据，不来自任何真实使用记录。",
    )

    add_interface_page(
        doc,
        "TASKS",
        "真实界面 · 三枚动态目标书签",
        "任务页只承担今日目标：阅读、综合、做题三枚书签随 YuReader 百分比逐渐恢复颜色，达到 100% 后收入收藏。",
        SCREENSHOTS / "manual-tasks.png",
        "进度本身就是奖励",
        "左右书签保持各自原始比例；完成后出现轻量像素粒子。普通事项已经独立到“待办”，不会挤占目标页面。",
    )

    add_interface_page(
        doc,
        "TODO",
        "真实界面 · 独立待办清单",
        "待办页留给暂时不急的想法和每日事项。文字可以直接编辑，完成状态可以撤销，只有点亮每日刷新标记的项目会参与晚间提醒。",
        SCREENSHOTS / "manual-todos.png",
        "目标与待办不再混在一起",
        "任务页只看 YuReader 目标，待办页只管理事项。清单每页固定三条，通过像素翻页容纳更多内容，不引入滚动条。",
    )

    add_page(doc, "")
    add_label(doc, "LOG & SUM", "真实界面 · 记录与统计")
    p = doc.add_paragraph()
    set_para(p, after=5, line=1.28)
    add_text(p, "记录页保留每天的短摘要；统计页收敛为累计学习、打卡、双人书签和背词四项。两个页面都坚持一屏到底，不用在小窗口里滚动寻找内容。", 8.2)
    pair = doc.add_table(rows=1, cols=2)
    pair.alignment = WD_TABLE_ALIGNMENT.CENTER
    pair.autofit = False
    for cell, image, caption in zip(
        pair.rows[0].cells,
        (SCREENSHOTS / "manual-history.png", SCREENSHOTS / "manual-stats.png"),
        ("每天四条 · 像素翻页", "四项累计 · 四个开关"),
    ):
        clear_cell(cell)
        set_cell_shading(cell, PAPER)
        set_cell_border(cell, PURPLE_DARK, 9)
        set_cell_margins(cell, 70, 70, 70, 70)
        p = cell.paragraphs[0]
        set_para(p, after=2, align=WD_ALIGN_PARAGRAPH.CENTER)
        p.add_run().add_picture(str(image), width=Cm(4.7))
        p = cell.add_paragraph()
        set_para(p, align=WD_ALIGN_PARAGRAPH.CENTER)
        add_text(p, caption, 7.2, True, PURPLE_DARK)
    doc.add_paragraph().paragraph_format.space_after = Pt(0)
    add_note_box(doc, "只留下摘要，不复制生活", "新版记录显示日期、学习时长、阅读与做题进度、背词数量和一句话；旧版记录仍按原格式显示。双击一句话可以补写。", CREAM, PURPLE)

    add_interface_page(
        doc,
        "COLLECTION",
        "真实界面 · 我们的书签",
        "书签入口独立放在右上角。收藏页不做密集格子，而是完整展示三种书签图案，再用 × 数量记录它们被赢得了多少次。",
        SCREENSHOTS / "manual-bookmarks.png",
        "三种认真，各自累计",
        "阅读与做题达到 100% 分别赢得两枚单人书签；综合进度达到 100% 再收下一枚双人书签。它们不会消费，也不会因为中断而失去。",
    )

    # Page 2: schedule and check-in rules
    add_page(doc, "02")
    add_label(doc, "CHECK IN", "一天五次，只确认“我在”")
    p = doc.add_paragraph(); set_para(p, after=5, line=1.3)
    add_text(p, "在约定时间，小鹿会弹出一句提醒。只有手动计时已开启，或 YuReader 正处于有效学习与查询状态，点“我在”才会成功。", 8.4)

    schedule = doc.add_table(rows=6, cols=3)
    schedule.alignment = WD_TABLE_ALIGNMENT.CENTER
    schedule.autofit = False
    widths = [Cm(2.0), Cm(3.1), Cm(6.75)]
    for col, width in zip(schedule.columns, widths):
        col.width = width
    headers = ("时间", "有效窗口", "这一刻的意义")
    for i, text in enumerate(headers):
        cell = schedule.rows[0].cells[i]; clear_cell(cell); set_cell_shading(cell, PURPLE_DARK); set_cell_border(cell, PURPLE_DARK, 10)
        p = cell.paragraphs[0]; set_para(p, align=WD_ALIGN_PARAGRAPH.CENTER)
        add_text(p, text, 7.5, True, WHITE)
    set_repeat_table_header(schedule.rows[0])
    rows = [
        ("09:00", "08:55-09:05", "开始打卡；到点时若学习台未开，会自动启动 YuReader。"),
        ("12:00", "11:55-12:05", "中午在场确认。"),
        ("15:00", "14:55-15:05", "下午在场确认。"),
        ("18:00", "17:55-18:05", "傍晚确认；到点时可自动启动 YuReader。"),
        ("21:00", "20:55-21:05", "结束打卡；启动学习台，成功后可结算。"),
    ]
    fills = [CREAM, PAPER, CREAM, PAPER, LILAC]
    for row, data, fill in zip(schedule.rows[1:], rows, fills):
        no_split(row)
        for idx, text in enumerate(data):
            cell = row.cells[idx]; clear_cell(cell); set_cell_shading(cell, fill); set_cell_border(cell, PURPLE_DARK, 7)
            p = cell.paragraphs[0]; set_para(p, line=1.18, align=WD_ALIGN_PARAGRAPH.CENTER if idx < 2 else WD_ALIGN_PARAGRAPH.LEFT)
            add_text(p, text, 7.3 if idx == 2 else 7.7, idx == 0, PURPLE_DARK if idx == 0 else INK, "Consolas" if idx < 2 else "Microsoft YaHei")

    doc.add_paragraph().paragraph_format.space_after = Pt(1)
    add_note_box(doc, "十分钟规则", "每次打卡只有正负五分钟的有效期。09:00、18:00、21:00 到点时会按需启动学习台；12:00 与 15:00 只提醒，不自动打开网页。", "FCE7E8", ROSE)
    doc.add_paragraph().paragraph_format.space_after = Pt(1)
    add_note_box(doc, "先学习，再打卡", "停留在首页、暂停或关闭状态都不能打卡。若电脑在有效窗口内刚开机或唤醒，先开始一段学习仍可正常确认；窗口结束后记为未打卡。", "E8F1E5", GREEN)

    # Page 3: speech bubbles
    add_page(doc, "03")
    add_label(doc, "SAY HELLO", "提醒会像朋友说话，不像闹钟")
    p = doc.add_paragraph(); set_para(p, after=6, line=1.3)
    add_text(p, "同一个提醒会从多套台词里随机挑一句。语气亲近、简短，不催命，也不会每天一模一样。下面只是几种例子。", 8.3)

    bubbles = [
        ("09:00", "早呀，我来啦。你也到位了吗？", CREAM),
        ("09:00", "九点啦，一起把今天开个好头吧。", LILAC),
        ("12:00", "到中午啦，给我一个“我在”好不好？", PEACH),
        ("15:00", "我来偷偷看一眼，你还在认真吗？", "E8F1E5"),
        ("18:00", "六点报到！今天也坚持到这里啦。", CREAM),
        ("21:00", "今天辛苦啦，要不要和我一起收个尾？", LILAC),
    ]
    table = doc.add_table(rows=3, cols=2)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    for idx, (time, quote, fill) in enumerate(bubbles):
        cell = table.rows[idx // 2].cells[idx % 2]
        clear_cell(cell); set_cell_shading(cell, fill); set_cell_border(cell, PURPLE_DARK, 10)
        p = cell.paragraphs[0]; set_para(p, after=3)
        add_text(p, time, 7.2, True, PURPLE, "Consolas")
        p = cell.add_paragraph(); set_para(p, line=1.3)
        add_text(p, "“" + quote + "”", 8.2, True, INK)
        no_split(table.rows[idx // 2])

    p = doc.add_paragraph(); set_para(p, before=7, after=4)
    add_text(p, "反馈也会有一点变化", 10.5, True, PURPLE_DARK)
    add_bullet(doc, "打卡成功", "“收到，我知道你在啦。” / “好，今天这一格也点亮了。”", GREEN)
    add_bullet(doc, "开始计时", "“那就开始吧，我陪你。” / “专心去吧，结束时再叫我。”", PURPLE)
    add_bullet(doc, "结束一段学习", "“这一段收好啦。” / “辛苦了，先喘口气也没关系。”", PEACH)
    add_bullet(doc, "错过打卡", "“这次没等到你，下个时间点见。” / “这一格先空着，我们继续往后走。”", ROSE)
    add_note_box(doc, "她不会阴阳怪气", "错过只如实记录，不连续弹窗、不制造愧疚。亲近感来自陪伴和变化，不来自压力。", CREAM, PURPLE)

    # Page 4: action language
    add_page(doc, "04")
    add_label(doc, "ACTIONS", "小鹿的动作就是她的语言")
    p = doc.add_paragraph(); set_para(p, after=5, line=1.25)
    add_text(p, "动作不只是装饰。看到她的样子，就能大概知道现在发生了什么。", 8.3)
    action_table = doc.add_table(rows=3, cols=3)
    action_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    action_items = [
        (sprites["look"], "看向你", "平常待机 / 暂停", CREAM),
        (sprites["focus"], "认真进行中", "学习计时正在累计", "E8F1E5"),
        (sprites["waiting"], "等你回应", "打卡窗口已打开", LILAC),
        (sprites["wave"], "挥挥手", "打卡成功 / 开始计时", PEACH),
        (sprites["review"], "回顾一下", "结束一段 / 填今日结算", CREAM),
        (sprites["failed"], "有点失落", "错过打卡 / 答题出错", "FCE7E8"),
        (sprites["jump"], "开心跳起", "目标达成 / 整组完成", "E8F1E5"),
        (sprites["run_left"], "向左小跑", "拖动 / 自动赶路", LILAC),
        (sprites["run_right"], "向右小跑", "拖动 / 自动赶路", PEACH),
    ]
    for cell, item in zip((c for row in action_table.rows for c in row.cells), action_items):
        add_action_card(cell, *item)
    p = doc.add_paragraph(); set_para(p, before=5)
    add_text(p, "21 点结算后，她会回到普通待机。之后每隔几分钟短暂重现一次当日结算动作，再安静下来，不会连续跳动或卡在奇怪的一帧。", 7.8, True, PURPLE_DARK)

    # Page 5: settlement and the shared bookmark
    add_page(doc, "05")
    add_label(doc, "DAILY LOG", "21 点，一起把今天收进日记")
    p = doc.add_paragraph(); set_para(p, after=5, line=1.25)
    add_text(p, "结束打卡后，可以把今天收进日记。学习时间、综合完成度、两项清关、三科进度与在场次数就会定格，只需填写今日背词数量。", 8.2)

    fields = doc.add_table(rows=2, cols=2)
    fields.alignment = WD_TABLE_ALIGNMENT.CENTER
    field_items = [
        ("核心进度", "学习时间 · 综合完成度 · 在场", LILAC),
        ("两项清关", "错题攻坚 · 口腔背诵", CREAM),
        ("三门学科", "口腔 · 英语 · 政治", "E8F1E5"),
        ("我来填写", "今日背诵单词数量", PEACH),
    ]
    for cell, (title, body, fill) in zip((c for row in fields.rows for c in row.cells), field_items):
        clear_cell(cell); set_cell_shading(cell, fill); set_cell_border(cell, PURPLE_DARK, 10)
        p = cell.paragraphs[0]; set_para(p, after=2)
        add_text(p, title, 8.5, True, PURPLE_DARK)
        p = cell.add_paragraph(); set_para(p, line=1.2)
        add_text(p, body, 7.4, False, INK)

    p = doc.add_paragraph(); set_para(p, before=7, after=3)
    add_text(p, "书签由目标自动决定", 10.7, True, PURPLE_DARK)
    rewards = doc.add_table(rows=2, cols=2)
    rewards.alignment = WD_TABLE_ALIGNMENT.CENTER
    reward_items = [
        ("阅读或做题达标", "自动获得对应单人书签", GREEN),
        ("综合进度达标", "额外获得一枚双人书签", "E8F1E5"),
    ]
    for row, (condition, result, fill) in zip(rewards.rows, reward_items):
        no_split(row)
        for idx, text in enumerate((condition, result)):
            cell = row.cells[idx]; clear_cell(cell); set_cell_shading(cell, fill); set_cell_border(cell, PURPLE_DARK, 8)
            p = cell.paragraphs[0]; set_para(p, align=WD_ALIGN_PARAGRAPH.CENTER)
            add_text(p, text, 7.8, idx == 1, PURPLE_DARK if idx == 1 else INK)

    add_note_box(doc, "结算不会打断学习", "目标达成时，小鹿会播放对应动作与离线语音；提交结算后再从三句收尾语中随机选择一句。几分钟后的回顾动作保持安静。", CREAM, PURPLE)

    # Page 6: automatic goals
    add_page(doc, "06")
    add_label(doc, "GOALS", "三枚书签会跟着进度逐渐点亮")
    p = doc.add_paragraph(); set_para(p, after=5, line=1.3)
    add_text(p, "任务页与 YuReader 的每日目标同步。阅读、综合、做题三枚书签按百分比从下向上恢复颜色，达到 100% 后自动收入收藏。", 8.3)

    bounty = doc.add_table(rows=1, cols=3)
    bounty.alignment = WD_TABLE_ALIGNMENT.CENTER
    bounty_items = [
        (BOOKMARKS / "bookmark-self.png", "做题达成", "达到 100%", LILAC, 2.8),
        (BOOKMARKS / "bookmark-together.png", "综合达成", "达到 100%", CREAM, 3.2),
        (BOOKMARKS / "bookmark-friend.png", "阅读达成", "达到 100%", PEACH, 2.9),
    ]
    for cell, (image, title, body, fill, height) in zip(bounty.rows[0].cells, bounty_items):
        clear_cell(cell); set_cell_shading(cell, fill); set_cell_border(cell, PURPLE_DARK, 10)
        p = cell.paragraphs[0]; set_para(p, after=1, align=WD_ALIGN_PARAGRAPH.CENTER)
        add_text(p, title + "  ", 9.2, True, PURPLE_DARK)
        add_text(p, body, 7.4, False, INK)
        p = cell.add_paragraph(); set_para(p, after=1, align=WD_ALIGN_PARAGRAPH.CENTER)
        p.add_run().add_picture(str(image), height=Cm(height))
    no_split(bounty.rows[0])

    p = doc.add_paragraph(); set_para(p, before=6, after=3)
    add_text(p, "目标只维护一份，不增加操作负担", 10.7, True, PURPLE_DARK)
    add_bullet(doc, "网页修改", "在 YuReader 调整阅读时长或题量目标，小鹿会自动同步新的百分比。", PURPLE)
    add_bullet(doc, "额外加成", "背词、错题攻坚、口腔背诵与在场打卡会按规则加入综合进度。", GREEN)
    add_bullet(doc, "完成反馈", "对应书签达到 100% 后恢复全彩、出现粒子，并播放动作与离线语音。", PEACH)
    add_note_box(doc, "没有失败书签", "没完成不会扣除任何东西，也不会留下刺眼的失败标记。书签只负责保存真正达成的目标。", CREAM, PURPLE)

    # Page 7: tasks and diary navigation
    add_page(doc, "07")
    add_label(doc, "TODO", "待办清单，收下暂时不急的想法")
    p = doc.add_paragraph(); set_para(p, after=5, line=1.3)
    add_text(p, "待办从任务目标中独立出来，适合记录想做但暂时不重要的事情。只有标记为每日刷新的事项才需要当天完成与提醒。", 8.3)

    task_table = doc.add_table(rows=3, cols=2)
    task_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    task_items = [
        ("添加与编辑", "新任务直接加入清单；文字就在任务框内修改，不需要额外的“改”按钮。", LILAC),
        ("完成与撤销", "点击左侧像素方框切换状态；误点后可以再点一次撤回。", "E8F1E5"),
        ("每日刷新", "点亮“日”标记后，它会在第二天自动恢复，并加入晚间提醒。", PEACH),
        ("普通待办", "可以长期放着，适合记录灵感；完成后可保留到当天结束。", CREAM),
        ("晚间提醒", "21 点后只提醒未完成的每日事项，普通待办不会催促。", "FCE7E8"),
        ("像素翻页", "清单每页 3 项；记录每页 4 天。内容再多也不出现滚动条。", LILAC),
    ]
    for cell, (title, body, fill) in zip((c for row in task_table.rows for c in row.cells), task_items):
        clear_cell(cell); set_cell_shading(cell, fill); set_cell_border(cell, PURPLE_DARK, 9)
        p = cell.paragraphs[0]; set_para(p, after=2)
        add_text(p, title, 8.5, True, PURPLE_DARK)
        p = cell.add_paragraph(); set_para(p, line=1.2)
        add_text(p, body, 7.1, False, INK)

    p = doc.add_paragraph(); set_para(p, before=7, after=3)
    add_text(p, "右键打开的四个主页面", 10.7, True, PURPLE_DARK)
    pages = doc.add_table(rows=1, cols=4)
    pages.alignment = WD_TABLE_ALIGNMENT.CENTER
    for cell, (title, body, fill) in zip(pages.rows[0].cells, [
        ("今日", "计时、打卡与结算", CREAM),
        ("任务", "YuReader 三项目标", PEACH),
        ("待办", "灵感与每日事项", LILAC),
        ("统计", "长期累计与设置", "E8F1E5"),
    ]):
        clear_cell(cell); set_cell_shading(cell, fill); set_cell_border(cell, PURPLE_DARK, 9)
        p = cell.paragraphs[0]; set_para(p, after=2, align=WD_ALIGN_PARAGRAPH.CENTER)
        add_text(p, title, 8.7, True, PURPLE_DARK)
        p = cell.add_paragraph(); set_para(p, line=1.16, align=WD_ALIGN_PARAGRAPH.CENTER)
        add_text(p, body, 6.8, False, MUTED)

    # Page 8: bookmark collection
    add_page(doc, "08")
    add_label(doc, "COLLECTION", "三种书签，记录三种达成")
    p = doc.add_paragraph(); set_para(p, after=5, line=1.3)
    add_text(p, "点击日记右上角的书签图标，就能打开收藏页。每种书签只展示一枚完整图案，旁边的 × 数量记录它被赢得了多少次。", 8.3)

    gallery = doc.add_table(rows=1, cols=3)
    gallery.alignment = WD_TABLE_ALIGNMENT.CENTER
    gallery_items = [
        (BOOKMARKS / "bookmark-self.png", "做题书签", "做题进度 100%", LILAC, 6.5),
        (BOOKMARKS / "bookmark-together.png", "双人书签", "综合进度 100%", CREAM, 7.4),
        (BOOKMARKS / "bookmark-friend.png", "阅读书签", "阅读进度 100%", PEACH, 6.7),
    ]
    for cell, (image, title, body, fill, height) in zip(gallery.rows[0].cells, gallery_items):
        clear_cell(cell); set_cell_shading(cell, fill); set_cell_border(cell, PURPLE_DARK, 10)
        p = cell.paragraphs[0]; set_para(p, after=2, align=WD_ALIGN_PARAGRAPH.CENTER)
        p.add_run().add_picture(str(image), height=Cm(height))
        p = cell.add_paragraph(); set_para(p, after=1, align=WD_ALIGN_PARAGRAPH.CENTER)
        add_text(p, title, 8.5, True, PURPLE_DARK)
        p = cell.add_paragraph(); set_para(p, line=1.16, align=WD_ALIGN_PARAGRAPH.CENTER)
        add_text(p, body, 6.8, False, MUTED)

    add_note_box(doc, "收藏的规则", "两枚单人书签分别证明阅读与做题达标，双人书签记录综合进度完成。奖励只增加、不消费，也没有连续天数压力。", CREAM, PURPLE)

    # Page 9: getting started and offline voice
    add_page(doc, "09")
    add_label(doc, "LET'S START", "最难的不是坚持，是迈出第一步")
    p = doc.add_paragraph(); set_para(p, after=5, line=1.3)
    add_text(p, "上午、下午和晚上，小鹿会守着学习启动。它不是新的打卡，也不会制造失败记录；真正需要加强监督的是 09:00-12:00 与 15:00-18:00 两段约定学习时间。", 8.3)

    starter = doc.add_table(rows=2, cols=2)
    starter.alignment = WD_TABLE_ALIGNMENT.CENTER
    starter_items = [
        ("现在开始", "立刻开始手动计时；需要时会启动并打开 YuReader。", "E8F1E5"),
        ("十分钟后", "给自己一次缓冲；这一时段只允许延后一次。", LILAC),
        ("跳过这段", "今天这段不再追问，不记失败，也不影响其他记录。", CREAM),
        ("进入学习", "阅读、做题或查询状态生效后，小鹿停止催促并回到驻守点。", PEACH),
    ]
    for cell, (title, body, fill) in zip((c for row in starter.rows for c in row.cells), starter_items):
        clear_cell(cell); set_cell_shading(cell, fill); set_cell_border(cell, PURPLE_DARK, 9)
        p = cell.paragraphs[0]; set_para(p, after=2)
        add_text(p, title, 8.6, True, PURPLE_DARK)
        p = cell.add_paragraph(); set_para(p, line=1.2)
        add_text(p, body, 7.15, False, INK)

    add_note_box(doc, "学习台开着，却还没有开始", "停留在 YuReader 首页不会计算学习时间。进入阅读、做题或查询后才算有效学习；回到首页或暂停后，小鹿会按规则再次提醒。", "FCE7E8", ROSE)

    p = doc.add_paragraph(); set_para(p, before=7, after=3)
    add_text(p, "她真的会说话", 10.7, True, PURPLE_DARK)
    add_bullet(doc, "离线语音", "语音已经随安装包放在本机，不调用在线 TTS，也不会上传文字或录音。", PURPLE)
    add_bullet(doc, "逐字气泡", "文字会配合语音长度逐字出现；重要提醒更像面对面说出来。", PEACH)
    add_bullet(doc, "点击试听", "在统计页点击小鹿人像，会随机播放一句台词并匹配相应动作。", GREEN)
    add_bullet(doc, "随时安静", "统计页可以关闭语音并调整音量；新提醒会打断旧语音，避免重叠。", LILAC)

    add_page(doc, "")
    add_label(doc, "PATROL", "强监督时段，小鹿会主动来找你")
    p = doc.add_paragraph()
    set_para(p, after=5, line=1.3)
    add_text(p, "“小鹿巡逻”默认开启，也可以在统计页随时关闭。它只在约定时段需要你开始或重新回到学习时出现，不会把普通休息变成新的失败记录。", 8.3)

    patrol = doc.add_table(rows=2, cols=2)
    patrol.alignment = WD_TABLE_ALIGNMENT.CENTER
    patrol_items = [
        (sprites["run_right"], "还没有开始", "09:00-12:00 或 15:00-18:00 迟迟没有进入学习，小鹿会在屏幕上走走停停，用随机台词把你叫回来。", LILAC),
        (sprites["waiting"], "开始后又停下", "已经启动却超过约十五分钟没有继续手动计时或 YuReader 有效活动，巡逻会再次出现。", "FCE7E8"),
        (sprites["wave"], "重新进入学习", "双击开始计时或 YuReader 恢复阅读、做题、查询后，她会停止催促，再回到学习驻守点。", "E8F1E5"),
        (sprites["review"], "21 点结算以后", "当天已经收进日记但没有继续学习时，她会偶尔在桌面散步；重新学习后立刻安静下来。", PEACH),
    ]
    for cell, (image, title, body, fill) in zip((c for row in patrol.rows for c in row.cells), patrol_items):
        clear_cell(cell)
        set_cell_shading(cell, fill)
        set_cell_border(cell, PURPLE_DARK, 9)
        p = cell.paragraphs[0]
        set_para(p, after=1, align=WD_ALIGN_PARAGRAPH.CENTER)
        p.add_run().add_picture(str(image), height=Cm(2.05))
        p = cell.add_paragraph()
        set_para(p, after=2, align=WD_ALIGN_PARAGRAPH.CENTER)
        add_text(p, title, 8.6, True, PURPLE_DARK)
        p = cell.add_paragraph()
        set_para(p, line=1.2, align=WD_ALIGN_PARAGRAPH.CENTER)
        add_text(p, body, 7.0, False, INK)

    add_note_box(doc, "打卡永远优先", "进入五个打卡窗口时，小鹿会停下巡逻并显示“我在”。只有处于学习计时状态才可成功；09:00、18:00、21:00 还会在需要时启动 YuReader。", CREAM, PURPLE)
    add_note_box(doc, "声音会逐级变严", "巡逻开始后的 0-5 分钟保持活泼，5-15 分钟转为认真，15-30 分钟会明确生气，超过 30 分钟进入最终警告。软件晚启动时会直接进入当时应有的档位。", "E8F1E5", GREEN)

    # Page 10: YuReader integration
    add_page(doc, "10")
    add_label(doc, "YUREADER", "阅读、做题与目标，收进同一本日记")
    p = doc.add_paragraph(); set_para(p, after=5, line=1.3)
    add_text(p, "当本机 YuReader 运行在 127.0.0.1:8775 时，共学日记会读取最少量的状态摘要。网页目标可随时修改，小鹿会同步百分比与完成结果。", 8.3)

    states = doc.add_table(rows=6, cols=2)
    states.alignment = WD_TABLE_ALIGNMENT.CENTER
    state_items = [
        ("READY", "学习台已打开，但仍在首页：不计时，小鹿会提醒你真正开始。"),
        ("LEARNING", "正在阅读、做题或复习页面进行有效学习。"),
        ("CONSULTING", "查资料或问 AI 时保留查询状态，不会立刻判定离开。"),
        ("PAUSED", "一段时间没有有效操作：暂停网页计时，回到页面操作即可恢复。"),
        ("CLOSED", "页面或服务关闭：立即退出联动状态，并回到原来的桌面位置。"),
        ("EVENTS", "目标达成与两项清关事件驱动动作、语音和奖励，不替代状态总数。"),
    ]
    for idx, (state, body) in enumerate(state_items):
        row = states.rows[idx]; no_split(row)
        for col, text_value in enumerate((state, body)):
            cell = row.cells[col]; clear_cell(cell)
            set_cell_shading(cell, LILAC if idx % 2 == 0 else CREAM)
            set_cell_border(cell, PURPLE_DARK, 8)
            p = cell.paragraphs[0]; set_para(p, line=1.16, align=WD_ALIGN_PARAGRAPH.CENTER if col == 0 else WD_ALIGN_PARAGRAPH.LEFT)
            add_text(p, text_value, 7.2 if col else 7.5, col == 0, PURPLE_DARK if col == 0 else INK, "Consolas" if col == 0 else "Microsoft YaHei")

    add_note_box(doc, "三个百分比", "阅读和做题按 YuReader 总目标计算；综合进度由两者各占 50%，再加入背词、错题攻坚、口腔背诵与打卡奖励，因此允许超过 100%。", "E8F1E5", GREEN)
    add_note_box(doc, "后端先启动，网页后打开", "需要唤醒学习台时，小鹿会先启动 Documents\\YuReader\\app.py 并等待健康检查。成功后优先复用已有标签页，不会先打开无法访问的空地址。", CREAM, PURPLE)

    # Page 11: movement and positions
    add_page(doc, "11")
    add_label(doc, "RUN TO YOU", "她会在不同的时刻，去该去的位置")
    p = doc.add_paragraph(); set_para(p, after=5, line=1.3)
    add_text(p, "小鹿现在有三类互不混淆的位置：平常停留的位置、学习驻守点，以及只用于重要提醒的屏幕中央。移动时会先水平、再垂直小跑过去。", 8.3)

    movement = doc.add_table(rows=3, cols=2)
    movement.alignment = WD_TABLE_ALIGNMENT.CENTER
    movement_items = [
        (sprites["run_right"], "打开 YuReader", "跑到学习驻守点；网页关闭后，再回到原来的自由位置。", LILAC),
        (sprites["waiting"], "一直停在首页", "后续提醒时跑到屏幕中央，等你回应或真正进入学习。", PEACH),
        (sprites["failed"], "学习停顿太久", "约三十分钟仍未恢复时来到中央提醒；不会每五分钟追着催。", "FCE7E8"),
    ]
    for row, (image_path, title, body, fill) in zip(movement.rows, movement_items):
        no_split(row)
        left, right = row.cells
        clear_cell(left); clear_cell(right)
        set_cell_shading(left, fill); set_cell_shading(right, fill)
        set_cell_border(left, PURPLE_DARK, 9); set_cell_border(right, PURPLE_DARK, 9)
        p = left.paragraphs[0]; set_para(p, align=WD_ALIGN_PARAGRAPH.CENTER)
        p.add_run().add_picture(str(image_path), height=Cm(2.15))
        p = right.paragraphs[0]; set_para(p, after=2)
        add_text(p, title, 8.8, True, PURPLE_DARK)
        p = right.add_paragraph(); set_para(p, line=1.22)
        add_text(p, body, 7.35, False, INK)

    add_note_box(doc, "保存自己的学习驻守点", "先把小鹿拖到想要的位置，再打开日记“今日”页，点击底部中央的位置图标。图标变黄即保存；以后打开 YuReader，她会自动跑到这里。", "E8F1E5", GREEN)
    add_note_box(doc, "提醒结束后会自己回去", "中央提醒结束后，YuReader 仍打开时回学习驻守点；网页已经关闭时回自由位置。临时提醒不会改写任何已保存的位置。", CREAM, PURPLE)

    # Page 12: statistics, local data and closing note
    add_page(doc, "12")
    add_label(doc, "OUR STORY", "日记只记录真正值得留下的事")
    stats = doc.add_table(rows=2, cols=2)
    stats.alignment = WD_TABLE_ALIGNMENT.CENTER
    stat_items = [
        ("累计学习时长", "手动与 YuReader 有效时长", LILAC),
        ("按时打卡", "五个时间点的到场记录", PEACH),
        ("双人书签", "综合进度达标的日子", "E8F1E5"),
        ("累计背词", "每日结算填写的单词数", CREAM),
    ]
    for cell, (title, body, fill) in zip((c for row in stats.rows for c in row.cells), stat_items):
        clear_cell(cell); set_cell_shading(cell, fill); set_cell_border(cell, PURPLE_DARK, 9)
        p = cell.paragraphs[0]; set_para(p, after=2, align=WD_ALIGN_PARAGRAPH.CENTER)
        add_text(p, title, 8.2, True, PURPLE_DARK)
        p = cell.add_paragraph(); set_para(p, line=1.15, align=WD_ALIGN_PARAGRAPH.CENTER)
        add_text(p, body, 6.8, False, MUTED)

    p = doc.add_paragraph(); set_para(p, before=7, after=3)
    add_text(p, "这套系统刻意保持简单", 10.7, True, PURPLE_DARK)
    add_bullet(doc, "不记录暂停时长", "只累计手动开启或 YuReader 确认有效的学习时间。", GREEN)
    add_bullet(doc, "不追逐连续天数", "偶尔中断不会变成需要找补的压力，累计完成永远保留。", PEACH)
    add_bullet(doc, "数据只留在本机", "没有账号、排行榜或云同步；YuReader 联动也只访问本机地址。", PURPLE)

    closing = doc.add_table(rows=1, cols=1)
    closing.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = closing.cell(0, 0); clear_cell(cell); set_cell_shading(cell, PURPLE_DARK); set_cell_border(cell, PURPLE_DARK, 16)
    p = cell.paragraphs[0]; set_para(p, after=3, align=WD_ALIGN_PARAGRAPH.CENTER)
    add_text(p, "最后想告诉你", 9, True, YELLOW)
    p = cell.add_paragraph(); set_para(p, line=1.4, align=WD_ALIGN_PARAGRAPH.CENTER)
    add_text(p, "电脑里的小鹿不会代替现实里的你。\n她只是把我们的约定变得看得见，也把那些认真过的日子好好留下来。", 8.7, True, WHITE)
    p = doc.add_paragraph(); set_para(p, before=5, align=WD_ALIGN_PARAGRAPH.CENTER)
    p.add_run().add_picture(str(sprites["idle"]), height=Cm(2.7))
    p = doc.add_paragraph(); set_para(p, align=WD_ALIGN_PARAGRAPH.CENTER)
    add_text(p, "明天也一起吧。", 10.5, True, PURPLE_DARK)

    doc.save(DOCX_PATH)
    print(DOCX_PATH)


if __name__ == "__main__":
    build_document()
