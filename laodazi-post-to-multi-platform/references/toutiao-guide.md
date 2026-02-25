# 头条号 (Toutiao) Publishing Guide

## Overview

头条号 (Toutiao) is ByteDance's content platform. This guide covers how to publish articles to Toutiao using the multi-platform publishing skill.

## Login

1. Visit https://mp.toutiao.com
2. Click "登录" (Login) in the top right
3. Choose your login method:
   - Mobile phone number
   - WeChat
   - QQ
4. Complete the login and verification process

## First-Time Setup

Before using the skill for the first time:

1. Login to Toutiao in your regular browser
2. Navigate to https://mp.toutiao.com/profile_v4/index
3. Complete any required verification steps
4. Make sure you can access the content creation interface
5. Close the browser

The skill will use your saved login session.

## Publishing Process

The skill automates the following steps:

1. **Navigate to Creation Page**
   - Opens https://mp.toutiao.com/profile_v4/index
   - Clicks the write/create article button
   - Waits for editor to load (can take 5-10 seconds)

2. **Enter Title**
   - Finds the title input field
   - Types the article title

3. **Enter Content**
   - Clicks in the content editor (Quill-based editor)
   - Pastes article content
   - Inserts images one by one

4. **Upload Cover Image** (if specified)
   - Finds the cover image upload area
   - Uploads the cover image

5. **Submit or Preview**
   - In preview mode: Stops here, leaving article as draft
   - In submit mode: Clicks publish button and confirms

## Known Issues & Workarounds

### Issue: Page loading slowly

**Cause**: Toutiao's editor is complex and takes time to initialize.

**Workaround**:
- The skill includes longer wait times for Toutiao
- Be patient during the initial page load
- Ensure good internet connection

### Issue: "Element not found" errors

**Cause**: Selector mismatch or page still loading.

**Workaround**:
- The skill uses retry logic
- If persistent, check if page structure changed
- Try manually accessing the create article page first

### Issue: Images not uploading

**Cause**: Image format or aspect ratio issues.

**Workaround**:
- Use JPG or PNG format
- Recommended aspect ratio: 16:9
- File size should be reasonable

### Issue: Content pasting issues

**Cause**: Quill editor formatting conflicts.

**Workaround**:
- The skill pastes as plain text
- Images are inserted separately
- Make sure cursor is in the right place

### Issue: Account verification required

**Cause**: New account or suspicious activity.

**Workaround**:
- Complete any verification in browser first
- May need phone verification
- Contact Toutiao support if persistent

## Platform-Specific Requirements

| Requirement | Value |
|-------------|-------|
| Title length | 5-30 characters recommended |
| Content length | 300+ characters recommended |
| Image formats | JPG, PNG |
| Image aspect ratio | 16:9 recommended |
| Cover image | Highly recommended |

## Tips for Better Results

1. **Frontmatter**: Always include `title` and `summary`
2. **Cover Image**: Critical for Toutiao - use 16:9 ratio
3. **Content Quality**: Toutiao's algorithm favors engaging content
4. **Timing**: Publish during peak hours for better visibility

## Selector Reference

The skill uses the following CSS selectors (may need updates if page structure changes):

- **Write button**: `.write-button, [class*="publish"]`
- **Title input**: `input[placeholder*="标题"], input[placeholder*="请输入标题"]`
- **Content editor**: `[contenteditable="true"], .ql-editor`
- **Submit button**: `.submit-btn, .publish-btn, button[class*="submit"]`
- **Cover upload**: `.cover-upload-btn, input[type="file"][accept*="image"]`

## Support

For issues specific to Toutiao:
1. Check the [troubleshooting guide](./troubleshooting.md)
2. Verify you can manually publish to Toutiao
3. Report the issue with details of the error
