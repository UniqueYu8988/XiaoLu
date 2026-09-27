"""Generate the concise illustrated Windows / Android guide with public assets only."""
from pathlib import Path
import json
from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/xiaolu-study-guide.pdf"
TMP = ROOT / "tmp/pdfs/compact-manual"
TMP.mkdir(parents=True, exist_ok=True)
FONT = Path("C:/Windows/Fonts/msyh.ttc")
pdfmetrics.registerFont(TTFont("CN", str(FONT), subfontIndex=0))
W, H = 420, 595
PURPLE, DARK, PAPER, CREAM, MUTED = map(HexColor, ["#76558F", "#4B315E", "#FFFDF7", "#FFF8E9", "#756A77"])
C = canvas.Canvas(str(OUT), pagesize=(W, H))
C.setTitle("共学日记 · Windows 2.0.4 / Android 1.0.0")
C.setAuthor("XiaoLu")

def text(value, x, y, size=10, color=DARK):
    C.setFont("CN", size); C.setFillColor(color); C.drawString(x, y, value)

def paragraph(value, x, y, width=350, size=10, leading=17):
    line = ""
    for char in value:
        if char == "\n" or pdfmetrics.stringWidth(line + char, "CN", size) > width:
            text(line, x, y, size); y -= leading; line = "" if char == "\n" else char
        else: line += char
    if line: text(line, x, y, size); y -= leading
    return y

def image(path, x, y, width, height):
    im = Image.open(path).convert("RGBA")
    # Keep source assets untouched; bound embedded resolution to the printed size.
    im.thumbnail((600, 800), Image.Resampling.NEAREST)
    C.drawImage(ImageReader(im), x, y, width, height, preserveAspectRatio=True, anchor="c", mask="auto")

def page(number, title, subtitle):
    C.setFillColor(PAPER); C.rect(0, 0, W, H, fill=1, stroke=0)
    C.setStrokeColor(DARK); C.setLineWidth(2); C.line(30, H-30, W-30, H-30)
    text(title, 30, H-67, 24)
    text(subtitle, 30, H-89, 9, MUTED)
    text(f"共学日记  /  Windows 2.0.4 · Android 1.0.0", 30, 24, 7, MUTED)
    text(f"{number:02d} / 05", W-64, 24, 8, PURPLE)

def box(x,y,w,h,color=CREAM):
    C.setFillColor(color); C.setStrokeColor(DARK); C.setLineWidth(.7); C.rect(x,y,w,h,fill=1,stroke=1)

def sprite(row,col,name):
    im=Image.open(ROOT/"assets/xiaolu/spritesheet.webp").convert("RGBA")
    cw,ch=im.width//8,im.height//11
    frame=im.crop((col*cw,row*ch,(col+1)*cw,(row+1)*ch))
    frame=frame.crop(frame.getchannel("A").getbbox())
    path=TMP/f"{name}.png"; frame.save(path); return path

art=ROOT/"android-app/app/src/main/res/drawable-nodpi"
page(1,"共学日记","桌面上的陪伴，手机上的一页近况。")
image(sprite(3,2,"wave"),38,299,112,185)
text("她不是等待喂食的宠物。",165,464,14)
paragraph("她会陪你开始学习，提醒约定，也把每天的努力收成一枚书签。电脑负责保存，手机让查看和处理待办更顺手。",165,435,220,11,20)
controls=[("双击小鹿","开始或结束手动计时。多段时间按天累计。"),("右键小鹿","打开今日、任务、待办、统计；记录和书签从右上角进入。"),("拖动小鹿","调整自由位置；自动移动时会小跑，学习提醒可用巡逻与离线语音。")]
for i,(title,body) in enumerate(controls):
    y=227-i*64; box(30,y,360,55); text(title,42,y+35,12); paragraph(body,42,y+18,334,9,14)
paragraph("安装 Windows MSI 后即可独立运行，不依赖 Codex。电脑版设置可控制自启、学习联动、巡逻和语音。",30,49,360,8,12)
C.showPage()

page(2,"努力，收成书签","任务跟随 YuReader，待办留给想到但还没做的事。")
bookmarks=[("bookmark-friend.png","阅读书签","阅读完成度达到 100%。"),("bookmark-together.png","双人书签","综合完成度达到 100%。"),("bookmark-self.png","做题书签","做题完成度达到 100%。")]
for i,(filename,title,body) in enumerate(bookmarks):
    x=30+i*124; image(ROOT/"assets/bookmarks"/filename,x,364,112,128)
    text(title,x+8,345,12); paragraph(body,x+8,324,106,9,14)
box(30,170,360,126)
text("综合完成度，可以超过 100%",43,274,14)
paragraph("基础阅读和做题各占 50%，按实时完成比例累积。背词每 100 个给阅读侧加 10 个百分点；错题攻坚、每日复习每完成一项给做题侧加 10 个百分点。在场打卡每次再给综合加 1 个百分点。详细规则可从任务页底部打开。",43,250,330,10,17)
text("待办不等于每天必须清空",30,143,14)
paragraph("普通待办可以放想法、计划和稍后处理的事；只有标记每日刷新的项目参与晚间事项提醒。状态可撤销，文字可编辑。",30,121,360,10,17)
paragraph("今日结算保留时长、进度、复习、在场和三科摘要。历史兼容旧格式，可补写一句话，也可选用本机日记标题同步。",30,67,360,9,15)
C.showPage()

page(3,"把小鹿带到手机","Android 1.0.0 · 进度、待办、背词和学习入口。")
image(art/"widget_time_0.png",245,361,145,104)
text("几个栏目，同一份近况",30,476,15)
paragraph("今日：看结算，提交今天背词总数。\n任务：看三枚目标书签与得分规则。\n待办：新增、编辑、完成或删除事项。\n统计：累计成果、配对和手机提醒。\n书签与历史：从右上角进入。",30,450,219,10,21)
text("第一次配对",30,321,15)
paragraph("1. 电脑运行共学日记，两台设备连接同一 Tailscale 网络。\n2. 电脑托盘点“手机配对”，获取地址和五分钟有效的配对码。\n3. 手机输入电脑 HTTPS 地址，再填配对码。个人预设构建可省去地址；公开 APK 不含私人地址。",30,296,360,10,18)
box(30,142,360,68)
text("长按与分享，让待办更顺手",43,190,12)
paragraph("长按应用图标可记待办、填单词或去学习。其他应用分享文字到共学日记会生成待办草稿，确认后才保存。",43,170,331,9,15)
text("手机提醒默认关闭",30,119,13)
paragraph("统计页可选择轻提醒、声音振动或约定提醒，时点为 9、15、21 点。约定每隔 10 分钟追加提醒，每轮最多三次；可推迟或当天休息。正在学习的最新摘要会抑制催促，系统省电可能延迟通知。",30,98,360,9,15)
paragraph("断线只看缓存，编辑需连接电脑。没有公网数据服务；源录音、私人日记和配对信息不随安装包发布。",30,45,360,8,12)
C.showPage()

progress=[("0–20%","我陪你，慢慢开始。"),("大于20% · 小于40%","已经走起来啦。"),("40–79.99%","看，我们越来越近了。"),("80–99.99%","就快把今天点亮啦。"),("100%及以上","今天的约定，做到啦！")]
times=[("0–不足2小时","陪你翻开今天。"),("2–不足4小时","已经有点学者气质啦。"),("4–不足6小时","知识开始绕着你转啦。"),("6–不足8小时","学进小宇宙，也记得歇歇。"),("8小时及以上","今天好投入，抱抱再休息。")]
for p,title,subtitle,prefix,rows in [(4,"今日进度，会长出星光","2×2 方形组件：数据、一句话、大幅透明底像素插画。","progress",progress),(5,"学习时长，学进小宇宙","每两小时一档；超过10小时继续用最高档，数字不封顶。","time",times)]:
    page(p,title,subtitle)
    for i,(range_,caption) in enumerate(rows):
        y=398-i*81; box(30,y,360,74)
        image(art/f"widget_{prefix}_{i}.png",35,y+2,111,70)
        text(range_,158,y+49,12)
        paragraph(caption,158,y+26,222,10,15)
    paragraph("长按手机桌面添加对应小组件。更新旧版后可重新添加；卡片保持正方形。正常状态隐藏同步时间，旧缓存提示“离线摘要”。后台同步约30分钟一次，系统可能延后；组件不自行计时。",30,57,360,8,12)
    C.showPage()
C.save()
print(OUT)
