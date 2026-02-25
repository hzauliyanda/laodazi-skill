# Multi-Platform Article Publishing

Automatically publish articles from a single Markdown file to multiple Chinese content platforms.

## Supported Platforms

| Platform | Status | Notes |
|----------|--------|-------|
| **百家号 (Baijiahao)** | ✅ Supported | Baidu's content platform |
| **头条号 (Toutiao)** | ✅ Supported | ByteDance's content platform |
| **网易号 (Netease)** | ✅ Supported | NetEase's content platform |

> **Note:** 小红书 (Xiaohongshu) is not currently supported.

## Quick Start

### 1. Prepare Your Markdown File

Create a Markdown file with frontmatter:

```markdown
---
title: Your Article Title
cover_image: /path/to/cover-image.jpg
tags: AI,技术,教程
author: Your Name
summary: A brief summary of your article
---

# Article Content

Your article content here...

![Image description](./image1.png)

More content...
```

### 2. Login to Platforms (First Time Only)

Before publishing, you need to login to each platform:

1. Open Chrome (or your browser)
2. Visit each platform and login:
   - 百家号: https://baijiahao.baidu.com
   - 头条号: https://mp.toutiao.com
   - 网易号: http://mp.163.com

The skill will use your browser's saved login session.

### 3. Publish

```bash
# Preview mode (create as draft) - all platforms
npx -y bun ${SKILL_DIR}/scripts/publishers/publish-all.ts article.md

# Submit for publication - all platforms
npx -y bun ${SKILL_DIR}/scripts/publishers/publish-all.ts article.md --submit

# Publish to specific platforms only
npx -y bun ${SKILL_DIR}/scripts/publishers/publish-all.ts article.md --platforms baijiahao,toutiao --submit
```

## Single Platform Publishing

```bash
# Baijiahao
npx -y bun ${SKILL_DIR}/scripts/publishers/publish-baijiahao.ts article.md --submit

# Toutiao
npx -y bun ${SKILL_DIR}/scripts/publishers/publish-toutiao.ts article.md --submit

# Netease
npx -y bun ${SKILL_DIR}/scripts/publishers/publish-netease.ts article.md --submit
```

## Frontmatter Format

| Field | Required | Description |
|-------|----------|-------------|
| `title` | No* | Article title (defaults to first H1 or filename) |
| `cover_image` | No | Path to cover image (local or remote URL) |
| `tags` | No | Comma-separated tags |
| `author` | No | Author name |
| `summary` | No | Article summary/description |

*While `title` is not strictly required, it's highly recommended to provide it in frontmatter for consistency across platforms.

## Options

| Option | Description |
|--------|-------------|
| `--submit` | Submit for publication (default: preview/draft mode) |
| `--platforms <list>` | Comma-separated platform list (for publish-all) |
| `--profile <path>` | Custom Chrome profile directory |

## How It Works

1. **Markdown Parsing**: Extracts title, summary, cover image, and content images
2. **Browser Automation**: Launches Chrome with saved login session
3. **Content Insertion**:
   - Types article title
   - Inserts article content
   - Uploads images via clipboard
4. **Submission**: Either creates draft or submits for publication

## Platform-Specific Notes

### 百家号 (Baijiahao)

- **Login**: https://baijiahao.baidu.com/builder/rc/home
- **Image limits**: JPG/PNG, single image ≤ 2MB
- **Cover image**: Supported via dedicated upload area

### 头条号 (Toutiao)

- **Login**: https://mp.toutiao.com/profile_v4/index
- **Image limits**: JPG/PNG, recommended 16:9 aspect ratio
- **Note**: Page may take longer to load

### 网易号 (Netease)

- **Login**: http://mp.163.com/subscribe_v4/index.html#/home
- **Image limits**: JPG/PNG, single image ≤ 2MB
- **Note**: Uses hash-based routing

## Troubleshooting

### "Not logged in" Error

Make sure you've logged into the platform in a regular browser session first. The skill uses Chrome's user data directory to preserve login sessions.

### Images Not Uploading

1. Check that images are in supported formats (JPG, PNG, GIF, WebP)
2. Ensure image files are not corrupted
3. Check platform-specific image size limits

### Browser Not Found

Set the `MULTI_PLATFORM_BROWSER_CHROME_PATH` environment variable to your Chrome executable path.

### Clipboard Issues

The skill uses system clipboard for image uploading. Make sure:
- No other applications are interfering with clipboard
- You have granted necessary permissions

## Image Handling

- **Local images**: Resolved relative to Markdown file location
- **Remote images**: Automatically downloaded to temp directory
- **Image placeholders**: Images are inserted via clipboard during publishing

## Configuration

You can set the following environment variables:

| Variable | Description |
|----------|-------------|
| `MULTI_PLATFORM_BROWSER_CHROME_PATH` | Path to Chrome executable |
| `MULTI_PLATFORM_PROFILE_DIR` | Custom profile directory |

## Error Handling

- Single platform failure doesn't stop other platforms (when using publish-all)
- Detailed error messages for debugging
- Retry mechanism for transient failures
