<div align="center">
  <img src="assets/icons/app-icon.svg" width="112" alt="小鹿图标" />
  <h1>共学日记</h1>
  <p>把朋友的陪伴，留在桌面，也带在身边。</p>
  <p>
    <img alt="Windows" src="https://img.shields.io/badge/Windows-2.0.5-76558f" />
    <img alt="Android" src="https://img.shields.io/badge/Android-1.0.0-76558f" />
    <img alt="Data" src="https://img.shields.io/badge/data-local--first-a9c99e" />
    <img alt="License" src="https://img.shields.io/badge/license-MIT-f4d57b" />
  </p>
  <p>
    <a href="https://github.com/UniqueYu8988/XiaoLu/releases"><strong>下载 Windows 安装包</strong></a>
    · <a href="https://github.com/UniqueYu8988/XiaoLu/releases/tag/android-v1.0.0"><strong>下载 Android 应用</strong></a>
    · <a href="docs/xiaolu-study-guide.pdf"><strong>PDF 说明书</strong></a>
  </p>
</div>

## 和小鹿一起，把每一天过好

![共学日记：桌面陪伴、学习目标、日记与手机组件](docs/images/xiaolu-study-guide-long.png)

## 改造成自己的桌面搭子

这个项目从一张朋友的头像开始，通过持续对话、试用和修改逐渐长成。可以 Fork 后沿着以下路线迁移，不必一次重写所有功能：

1. **角色与动作**：先在 Codex Pet 中制作并验证角色图集，再替换 `assets/xiaolu/pet.json` 和 `spritesheet.webp`。现有素材为 v2、8 × 11 图集；安装后的软件不依赖 Codex。
2. **声音与装饰**：替换 `assets/voice/`、`assets/bookmarks/` 和 `assets/ui/`，同步核对台词、语音和动作。已有语音离线播放，无需接入在线 TTS。
3. **规则与界面**：学习、打卡和奖励规则在 `src/game.ts`；窗口、提醒和语音在 `src/main.ts`；页面在 `src/renderer/`。先换角色、名称和一句提醒，再逐项调整。
4. **学习工具联动**：参考 `src/yureader.ts`，让自己的工具提供最少量的本机状态接口。明确区分学习状态、目标进度与动作事件，不共享正文或密钥。
5. **手机适配**：Android 项目位于 `android-app/`，通过 Tailscale 与电脑配对。公开安装包不包含个人地址；连接、配置及编译方法见 [Android 指南](android-app/README.md)。

Vibe coding 的实用经验：用“操作 → 实际结果 → 预期结果”和截图描述问题；先诊断再修改；明确哪些已有行为不能改变。每次只改一组相关功能，规则跑测试，界面看实际效果，并保留可回退的提交。

## 开发与打包

需要 Node.js 20+ 和 pnpm：

```powershell
git clone https://github.com/UniqueYu8988/XiaoLu.git
cd XiaoLu
pnpm install
pnpm check
pnpm start
```

Windows 安装包：`pnpm package:msi`，输出到 `release/`。沿用现有 MSI `upgradeCode`，以便覆盖升级。安装包尚未商业签名，Windows 可能提示未知发布者。

**注意数据隔离**：当前开发版与安装版共用 `%APPDATA%\xiaolu-desktop-pet\`。测试前备份，或按 [运行与数据维护](docs/development/operations.md) 确认隔离；不要把启动开发版当成无风险预览。日记、配置、数据库、密钥、日志和源录音不要提交到仓库。

## 授权与来源

代码与可公开素材的授权见 [MIT License](LICENSE) 和 [素材授权说明](ASSET_LICENSE.md)。角色动画起点为 Codex v2 素材规范；早期桌面窗口参考 OpenPets，详见 [第三方声明](THIRD_PARTY_NOTICES.md)。个人学习记录不随仓库公开。
