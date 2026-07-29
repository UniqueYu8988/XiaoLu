<div align="center">
  <img src="assets/icons/app-icon.svg" width="112" alt="小鹿图标" />
  <h1>共学日记</h1>
  <p>不是桌面宠物，而是住在桌面上的学习搭子。</p>
  <p>
    <img alt="Version" src="https://img.shields.io/badge/version-1.2.0-76558f" />
    <img alt="Platform" src="https://img.shields.io/badge/platform-Windows-4b315e" />
    <img alt="Data" src="https://img.shields.io/badge/data-local--first-a9c99e" />
    <img alt="License" src="https://img.shields.io/badge/code%20license-MIT-f4d57b" />
  </p>
  <p>
    <a href="https://github.com/UniqueYu8988/XiaoLu/releases/latest"><strong>下载安装包</strong></a>
    ·
    <a href="docs/xiaolu-study-guide.pdf"><strong>下载 PDF 说明书</strong></a>
  </p>
</div>

## 图文说明书

下面就是完整说明书。它介绍了打卡、计时、任务与悬赏、书签、离线语音、YuQuiz 联动，以及小鹿最新的位置与提醒机制。

<img src="docs/images/xiaolu-study-guide-long.png" alt="共学日记 v1.2.0 完整图文说明书" />

## 安装与使用

1. 在 [Releases](https://github.com/UniqueYu8988/XiaoLu/releases) 下载最新的 `xiaolu-study-mate-*-x64.msi`。
2. 双击安装；首次启动后，小鹿会出现在桌面并默认随 Windows 登录启动。
3. 双击小鹿开始或结束手动学习计时，右键打开共学日记，拖动可以调整自由位置。

安装包暂未使用商业代码签名，因此 Windows 可能显示“未知发布者”。

## 数据、YuQuiz 与隐私

学习记录默认保存在：

```text
%APPDATA%\xiaolu-desktop-pet\xiaolu-study-state.json
```

应用没有账号、排行榜或云同步。可选的 YuQuiz 联动只读取本机 `http://127.0.0.1:8765` 提供的学习状态与当日题量；不会读取题目、答案、API Key 或个人笔记，也不会把数据上传到外部服务器。卸载前如需保留日记，请备份上面的状态文件。

仓库不会收录使用者的日记、任务、打卡、位置、数据库、日志、密钥或备份。原始肖像、源录音和私人制作文件也不随项目发布；常见的本地数据路径已经加入 `.gitignore`。

## 本地开发与打包

需要 Node.js 20 或更高版本，以及 pnpm。

```powershell
git clone https://github.com/UniqueYu8988/XiaoLu.git
cd XiaoLu
pnpm install
pnpm check
pnpm start
```

生成 Windows x64 MSI：

```powershell
pnpm package:msi
```

安装包输出到 `release/`。MSI 的 `upgradeCode` 已固定，后续版本只更新版本号，不要更换它。

## 项目结构

```text
assets/                 图标、角色动画、书签与离线语音
docs/                   PDF 说明书、预览长图和版本说明
scripts/                构建、说明书与 MSI 辅助脚本
src/game.ts             学习记录、打卡、任务、书签和统计逻辑
src/main.ts             Electron 主进程、窗口、联动、移动与自启动
src/renderer/           桌面角色与共学日记界面
tests/                  核心状态逻辑测试
```

## 项目来源

- 角色动画素材最初按照 Codex v2 动画宠物素材规范整理；应用安装后可以完全脱离 Codex 独立运行。
- 独立桌面窗口的早期实现参考了 [OpenPets](https://github.com/alvinunreal/openpets) 的思路，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
- 共学日记的学习计时、打卡、启动监督、任务、书签、语音、YuQuiz 联动和本地存储均在本项目中重新实现。

## 许可证

共学日记已经完整开源。项目原创的代码、角色动画、图标、书签、离线语音、文档和说明书素材统一采用宽松的 [MIT License](LICENSE)，可以自由使用、修改、分发或制作自己的桌面搭子；分发时请保留版权声明和许可证。

个人学习数据不会随仓库公开。完整授权与隐私边界见 [ASSET_LICENSE.md](ASSET_LICENSE.md)，第三方声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
