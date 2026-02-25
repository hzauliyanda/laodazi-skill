# 百家号 (Baijiahao) Publishing Guide

## Overview

百家号 (Baijiahao) is Baidu's content platform. This guide covers how to publish articles to Baijiahao using the multi-platform publishing skill.

## Login

1. Visit https://baijiahao.baidu.com
2. Click "登录" (Login) in the top right
3. Choose your login method:
   - Mobile phone number
   - WeChat
   - QQ
   - Weibo
4. Complete the login process

## First-Time Setup

Before using the skill for the first time:

1. Login to Baijiahao in your regular browser
2. Navigate to https://baijiahao.baidu.com/builder/rc/home
3. Make sure you can access the content creation interface
4. Close the browser

The skill will use your saved login session.

## Publishing Process

The skill automates the following steps:

1. **Navigate to Creation Page**
   - Opens https://baijiahao.baidu.com/builder/rc/home
   - Clicks the create article button

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

### Issue: "Element not found" errors

**Cause**: Page structure may have changed or loading is slow.

**Workaround**:
- Check your internet connection
- Try running the skill again
- Make sure you're logged in

### Issue: Images not uploading

**Cause**: Image format or size not supported.

**Workaround**:
- Ensure images are JPG or PNG format
- Check that single images are ≤ 2MB
- Convert oversized images before publishing

### Issue: Login session expired

**Cause**: Login sessions expire after some time.

**Workaround**:
- Login again in your browser
- Re-run the skill

### Issue: Content not pasting correctly

**Cause**: Rich text formatting issues.

**Workaround**:
- The skill uses plain text mode for content
- Images are inserted separately via clipboard
- Make sure your clipboard isn't being used by another app

## Platform-Specific Requirements

| Requirement | Value |
|-------------|-------|
| Title length | 5-30 characters recommended |
| Content length | 500+ characters recommended |
| Image formats | JPG, PNG |
| Image size | ≤ 2MB per image |
| Cover image | Required for some article types |

## Tips for Better Results

1. **Frontmatter**: Always include `title` in frontmatter
2. **Cover Image**: Use a high-quality cover image for better visibility
3. **Summary**: Include a compelling summary to attract readers
4. **Tags**: Use relevant tags for better categorization

## Selector Reference

The skill uses the following CSS selectors (may need updates if page structure changes):

- **Title input**: `.editor-title, input[placeholder*="标题"]`
- **Content editor**: `.editor-content, [contenteditable="true"]`
- **Submit button**: `.submit-btn, .publish-btn`
- **Cover upload**: `.cover-upload-btn, .upload-cover`

## Support

For issues specific to Baijiahao:
1. Check the [troubleshooting guide](./troubleshooting.md)
2. Verify you can manually publish to Baijiahao
3. Report the issue with details of the error
