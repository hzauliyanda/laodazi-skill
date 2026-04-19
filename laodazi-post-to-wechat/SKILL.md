---
name: laodazi-post-to-wechat
description: Post content to WeChat Official Account (微信公众号) via the official API. No browser needed.
version: 2.0
---

# Post to WeChat Official Account (微信公众号)

通过微信公众号官方 API 将 Markdown 文件保存为草稿，无需浏览器。

## Script Directory

**Important**: All scripts are located in the `scripts/` subdirectory of this skill.

**Agent Execution Instructions**:
1. Determine this SKILL.md file's directory path as `SKILL_DIR`
2. Script path = `${SKILL_DIR}/scripts/<script-name>.ts`
3. Replace all `${SKILL_DIR}` in this document with the actual path

## Prerequisites

1. **AppID and AppSecret**: 公众号后台 > 设置与开发 > 基本配置
2. **IP 白名单**: 公众号后台 > 设置与开发 > 基本配置 > IP白名单（必须添加当前机器 IP）
3. **curl**: 系统自带
4. **bun**: 已安装（`/Users/liyanda/.bun/bin/bun`）

## Setup

```bash
export WECHAT_APPID="wx77655a5f2081bcbd"
export WECHAT_APPSECRET="d04360a397fbde856a80eecf05e482a6"
```

## Usage

```bash
# 基本用法 — 自动提取标题、作者、摘要
bun ${SKILL_DIR}/scripts/wechat-draft-api.ts --markdown article.md

# 带封面图
bun ${SKILL_DIR}/scripts/wechat-draft-api.ts --markdown article.md --cover ./cover.png

# 完整参数
bun ${SKILL_DIR}/scripts/wechat-draft-api.ts \
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
- 多图片文章需要较长超时（建议 120s+）
