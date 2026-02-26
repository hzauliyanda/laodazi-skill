---
name: laodazi-post-to-multi-platform
description: Post article to both Baijiahao (百家号) and WeChat Official Account (微信公众号) in one browser session. Saves as draft on both platforms.
---

# Multi-Platform Article Publisher

一键将 Markdown 文章同时发布到百度百家号和微信公众号，两个平台都会保存为草稿。

## 核心功能

- 📝 **一次解析**：自动提取标题、摘要、封面图、正文和图片
- 🔄 **同一浏览器**：在同一个浏览器会话中完成两个平台的发布
- 📋 **自动保存草稿**：百家号和公众号都会保存为草稿，可随时编辑
- 🖼️ **智能图片处理**：自动下载远程图片并上传到各平台
- 🚀 **顺序发布**：先发布百家号，再发布公众号

## 快速开始

### 1. 准备文章

创建 Markdown 文件（可选 frontmatter）：

```markdown
---
title: 赵匡胤究竟是怎样一个人？
cover_image: /path/to/cover.jpg
tags: 历史,人物传记
author: 老达子
summary: 揭秘历史上真实的赵匡胤
---

# 前言
很多人提起大宋开国皇帝赵匡胤...

![图片描述](./image1.png)

更多内容...
```

### 2. 登录平台（首次使用）

首次运行时会自动打开浏览器，请先登录：
- **百家号**: https://baijiahao.baidu.com/builder/rc/home
- **公众号**: https://mp.weixin.qq.com/

登录信息会自动保存，后续无需重复登录。

### 3. 发布文章

```bash
# 保存为草稿到两个平台
/laodazi-post-to-multi-platform article.md

# 直接发布
/laodazi-post-to-multi-platform article.md --submit
```

## Frontmatter 格式

| 字段 | 必填 | 说明 |
|------|------|------|
| `title` | 否* | 文章标题（默认使用第一个 H1 或文件名） |
| `cover_image` | 否 | 封面图路径（本地或远程 URL） |
| `tags` | 否 | 逗号分隔的标签 |
| `author` | 否 | 作者名称 |
| `summary` | 否 | 文章摘要/描述 |

*建议在 frontmatter 中提供标题，确保跨平台一致性

## 命令选项

| 选项 | 说明 |
|------|------|
| `--submit` | 直接发布（默认：保存草稿） |
| `--profile <path>` | 自定义 Chrome 配置目录 |
| `--wechat-theme <name>` | 公众号主题 (default, grace, simple) |

## 工作流程

1. **解析 Markdown**：提取标题、摘要、封面图和正文图片
2. **启动浏览器**：使用 Chrome 并保存登录状态
3. **发布到百家号**：
   - 输入文章标题
   - 插入文章内容
   - 上传图片
   - 保存为草稿
4. **发布到公众号**：
   - 转换文章为微信格式
   - 输入标题、作者、摘要
   - 插入文章内容和图片
   - 保存为草稿
5. **清理浏览器**：关闭浏览器，保存登录状态

## 平台限制

### 百家号

- **登录地址**: https://baijiahao.baidu.com/builder/rc/home
- **图片限制**: JPG/PNG，单张图片 ≤ 2MB

### 微信公众号

- **登录地址**: https://mp.weixin.qq.com/
- **标题限制**: 最多 64 个字符
- **主题**: default, grace, simple

## 故障排查

### "未登录" 错误

确保您已在浏览器中登录相应平台。此工具使用 Chrome 的用户数据目录来保留登录会话。

### 图片上传失败

1. 检查图片格式是否支持（JPG、PNG、GIF、WebP）
2. 确保图片文件未损坏
3. 检查图片大小是否超过限制

### 浏览器未找到

设置环境变量：
```bash
export MULTI_PLATFORM_CHROME_PATH="/path/to/chrome"
```

## 配置环境变量

| 变量 | 说明 |
|------|------|
| `MULTI_PLATFORM_CHROME_PATH` | Chrome 可执行文件路径 |
| `MULTI_PLATFORM_PROFILE_DIR` | 自定义配置文件目录 |
