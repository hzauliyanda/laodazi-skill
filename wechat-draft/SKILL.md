---
name: wechat-draft
description: Save markdown files as drafts to WeChat Official Account (微信公众号草稿箱) via the official API. No browser needed.
version: 1.1
---

# WeChat Draft (微信公众号草稿箱)

通过微信公众号官方 API 将 Markdown 文件保存为草稿，无需浏览器自动化。

## Script Directory

**Important**: All scripts are located in the `scripts/` subdirectory of this skill.

**Agent Execution Instructions**:
1. Determine this SKILL.md file's directory path as `SKILL_DIR`
2. Script path = `${SKILL_DIR}/scripts/<script-name>`
3. Replace all `${SKILL_DIR}` in this document with the actual path

## Prerequisites

1. **AppID and AppSecret**: 公众号后台 > 设置与开发 > 基本配置
2. **IP 白名单**: 公众号后台 > 设置与开发 > 基本配置 > IP白名单（必须添加当前机器出口 IP）
3. **Python3 stdlib**：Python版脚本已用 urllib 替代所有 curl 调用（包括 multipart 上传），无需额外安装
   - 查出口 IP 的替代命令：`python3 -c "import urllib.request; print(urllib.request.urlopen('https://ifconfig.me',timeout=10).read().decode().strip())"`

## Setup

环境变量配置（在 `/opt/data/.env` 中添加）：
```
WECHAT_APPID="wx你的AppID"
WECHAT_APPSECRET="你的AppSecret"
```

## Usage

两个版本功能完全一致，选择一个即可：

```bash
# Python3 版（推荐，NAS/容器/任意环境通用）
python3 ${SKILL_DIR}/scripts/wechat-draft-api.py --markdown article.md

# Bun 版（需安装 bun）
bun ${SKILL_DIR}/scripts/wechat-draft-api.ts --markdown article.md

# 带封面图
python3 ${SKILL_DIR}/scripts/wechat-draft-api.py --markdown article.md --cover ./cover.png

# 完整参数
python3 ${SKILL_DIR}/scripts/wechat-draft-api.py \
  --markdown article.md \
  --title "自定义标题" \
  --author "作者名" \
  --digest "文章摘要" \
  --cover ./cover.png
```

### All options

| Option | Description | Default |
|--------|-------------|---------|
| `--markdown <path>` | Markdown 文件路径 (必填) | - |
| `--title <text>` | 覆盖标题 | 从 MD 提取 |
| `--author <text>` | 作者 | 从 frontmatter 提取 |
| `--digest <text>` | 摘要 | 自动提取正文 |
| `--cover <path>` | 封面图 | 自动生成渐变色占位图 |
| `--appid <id>` | AppID | env WECHAT_APPID |
| `--secret <key>` | AppSecret | env WECHAT_APPSECRET |

## Markdown Frontmatter

```markdown
---
title: 文章标题
author: 作者名
summary: 文章摘要
---

# 正文内容（也可以自动从第一个 H1 提取标题）
```

## How It Works

1. Parse Markdown → 提取标题、作者、摘要，图片替换为占位符
2. Get access_token → AppID/AppSecret 认证（缓存 2 小时在 `~/.local/share/wechat-draft-token.json`）
3. Upload cover image → `material/add_material` 永久素材接口 → 获取 `thumb_media_id`
4. Upload inline images → `media/uploadimg` 图文内图片接口 → 获取 mmbiz URL
5. Replace placeholders → 用 mmbiz URL 替换占位符
6. Create draft → `draft/add` 接口创建草稿

## Notes

- 封面图未指定且文中无图片时，自动生成 900x500 渐变色占位图
- 文内图片（`![alt](path)`）自动上传，支持本地路径和远程 URL
- 外部图片 URL 会自动下载后重新上传到微信
- 内联图片 < 2MB，封面图 < 10MB
- 微信只允许 `mp.weixin.qq.com` 域名链接可点击，其他链接显示为纯文本
- IP 白名单变更后需重新设置（IP 可能会变）
- Python版已改为纯 stdlib 实现（urllib），不依赖 curl（容器内无curl且apt-get超时）
- **调用前需加载 .env**：`source ${SKILL_DIR}/.env && python3 ${SKILL_DIR}/scripts/wechat-draft-api.py ...`
- Bun/TS版仍依赖 curl，容器内不可用，**优先用 Python 版**
- 容器出口IP：116.148.73.245（已在微信白名单中）
- 文件上传用 `_build_multipart` 手工构建 multipart/form-data（微信API对内置HTTP multipart返回412的问题通过boundary设置解决）
- 容器出口IP：116.148.73.245（需加入公众号白名单）
- `material/add_material` 永久素材接口必须带 `description={"title":"cover"}` form field，否则 412
- 多图片文章需要较长超时（建议 120s+），4 张图就曾超过 60s
- 封面占位图用 Python stdlib 生成（struct+zlib），无需外部依赖
- 样式：标题橘色(#FF6B35)、段落 section 标签 + margin-bottom:16px + line-height:2
- ⚠️ **必须保留原文 HTML 样式标签**：发布时直接使用原始 .md 文件，禁止预处理去除 `<font>`、`<span>` 等 HTML 标签。脚本会原样保留这些标签（LRN-20260428-001）
- 🖼️ **图片下载优化（2026-05-06）**：容器内无 curl，改用 Python urllib 下载图片；GitHub raw URL 自动走镜像代理重试（ghfast.top → ghproxy.com → gh-proxy.com）；下载失败时生成灰色占位图保证文章正常发布，并在日志中列出失败 URL 供手动排查
