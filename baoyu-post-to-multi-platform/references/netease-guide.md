# 网易号 (Netease) Publishing Guide

## Overview

网易号 (Netease) is NetEase's content platform. This guide covers how to publish articles to Netease using the multi-platform publishing skill.

## Login

1. Visit http://mp.163.com
2. Click "登录" (Login) in the top right
3. Choose your login method:
   - NetEase account
   - Mobile phone
   - WeChat
   - QQ
4. Complete the login process

## First-Time Setup

Before using the skill for the first time:

1. Login to Netease in your regular browser
2. Navigate to http://mp.163.com/subscribe_v4/index.html#/home
3. Make sure you can access the content creation interface
4. Close the browser

The skill will use your saved login session.

## Publishing Process

The skill automates the following steps:

1. **Navigate to Creation Page**
   - Opens http://mp.163.com/subscribe_v4/index.html#/home
   - Clicks create article button OR navigates directly to article creation URL
   - Waits for editor to load

2. **Enter Title**
   - Finds the title input field
   - Types the article title

3. **Enter Content**
   - Clicks in the content editor
   - Pastes article content
   - Inserts images one by one

4. **Upload Cover Image** (if specified)
   - Finds the cover image upload area
   - Uploads the cover image

5. **Submit or Preview**
   - In preview mode: Stops here, leaving article as draft
   - In submit mode: Clicks publish button and confirms

## Known Issues & Workarounds

### Issue: SPA navigation issues

**Cause**: Netease uses hash-based routing in a Single Page Application.

**Workaround**:
- The skill tries multiple methods to navigate
- Direct URL navigation as fallback
- May need to wait longer for page transitions

### Issue: "Element not found" errors

**Cause**: Page still loading after navigation.

**Workaround**:
- The skill includes wait times for SPA transitions
- Retry logic is built in
- Check that you're using the correct URL

### Issue: Images not uploading

**Cause**: Image format or size restrictions.

**Workaround**:
- Use JPG or PNG format
- Keep images ≤ 2MB
- Try compressing large images

### Issue: Content editor not loading

**Cause**: SPA initialization delay.

**Workaround**:
- Wait longer for editor to initialize
- Refresh the page if needed
- Try manually creating an article first

## Platform-Specific Requirements

| Requirement | Value |
|-------------|-------|
| Title length | 5-30 characters recommended |
| Content length | 300+ characters recommended |
| Image formats | JPG, PNG |
| Image size | ≤ 2MB per image |
| Cover image | Recommended |

## Tips for Better Results

1. **Frontmatter**: Include `title`, `summary`, and `author` for better metadata
2. **Cover Image**: Use high-quality images for better engagement
3. **Categories**: Netease emphasizes proper categorization
4. **Originality**: Netease values original content

## Selector Reference

The skill uses the following CSS selectors (may need updates if page structure changes):

- **Create button**: `.create-article-btn, a[href*="article"]`
- **Title input**: `input[placeholder*="标题"], [class*="editor-title"] input`
- **Content editor**: `[contenteditable="true"], .editor-content`
- **Submit button**: `.submit-btn, .publish-btn`
- **Cover upload**: `.cover-upload, .upload-cover`

## URL Structure

Netease uses hash-based routing:

- **Home**: `http://mp.163.com/subscribe_v4/index.html#/home`
- **Create Article**: `http://mp.163.com/subscribe_v4/index.html#/article/create`
- **Article Management**: `http://mp.163.com/subscribe_v4/index.html#/article/list`

## Support

For issues specific to Netease:
1. Check the [troubleshooting guide](./troubleshooting.md)
2. Verify you can manually publish to Netease
3. Report the issue with details of the error
