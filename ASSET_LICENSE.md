# 开放素材授权说明

共学日记现在是一个完整开放的项目。除下方单独列出的第三方内容外，仓库中的原创内容统一采用根目录的 [MIT License](LICENSE)。

## MIT 授权范围

授权范围包括但不限于：

- 程序源代码、测试、构建脚本和项目配置；
- `assets/xiaolu/` 中的角色图像、动画图集和角色配置；
- `assets/icons/` 与 `assets/bookmarks/` 中的图标和书签；
- `assets/voice/` 中随应用提供的离线语音片段；
- `docs/`、README 和说明书中的原创文字、排版与展示素材。

任何人都可以在遵守 MIT License 的前提下使用、复制、修改、合并、发布、分发、再授权或销售这些内容，包括替换角色、改写功能以及制作自己的桌面搭子。分发时请保留版权声明和 MIT License。

## 第三方内容

第三方字体、依赖和参考项目继续遵循各自的许可证，不因本说明而改变。相关声明和随附许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 与 `assets/fonts/licenses/`。

## 不随仓库公开的个人数据

开放项目不等于公开使用者的数据。以下内容不属于仓库，也不应提交：

- `%APPDATA%\xiaolu-desktop-pet\xiaolu-study-state.json` 中的日记、任务、打卡和位置记录；
- 本地数据库、日志、备份、环境变量和密钥；
- 制作素材时使用的原始肖像、源录音和未公开的中间文件。

项目的 `.gitignore` 已为这些常见内容设置排除规则。Fork 或二次开发时，也请在提交前检查自己的本地数据。

---

# Open Asset License Notice

XiaoLu Study Journal is now an openly licensed project. Except for separately
identified third-party materials, all original content in this repository is
licensed under the root [MIT License](LICENSE).

This includes the source code, tests, build scripts, character artwork,
spritesheets, icons, bookmarks, bundled offline voice clips, documentation,
and original presentation assets. You may use, copy, modify, merge, publish,
distribute, sublicense, and/or sell them under the terms of the MIT License.
The copyright notice and MIT License must be preserved with distributed copies.

Third-party fonts, dependencies, and referenced projects remain under their
respective licenses. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and
the notices under `assets/fonts/licenses/`.

Personal runtime data is intentionally excluded from the repository. Study
journals, tasks, check-ins, local databases, logs, backups, secrets, original
portraits, source recordings, and private working files must not be committed.
