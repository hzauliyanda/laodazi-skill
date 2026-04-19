---
name: laodazi-post-to-multi-platform
description: Post article to both Baijiahao (百家号) and WeChat Official Account (微信公众号). Baijiahao via browser, WeChat via API.
version: 2.0
---

# Multi-Platform Article Publisher

一键将 Markdown 文章同时发布到百度百家号和微信公众号，两个平台都会保存为草稿。

## 核心功能

- **百家号**：浏览器自动化发布（Chrome CDP）
- **微信公众号**：官方 API 创建草稿，无需浏览器
- **一次解析**：自动提取标题、摘要、封面图、正文和图片
- **智能图片处理**：自动下载远程图片并上传到各平台
- **顺序发布**：先发布百家号，再发布公众号

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

### 2. 登录百家号（首次使用）

首次运行时会自动打开浏览器，请先登录百家号：
- **百家号**: https://baijiahao.baidu.com/builder/rc/home

公众号无需浏览器，通过 API 直接发布。

### 3. 发布文章

```bash
# 保存为草稿到两个平台
/laodazi-post-to-multi-platform article.md

# 带封面图
/laodazi-post-to-multi-platform article.md --cover ./cover.png
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
| `--profile <path>` | 自定义 Chrome 配置目录（百家号） |
| `--cover <path>` | 封面图（公众号） |

## 工作流程

1. **解析 Markdown**：提取标题、摘要、封面图和正文图片
2. **发布到百家号**（浏览器自动化）：
   - 启动 Chrome，登录百家号
   - 输入文章标题、内容、上传图片
   - 保存为草稿
   - 关闭浏览器
3. **发布到公众号**（API）：
   - 调用 `wechat-draft-api.ts` 通过官方 API 创建草稿
   - 自动上传封面图和内联图片
   - 零浏览器依赖

## 配置环境变量

| 变量 | 说明 |
|------|------|
| `WECHAT_APPID` | 微信公众号 AppID（必填） |
| `WECHAT_APPSECRET` | 微信公众号 AppSecret（必填） |
| `MULTI_PLATFORM_CHROME_PATH` | Chrome 可执行文件路径（百家号） |
| `MULTI_PLATFORM_PROFILE_DIR` | 自定义 Chrome 配置文件目录 |

## 故障排查

### 百家号未登录

首次运行会打开浏览器，手动扫码登录即可，后续会保持登录状态。

### 公众号 API 错误

1. 检查 `WECHAT_APPID` 和 `WECHAT_APPSECRET` 是否正确
2. 检查公众号后台 > 设置与开发 > 基本配置 > IP白名单 是否已添加当前机器 IP
3. 标题不超过 64 个字符

### 图片上传失败

1. 检查图片格式是否支持（JPG、PNG、GIF、WebP）
2. 内联图片 < 2MB，封面图 < 10MB
