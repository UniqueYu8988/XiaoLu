# 共学日记 Android 伴侣端

原生 Android 应用，与 Windows 共学日记同步今日进度和待办。持久记录仍由电脑保存；今日背词可从手机提交给 YuReader，同日数量按总数覆盖而非累加。学科卡片和学习快捷入口通过系统浏览器打开 YuReader 的 Tailscale 网页，回到应用时刷新。手机界面保留桌面版的「今日、任务、待办、统计」四栏，以及独立的「学习记录」「书签收藏」「得分说明」。小鹿使用同一张原始动画表，书签、结算贴纸和像素字体也沿用桌面素材。

手机可在线新增、修改、完成、设为每日刷新或删除待办；断线时只显示上一次摘要，不排队修改。学习记录与设置在手机上暂时只读。授权手机的摘要会包含历史记录中的一句话／外部日记标题，但不包含日记正文、Markdown 路径、YuReader 原始资料或完整桌面设置；这些内容不会进入仓库。

## 编译

需要 JDK 17、Android SDK API 36 和 Build Tools 36。运行 `.\gradlew.bat :app:assembleDebug`，调试 APK 在 `app/build/outputs/apk/debug/app-debug.apk`。工程无 Android Studio 强制依赖。

## 连接两台设备

1. 电脑和手机登录同一个 Tailscale tailnet。Windows 共学日记启动后会在 `127.0.0.1:8787` 提供仅本机可访问的手机接口。
2. 电脑端托盘菜单点「手机配对」。小鹿会检查专用 HTTPS 端口 `8786`，空闲时自动配置 Tailscale Serve，并弹出手机地址和五分钟有效的六位配对码。端口若已被其他服务使用，小鹿不会覆盖。只使用 Serve，不启用 Funnel，也不重置已有 Serve 配置。
3. 手机先确认 Tailscale 显示「已连接」，再输入弹窗中的配对码。个人构建版从被 Git 忽略的 `local.properties` 预设电脑 HTTPS 地址，正常配对只需填码；换电脑时才点「更换电脑」。重新配对会使旧手机失效；托盘「取消手机授权」可立即撤销当前手机。

若自行编译，可在 `android-app/local.properties` 中设置 `xiaolu.baseUrl=https://你的电脑名.你的tailnet.ts.net:8786`。此文件不会进入 Git；不设置时应用仍可通过「更换电脑」输入地址。手机上的 Tailscale 断开、登错 tailnet，或把共学日记排除在 Tailscale 分流之外，都可能让私有主机名无法解析。手机使用 5G 本身不是问题。

手机在前台时每 30 秒刷新，也可手动刷新。待办编辑要求最新版本，电脑上发生并发修改时会提示刷新，避免覆盖。配对令牌保存在手机应用私有存储和电脑 `%APPDATA%/xiaolu-desktop-pet/mobile-pairing-token`，绝不提交到代码仓库。仅使用 HTTPS；不建议把接口通过公网端口转发。

「去学习」使用配对地址的同一主机及 HTTPS 8776 端口，直接打开 YuReader 首页，对应 Tailscale Serve 的 `http://127.0.0.1:8775`，不启用公网 Funnel。「去编程」在系统浏览器打开 Antigravity 手机监控页，个人地址通过忽略的 `local.properties` 中 `xiaolu.programmingUrl` 设置，不写入公开源码。学科卡片只展示进度。YuReader 心跳新增设备类型及 `desktop_page` / `desktop_activity`，共享学习事实保持原口径，电脑行为只看桌面标签页。更新后需要重启 YuReader 后端并刷新旧网页才能使用新契约。

系统文件选择器仍可导入虚构 `sample-snapshot.json` 验证界面，但手动导入不会建立在线连接。之前 MVP 已由用户确认真机配对成功；本轮通过桌面接口测试、YuReader 隔离测试、APK 编译及 Android 静态检查，**新版布局与背词提交流程仍待真机验收**。
