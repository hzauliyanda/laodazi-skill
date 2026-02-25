# Troubleshooting Guide

This guide covers common issues and their solutions when using the multi-platform publishing skill.

## Browser & Chrome Issues

### Chrome not found

**Error**: `Chrome not found. Set MULTI_PLATFORM_BROWSER_CHROME_PATH env var.`

**Solutions**:
1. Install Google Chrome if not already installed
2. Set the environment variable:
   ```bash
   export MULTI_PLATFORM_BROWSER_CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"  # macOS
   export MULTI_PLATFORM_BROWSER_CHROME_PATH="/usr/bin/google-chrome"  # Linux
   set MULTI_PLATFORM_BROWSER_CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"  # Windows
   ```

### Chrome won't launch

**Possible causes**:
- Chrome is already running with the same profile
- Profile directory is locked
- Insufficient permissions

**Solutions**:
1. Close all Chrome windows
2. Check for Chrome processes in Task Manager / Activity Monitor
3. Use a custom profile directory with `--profile` option
4. On macOS, make sure Chrome has necessary permissions

### Page not loading

**Error**: `Page not found: <url>`

**Solutions**:
1. Check your internet connection
2. Verify the platform URL is correct
3. Try accessing the URL manually in a browser first
4. Platform may be down or blocking automated access

## Login Issues

### "Not logged in" error

**Error**: `Not logged in. Please login to <platform> first.`

**Solutions**:
1. Open a regular browser window
2. Login to the platform manually
3. Navigate to the main content creation page
4. Close the browser
5. Run the skill again

**Why this happens**:
- The skill uses Chrome's user profile to preserve login sessions
- First time setup requires manual login
- Sessions expire after some time

### Login session expired

**Symptoms**:
- Skill redirects to login page
- "Element not found" errors on login page elements

**Solutions**:
1. Login manually again in your browser
2. Consider using "remember me" option when logging in
3. Some platforms may require periodic re-login

## Content Issues

### Title too long/short

**Symptoms**:
- Platform rejects the article
- Error message about title length

**Solutions**:
1. Edit the frontmatter `title` field
2. Recommended length: 5-30 characters
3. Some platforms may have specific requirements

### Content not pasting correctly

**Symptoms**:
- Content appears blank
- Formatting is lost
- Images missing

**Solutions**:
1. Check that content is at least 300 characters for most platforms
2. Images are inserted separately - this is normal
3. Plain text mode is used for compatibility
4. Make sure clipboard isn't being used by another application

### Images not uploading

**Symptoms**:
- Images don't appear in article
- "Insert failed" messages

**Solutions**:
1. Check image format: JPG, PNG, GIF, WebP supported
2. Check image size: usually ≤ 2MB per image
3. Verify image files exist and are not corrupted
4. Try manually uploading an image to the platform first

#### Image format conversion

If you have unsupported formats:

```bash
# Using ImageMagick
convert image.webp image.jpg

# Using ffmpeg
ffmpeg -i image.webp image.jpg

# Using sips (macOS)
sips -s format jpeg input.webp --out output.jpg
```

## Platform-Specific Issues

### Baijiahao (百家号)

**Issue**: Elements not found after page load
- **Cause**: Page structure change or slow loading
- **Solution**: Wait longer, check internet connection

**Issue**: Cover image not uploading
- **Cause**: Wrong format or size
- **Solution**: Use JPG, ≤ 2MB, recommended 16:9 aspect ratio

### Toutiao (头条号)

**Issue**: Very slow page loading
- **Cause**: Complex editor initialization
- **Solution**: Be patient, skill waits up to 20 seconds

**Issue**: Account verification required
- **Cause**: New account or suspicious activity
- **Solution**: Complete verification in browser first

### Netease (网易号)

**Issue**: Navigation not working
- **Cause**: SPA hash routing issues
- **Solution**: Skill uses direct URL navigation as fallback

**Issue**: Editor not loading
- **Cause**: SPA initialization delay
- **Solution**: Wait longer, try refreshing manually first

## Clipboard Issues

### Clipboard operations failing

**Symptoms**:
- "Clipboard tool not found" error
- Content/images not being pasted

**Solutions**:

**macOS**:
- Swift should be available by default
- Grant Terminal/iTerm accessibility permissions if needed

**Linux**:
- Install clipboard tools:
  ```bash
  sudo apt install wl-clipboard  # Wayland
  sudo apt install xclip  # X11
  ```

**Windows**:
- PowerShell should be available by default
- Make sure no security software is blocking

### Another app using clipboard

**Symptoms**:
- Inconsistent pasting behavior
- Wrong content being pasted

**Solutions**:
1. Close clipboard managers
2. Pause sync services that use clipboard
3. Don't use clipboard during publishing

## Network Issues

### Slow or unstable connection

**Symptoms**:
- Pages load slowly
- Images fail to download
- Timeouts

**Solutions**:
1. Check internet connection
2. Try again during off-peak hours
3. Use wired connection if possible
4. Check firewall settings

### Platform blocking automated access

**Symptoms**:
- CAPTCHA challenges
- Access denied messages
- Account warnings

**Solutions**:
1. The skill uses real Chrome to minimize detection
2. If flagged, login manually and solve CAPTCHA
3. Wait some time before trying again
4. Consider using the platform's official API if available

## Debugging

### Enable verbose logging

The skill outputs progress messages. Common patterns:

```
[platform] Message          # Platform-specific message
[cdp] Message               # Chrome DevTools message
[markdown-parser] Message   # Parser message
```

### Check Chrome DevTools Protocol

If browser automation is failing:

1. The skill launches Chrome with remote debugging
2. Check console output for CDP errors
3. Verify WebSocket connection is established

### Manual testing

Before using the skill, verify:

1. Can you login to the platform?
2. Can you create an article manually?
3. Can you upload images manually?
4. Are all images in correct format?

## Getting Help

If issues persist:

1. Check platform-specific guides:
   - [Baijiahao Guide](./baijiahao-guide.md)
   - [Toutiao Guide](./toutiao-guide.md)
   - [Netease Guide](./netease-guide.md)

2. Gather information:
   - Exact error message
   - Platform being targeted
   - Steps you took
   - Your environment (OS, Chrome version)

3. Report the issue with details
