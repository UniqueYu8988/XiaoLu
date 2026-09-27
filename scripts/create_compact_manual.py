"""Generate the concise illustrated Windows / Android guide with public assets only."""
from pathlib import Path
import json
from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, Color
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/xiaolu-study-guide.pdf"
TMP = ROOT / "tmp/pdfs/compact-manual"
TMP.mkdir(parents=True, exist_ok=True)
FONT = Path("C:/Windows/Fonts/msyh.ttc")
pdfmetrics.registerFont(TTFont("CN", str(FONT), subfontIndex=0))
pdfmetrics.registerFont(TTFont("CNBold", "C:/Windows/Fonts/msyhbd.ttc", subfontIndex=0))
W, H = 420, 595
PURPLE, DARK, PAPER, CREAM, MUTED = map(HexColor, ["#76558F", "#4B315E", "#FFFDF7", "#FFF8E9", "#756A77"])
LILAC, GREEN, PEACH, GOLD = map(HexColor, ["#E9DDF1", "#E8F1E5", "#FBE8DA", "#F4D57B"])
C = canvas.Canvas(str(OUT), pagesize=(W, H))
C.setTitle("共学日记 · Windows 2.0.4 / Android 1.0.0")
C.setAuthor("XiaoLu")

def text(value, x, y, size=10, color=DARK):
    C.setFont("CNBold" if size >= 12 else "CN", size); C.setFillColor(color); C.drawString(x, y, value)

def paragraph(value, x, y, width=350, size=10, leading=17):
    line = ""
    for char in value:
        if char == "\n" or (pdfmetrics.stringWidth(line + char, "CN", size) > width and char not in "，。；：！？、”）"):
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
    # A barely visible graph-paper field keeps the handbook in the app's world.
    C.setStrokeColor(HexColor("#F0EAE3")); C.setLineWidth(.25)
    for x in range(30,391,15): C.line(x,48,x,486)
    for y in range(48,487,15): C.line(30,y,390,y)
    labels={2:"HELLO / DESKTOP",3:"ACTIONS / VOICE",4:"CHECK IN / DAILY",5:"BOOKMARKS / REWARDS",6:"JOURNAL / TODO",7:"START / COMPANION",8:"ANDROID / CONNECTION",9:"WIDGET / PROGRESS",10:"WIDGET / STUDY TIME"}
    C.setFillColor(DARK); C.rect(30,552,29,17,fill=1,stroke=0)
    text(f"{number:02d}",36,557,9,CREAM); text(labels[number],69,557,8,PURPLE)
    text(title, 30, 519, 23)
    text(subtitle, 30, 499, 8.7, MUTED)
    star(379,560,5,GOLD)
    C.setStrokeColor(HexColor("#D9C9E2")); C.setLineWidth(.5); C.line(30,37,390,37)
    text("XIAOLU  /  共学日记",30,24,7,PURPLE)
    text("Windows 2.0.4 · Android 1.0.0",143,24,7,MUTED)
    for i in range(10):
        C.setFillColor(PURPLE if i+1==number else LILAC); C.rect(314+i*7,24,4,4,fill=1,stroke=0)
    text(f"{number:02d}",385,23,8,PURPLE)

def box(x,y,w,h,color=CREAM):
    C.setFillColor(HexColor("#E4D9E9")); C.rect(x+2,y-2,w,h,fill=1,stroke=0)
    C.setFillColor(color); C.rect(x,y,w,h,fill=1,stroke=0)
    C.setFillColor(PAPER)
    for px,py in [(x,y),(x+w-4,y),(x,y+h-4),(x+w-4,y+h-4)]: C.rect(px,py,4,4,fill=1,stroke=0)
    C.setFillColor(PURPLE); C.rect(x+9,y+h-3,15,3,fill=1,stroke=0)

def star(x,y,s=5,color=GOLD):
    C.setFillColor(color)
    C.rect(x-s/2,y-s*1.5,s,s*3,fill=1,stroke=0)
    C.rect(x-s*1.5,y-s/2,s*3,s,fill=1,stroke=0)

def section(title,x,y):
    C.setFillColor(PURPLE); C.rect(x,y-1,4,13,fill=1,stroke=0)
    text(title,x+12,y,14)

def note(title,body,x,y,w,h,color=LILAC):
    box(x,y,w,h,color)
    text(title,x+14,y+h-24,12)
    paragraph(body,x+14,y+h-45,w-28,9,15)

def sprite(row,col,name):
    im=Image.open(ROOT/"assets/xiaolu/spritesheet.webp").convert("RGBA")
    cw,ch=im.width//8,im.height//11
    frame=im.crop((col*cw,row*ch,(col+1)*cw,(row+1)*ch))
    frame=frame.crop(frame.getchannel("A").getbbox())
    path=TMP/f"{name}.png"; frame.save(path); return path

art=ROOT/"android-app/app/src/main/res/drawable-nodpi"
C.setFillColor(PAPER); C.rect(0,0,W,H,fill=1,stroke=0)
box(30,78,360,480)
C.setStrokeColor(DARK); C.setLineWidth(3); C.rect(30,78,360,480,fill=0,stroke=1)
text("XIAOLU STUDY JOURNAL",114,529,11,PURPLE)
text("共学日记说明书",100,490,28)
text("一份只属于我们两个人的学习约定",86,463,12,MUTED)
image(sprite(3,2,"cover_wave"),123,207,174,232)
for sx,sy,ss in [(91,365,6),(325,314,5),(104,250,3),(314,420,4)]: star(sx,sy,ss)
image(ROOT/"assets/bookmarks/bookmark-friend.png",51,286,45,116)
image(ROOT/"assets/bookmarks/bookmark-self.png",324,224,45,116)
text("她不是宠物。",164,181,15)
paragraph("她是住在桌面上的学习搭子，\n替现实里的你来陪我、提醒我，\n也见证我们一起认真过的每一天。",89,154,257,10,18)
text("Windows 2.0.4  /  Android 1.0.0",111,52,9,PURPLE)
text("01 / 10",338,24,8,PURPLE)
C.showPage()

page(2,"先认识一下小鹿","桌面上的陪伴，手机上的一页近况。")
image(sprite(3,2,"wave"),38,299,112,185)
text("她不是等待喂食的宠物。",165,464,14)
paragraph("她会陪你开始学习，提醒约定，也把每天的努力收成一枚书签。电脑负责保存，手机让查看和处理待办更顺手。",165,435,220,11,20)
controls=[("双击小鹿","开始或结束手动计时。多段时间按天累计。"),("右键小鹿","打开今日、任务、待办、统计；记录和书签从右上角进入。"),("拖动小鹿","调整自由位置；自动移动时会小跑，学习提醒可用巡逻与离线语音。")]
for i,(title,body) in enumerate(controls):
    y=227-i*64; box(30,y,360,55,[LILAC,GREEN,PEACH][i])
    text(f"0{i+1}",43,y+21,19,PURPLE); text(title,84,y+35,12); paragraph(body,84,y+18,291,9,14)
paragraph("安装 Windows MSI 后即可独立运行，不依赖 Codex。电脑版设置可控制自启、学习联动、巡逻和语音。",30,65,360,8,12)
C.showPage()

page(3,"动作，就是她的语言","不只会动，她也会用声音陪你。")
actions=[(9,0,"看向你","日常待机与鼠标跟随"),(7,3,"认真陪伴","一段专注的学习"),(1,0,"小跑过来","拖动、驻守与提醒移动"),(3,2,"挥手报到","在场确认与打招呼"),(4,2,"开心一下","打卡或目标达成反馈"),(5,5,"有点失落","提醒与部分事件反馈")]
for i,(row,col,title,body) in enumerate(actions):
    x=30+(i%3)*124; y=317-(i//3)*149
    C.setFillColor([LILAC,GREEN,PEACH,PEACH,LILAC,GREEN][i]); C.rect(x,y+43,112,96,fill=1,stroke=0)
    star(x+94,y+122,2)
    image(sprite(row,col,f"action_{i}"),x+22,y+49,68,83)
    text(title,x+10,y+31,12)
    paragraph(body,x+10,y+14,94,8,12)
section("一句话，也可以有温度",30,144)
paragraph("语音随安装包离线播放，不接在线 TTS。小鹿会从不同台词中选择一句，气泡配合语音逐字出现，减少机械重复。",30,120,360,10,17)
paragraph("统计页点击小鹿可随机试听并看动作；语音开关与音量也在那里。重要提醒有优先级，避免声音互相叠加。",30,76,360,9,16)
C.showPage()

page(4,"一天五次，只确认我在","09:00 · 12:00 · 15:00 · 18:00 · 21:00")
image(sprite(3,2,"check_wave"),309,390,65,94)
paragraph("不用写一段话，只在约定时间回应“我在”。成功打卡要求正在手动计时，或 YuReader 已进入有效学习／查询状态。",30,478,262,11,19)
schedule=[("09:00","一起给今天开个头","08:55 - 09:05"),("12:00","上午到这里，和我打个招呼","11:55 - 12:05"),("15:00","下午这一程，再一起开始","14:55 - 15:05"),("18:00","今天也坚持到这里啦","17:55 - 18:05"),("21:00","确认在场，再把今天收好","20:55 - 21:05")]
for i,(time,caption,window) in enumerate(schedule):
    y=335-i*52
    C.setStrokeColor(HexColor("#CBB9D5")); C.setLineWidth(2)
    if i<4: C.line(134,y+25,134,y-27)
    C.setFillColor(PURPLE); C.rect(130,y+21,8,8,fill=1,stroke=0)
    text(time,37,y+21,18); text(caption,155,y+23,11)
    text(window,155,y+7,8,MUTED)
section("每次有效期为前后五分钟",30,104)
paragraph("09:00、18:00、21:00 会在需要时先启动学习台后端，再打开或复用网页。只停在首页、暂停或关闭时不算有效打卡；错过如实留空，不扣掉已有成果。",30,82,360,9,16)
C.showPage()

page(5,"努力，收成书签","任务跟随 YuReader，待办留给想到但还没做的事。")
bookmarks=[("bookmark-friend.png","阅读书签","阅读完成度达到 100%。"),("bookmark-together.png","双人书签","综合完成度达到 100%。"),("bookmark-self.png","做题书签","做题完成度达到 100%。")]
for i,(filename,title,body) in enumerate(bookmarks):
    x=30+i*124
    C.setFillColor([GREEN,LILAC,PEACH][i]); C.rect(x,313,112,169,fill=1,stroke=0)
    image(ROOT/"assets/bookmarks"/filename,x,364,112,128)
    text(title,x+8,345,12); paragraph(body,x+8,324,106,9,14)
box(30,170,360,126)
text("综合完成度，可以超过 100%",43,274,14)
paragraph("基础阅读和做题各占 50%，按实时完成比例累积。背词每 100 个给阅读侧加 10 个百分点；错题攻坚、每日复习每完成一项给做题侧加 10 个百分点。在场打卡每次再给综合加 1 个百分点。详细规则可从任务页底部打开。",43,250,330,10,17)
text("待办不等于每天必须清空",30,143,14)
paragraph("普通待办可以放想法、计划和稍后处理的事；只有标记每日刷新的项目参与晚间事项提醒。状态可撤销，文字可编辑。",30,121,360,10,17)
paragraph("今日结算保留时长、进度、复习、在场和三科摘要。历史兼容旧格式，可补写一句话，也可选用本机日记标题同步。",30,67,360,9,15)
C.showPage()

page(6,"把今天，收进日记","结算留下学习事实，待办收下暂时不急的想法。")
image(sprite(8,4,"review"),304,392,73,98)
section("今日结算",30,478)
paragraph("学习时长、综合完成度、错题攻坚、每日复习、在场打卡，以及口腔、英语、政治的进度放在今日。背词填写当天总数，不把重复提交累加。",30,452,256,10,18)
box(30,270,360,105)
text("21点开始收尾，努力仍可继续",43,351,13)
paragraph("晚间结算提醒会告诉你今天走到了哪里；继续学习不会被结算动作截断。夜间不再用语音催促，学习日按既有凌晨2点边界归档。达成的书签按天、按类型只奖励一次。",43,329,330,10,18)
section("待办：不是每天必须清空的清单",30,246)
paragraph("可以记下想做但还没时间做的事。直接编辑文字，点击切换完成或撤销，只有标记每日刷新的事项参与晚间提醒。内容多时分页，不挤占今日目标。",30,222,360,10,18)
section("记录：努力与生活都能留下一句",30,145)
paragraph("从右上角进入学习记录，双击一句话可补写或修改。可选连接本机 Markdown 日记库，只同步日期与标题，不复制正文；旧日期保留原格式。",30,122,360,10,18)
paragraph("累计统计保留学习时长、按时打卡、双人书签和背词。资料保存在电脑；手机仅获取授权摘要，不公开私人日记。",30,62,360,9,16)
C.showPage()

page(7,"最难的，是迈出第一步","启动提醒、巡逻和 YuReader，合成一份陪伴。")
image(sprite(1,0,"running"),295,387,85,101)
text("迟迟没开始，她会来找你",30,477,15)
paragraph("09:00-12:00、15:00-18:00 是约定学习时段。启动提醒可以现在开始、稍后再来，或跳过这段；巡逻开启时，小鹿会走走停停，用分级台词提醒回到学习。",30,450,252,10,18)
box(30,278,360,104)
text("打开网页，不等于已经开始学习",43,358,13)
paragraph("停留在 YuReader 首页不计时；阅读、做题和查询以网页有效状态为准。网页调整目标后，三枚书签与百分比同步变化。手机打开学习网页与桌面活动分开识别，避免误触发电脑动作。",43,335,330,10,18)
text("她会去该去的位置",30,253,15)
paragraph("学习台打开时去驻守点，关闭后回自由位置；需要你回应时可来到屏幕中央。移动先水平、再垂直，重要提醒结束后返程，不改写保存的位置。",30,227,360,10,18)
settings=[("startup.png","自启"),("yuquiz.png","学习联动"),("patrol.png","巡逻"),("voice.png","语音")]
for i,(file,label) in enumerate(settings):
    x=30+i*92
    C.setFillColor([GREEN,PEACH,LILAC,CREAM][i]); C.rect(x,81,84,79,fill=1,stroke=0)
    image(ROOT/"assets/ui/settings"/file,x+18,104,50,50)
    text(label,x+14,88,11)
paragraph("这些开关都在统计页，按自己的需要开启。私人路径、网址与连接信息只放本机配置；卸载或迁移前请备份电脑记录。",30,60,360,9,16)
C.showPage()

page(8,"把小鹿带到手机","Android 1.0.0 · 进度、待办、背词和学习入口。")
box(265,351,118,131,LILAC)
text("HELLO, YOU",281,461,8,PURPLE)
image(art/"widget_time_0.png",270,365,108,85)
star(365,443,3)
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
for p,title,subtitle,prefix,rows in [(9,"今日进度，会长出星光","2×2 方形组件：数据、一句话、大幅透明底像素插画。","progress",progress),(10,"学习时长，学进小宇宙","每两小时一档；超过10小时继续用最高档，数字不封顶。","time",times)]:
    page(p,title,subtitle)
    hero=0 if p==9 else 4
    box(30,284,360,194,LILAC if p==9 else GREEN)
    text("TODAY / 组件示意",47,453,8,PURPLE)
    text("18.0%" if p==9 else "8小时20分",47,414 if p==9 else 428,30)
    text(rows[hero][1],47,390 if p==9 else 405,11)
    image(art/f"widget_{prefix}_{hero}.png",149,293,225,145 if p==9 else 108)
    text(rows[hero][0],47,306,9,MUTED)
    for k,i in enumerate(j for j in range(5) if j!=hero):
        x=30+(k%2)*184; y=176-(k//2)*95
        box(x,y,176,82,[CREAM,PEACH,GREEN,LILAC][k])
        image(art/f"widget_{prefix}_{i}.png",x+4,y+20,80,58)
        paragraph(rows[i][0],x+88,y+59,81,9,14)
        paragraph(rows[i][1],x+88,y+29,81,8,12)
    paragraph("长按手机桌面添加对应小组件。更新旧版后可重新添加；卡片保持正方形。正常状态隐藏同步时间，旧缓存提示“离线摘要”。后台同步约30分钟一次，系统可能延后；组件不自行计时。",30,57,360,8,12)
    C.showPage()
C.save()
print(OUT)
