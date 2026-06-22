---
name: laodazi-article-video
description: 将历史文章 MD 文件转换为带配音的 ~2 分钟 MP4 视频（水墨古风 + edge-tts 中文配音）
---

# 文章转视频

将老达子的历史文章（MD 文件，2000-3000+ 字）自动转换为 ~2 分钟横版视频（1920x1080）。固定水墨古风视觉风格，edge-tts `zh-CN-YunjianNeural` 中文男声配音，HyperFrames 渲染。

## 使用方法

```
/laodazi-article-video <文章路径.md>
```

输出：`hyperframes-videos/<标题>/output/<标题>.mp4`

## 视频标准

| 项目   | 规格                                  |
|--------|---------------------------------------|
| 时长   | ~2 分钟（120-150s）                   |
| 分辨率 | 1920x1080 横屏                        |
| 配音   | edge-tts `zh-CN-YunjianNeural`        |
| 风格   | 水墨古风（固定复用 design.md）        |
| 文案   | ~500 字精简口播稿                     |

## 执行步骤

按以下 7 步顺序执行，不可跳步。

### 步骤 1：精简文案

1. 读取文章 MD 文件
2. 提取核心论点、关键人物、转折事件
3. 精简为 ~500 字口播稿，按场景分段（8-12 段）
4. 口播稿要求：
   - 开头 50-80 字制造悬念（数字冲击、反直觉提问、场景切入）
   - 正文层层递进，短句为主，多用设问句
   - 结尾 50-70 字总结升华
   - 口语化，避免书面语
   - 敏感词替换（杀了→除掉，灭亡→覆灭 等）
5. 保存为 `<子目录>/audio/script.txt`，每段一行，**空行分隔场景**（场景划分以空行为准）

### 步骤 2：创建子目录

```
cd /Users/liyanda/Documents/project_code/hyperframes-videos
mkdir -p <标题>/audio <标题>/output
```

- 从文章标题提取简短英文目录名（如"桑弘羊三问"→ `sanghongyang`）
- 目录已存在则提示用户确认是否覆盖
- 将 `design.md` 复制到子目录（或 index.html 中直接内联颜色变量）

### 步骤 3：分场景生成配音（关键步骤）

**必须先生成配音再写 HTML**，这样场景切换时间才能跟配音实际时长同步。

#### 3a. 拆分文案为单场景文件

```bash
cd /Users/liyanda/Documents/project_code/hyperframes-videos/<子目录>/audio

python3 -c "
with open('script.txt','r') as f: text = f.read()
scenes = [s.strip() for s in text.split('\n\n') if s.strip()]
for i, s in enumerate(scenes, 1):
    with open(f'scene-{i}.txt','w') as f: f.write(s)
    print(f'scene-{i}.txt: {len(s)} chars')
"
```

#### 3b. 逐场景生成 MP3

```bash
source ../../.venv/bin/activate
for i in $(seq 1 N); do
  edge-tts --voice zh-CN-YunjianNeural --file scene-$i.txt --write-media scene-$i.mp3
done
```

#### 3c. 测量每段时长

```bash
for i in $(seq 1 N); do
  dur=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 scene-$i.mp3)
  echo "scene-$i: ${dur}s"
done
```

#### 3d. 计算累积时间

用 Python 计算每个场景的起始时间：

```python
# 示例：用 3c 测得的时长
durations = [16.5, 18.9, 15.6, ...]  # 填入实际值
cumulative = 0
for i, d in enumerate(durations, 1):
    print(f"Scene {i}: starts at {cumulative:.1f}s, duration {d:.1f}s")
    cumulative += d
total = sum(durations)
print(f"Total: {total:.1f}s")
```

**记录下每个场景的起始时间，步骤 4 写 HTML 时直接用这些值。**

#### 3e. 拼接完整配音

```bash
python3 -c "
files = [f'file scene-{i}.mp3' for i in range(1, N+1)]
with open('concat-list.txt','w') as f:
    f.write('\n'.join(files) + '\n')
"
ffmpeg -y -f concat -safe 0 -i concat-list.txt -c copy narration-full.mp3
```

验证：`ffprobe -v quiet -show_entries format=duration -of csv=p=0 narration-full.mp3`

### 步骤 4：生成 index.html（用配音实际时长）

生成 HyperFrames 主 composition 文件。严格遵循以下规则：

#### HTML 结构

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>标题</title>
<style>/* 所有样式 */</style>
</head>
<body>
<div data-composition-id="main" data-width="1920" data-height="1080" data-start="0" data-duration="DURATION">
  <!-- 场景 1 ~ N -->
</div>
<script src="../node_modules/gsap/dist/gsap.min.js"></script>
<script>/* GSAP timeline */</script>
</body>
</html>
```

**关键属性：**
- `data-composition-id="main"`
- `data-width="1920"` `data-height="1080"`
- `data-duration` 设为步骤 3d 算出的总时长（所有场景配音时长之和）
- GSAP 引用路径：`../node_modules/gsap/dist/gsap.min.js`（子目录引用上级 node_modules）

#### 颜色变量（固定水墨古风）

```css
:root {
  --bg: #0a0a0a;
  --fg: #e8e0d0;
  --accent: #C1121F;
  --gold: #8B7355;
  --muted: #5a5549;
  --glow: #1a1510;
}
```

禁止使用这些颜色以外的值。禁止用 `#fff`、`#000`、纯白纯黑。

#### 字体

- 标题：`font-family: "Noto Serif SC", serif`，700，56-96px
- 正文：`font-family: "Noto Sans SC", sans-serif`，350 或 400，28-34px
- 标签/装饰：`"Noto Sans SC"`，400，18-24px
- 无需 `@font-face` 或 `@import`，HyperFrames 编译器自动嵌入

#### 场景模板

**开场场景（必须）：**
- 墨晕背景（radial-gradient，gold/accent 色调，低透明度）
- Ghost text 水印（1 个汉字，600px，5% 透明度）
- 中央大字引文或标题
- 出处/副标题
- 装饰线

**正文场景（8-10 个）：**
- 墨晕背景
- Ghost text 水印（与场景相关的 1-2 个字）
- 角落装饰（top-left + bottom-right L 形线条，gold 色，0.5 透明度）
- 印章标记（2px solid accent 边框方形，rotate(-3deg)）
- 大字小标题（Noto Serif SC，56-72px）
- 正文段落（Noto Sans SC，30px，line-height 1.8）
- 可选元素：引用框、数字强调、对比块、要点列表

**结尾场景（必须）：**
- "老达子说"标签
- 总结文字
- 关键句用 accent 色强调
- 淡出遮罩（fade-overlay，position absolute，8s 渐变到 bg 色）

#### 每场景必须有的元素

1. 墨晕背景（`.bg-glow`）
2. Ghost text 水印（`.ghost-text`）
3. 至少 1 个装饰元素（装饰线、印章、角落装饰，三选一）

#### CSS 组件（从现有模板复制）

以下 CSS 类已验证可用，直接复用：

```css
/* 场景容器 */
.scene { position: absolute; top: 0; left: 0; width: 1920px; height: 1080px; overflow: hidden; }
.scene-content { width: 100%; height: 100%; padding: 60px 120px; display: flex; flex-direction: column; gap: 28px; box-sizing: border-box; position: relative; z-index: 2; }

/* Ghost text */
.ghost-text { position: absolute; font-family: "Noto Serif SC", serif; font-size: 600px; font-weight: 700; color: var(--fg); opacity: 0.05; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 0; pointer-events: none; white-space: nowrap; user-select: none; }

/* 墨晕背景 */
.bg-glow { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 0; pointer-events: none; }

/* 印章 */
.seal-stamp { display: inline-flex; align-items: center; justify-content: center; border: 2px solid var(--accent); padding: 12px 20px; font-family: "Noto Serif SC", serif; font-size: 24px; font-weight: 700; color: var(--accent); transform: rotate(-3deg); align-self: flex-start; letter-spacing: 4px; }

/* 装饰线 */
.deco-line { width: 100%; height: 1px; background: var(--gold); opacity: 0.6; }

/* 引用框 */
.quote-box { border-left: 3px solid var(--accent); padding: 24px 32px; font-family: "Noto Serif SC", serif; font-size: 28px; font-style: italic; color: var(--fg); line-height: 1.8; background: rgba(10,10,10,0.4); }

/* 角落装饰 */
.corner-deco { position: absolute; z-index: 1; pointer-events: none; }
.corner-deco.top-left { top: 60px; left: 60px; width: 60px; height: 60px; border-top: 1px solid var(--gold); border-left: 1px solid var(--gold); opacity: 0.5; }
.corner-deco.bottom-right { bottom: 60px; right: 60px; width: 60px; height: 60px; border-bottom: 1px solid var(--gold); border-right: 1px solid var(--gold); opacity: 0.5; }

/* 大数字 */
.big-number { font-family: "Noto Serif SC", serif; font-weight: 700; color: var(--accent); line-height: 1.1; }

/* 关键句 */
.key-sentence { font-size: 34px; color: var(--accent); font-weight: 700; line-height: 1.6; }

/* 淡出遮罩（仅结尾场景） */
.fade-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: var(--bg); opacity: 0; z-index: 10; pointer-events: none; }

/* 正文 */
.body-text { font-size: 30px; line-height: 1.8; color: var(--fg); }
.section-title { font-family: "Noto Serif SC", serif; font-weight: 700; color: var(--fg); line-height: 1.3; }
.label-tag { font-size: 24px; color: var(--gold); font-family: "Noto Sans SC", sans-serif; }
```

#### GSAP 动画规则（不可违反）

1. **Timeline：** `{ paused: true }`，注册到 `window.__timelines["main"]`
2. **入场动画：** 用 `gsap.from()` 或 `tl.from()`，0.6-1.0s，eases 用 `power3.out`、`sine.inOut`、`expo.out`、`back.out(1.7)` 混合，同一场景至少 3 种不同 ease
3. **禁止 exit 动画**（除最后场景淡出）。场景内容必须在 transition 开始时完全可见
4. **场景过渡：** blur crossfade（25px blur，0.5-0.6s），转折场景可用 vertical push
5. **入场偏移：** 第一个动画在场景开始后 0.1-0.3s
6. **禁止 `repeat: -1`**：所有循环动画用 `Math.floor(totalDur / cycleDuration) - 1`
7. **禁止异步构建**：timeline 必须同步构建，不用 async/await/setTimeout
8. **禁止 `Math.random()` 或 `Date.now()`**

#### 场景过渡函数（直接复制使用）

```javascript
// Blur crossfade（用于大部分过渡）
function blurCrossFade(timeline, oldScene, newScene, T) {
  timeline.to(oldScene, { filter: "blur(25px)", scale: 1.05, duration: 0.6, ease: "power1.in" }, T);
  timeline.to(oldScene, { opacity: 0, duration: 0.4, ease: "power1.in" }, T + 0.4);
  timeline.fromTo(newScene,
    { filter: "blur(25px)", scale: 0.95, opacity: 0 },
    { filter: "blur(25px)", scale: 0.95, opacity: 1, duration: 0.3, ease: "power1.inOut" },
    T + 0.5
  );
  timeline.to(newScene, { filter: "blur(0px)", scale: 1, duration: 0.6, ease: "power1.out" }, T + 0.8);
}

// Vertical push（用于转折场景）
function verticalPush(timeline, oldScene, newScene, T) {
  timeline.to(oldScene, { y: -1080, duration: 0.5, ease: "power3.inOut" }, T);
  timeline.fromTo(newScene,
    { y: 1080, opacity: 1 },
    { y: 0, duration: 0.5, ease: "power3.inOut" },
    T
  );
}
```

#### Vertical push 后必须重置

使用 vertical push 后，必须在 transition 完成后重置两个场景的 y 位置：

```javascript
// T_push 是 push 开始的时间
tl.set(newScene, { y: 0 }, T_push + 0.6);
tl.set(oldScene, { y: 0, opacity: 0 }, T_push + 0.6);
```

#### 氛围动画模板

```javascript
var totalDur = DURATION;

// Ghost text 漂移
gsap.to("#ghost-N", { x: 20, duration: 4, ease: "sine.inOut", repeat: Math.floor(totalDur / 8) - 1, yoyo: true });

// 墨晕呼吸
gsap.to(".scene .bg-glow", { scale: 1.1, duration: 4.5, ease: "sine.inOut", repeat: Math.floor(totalDur / 9) - 1, yoyo: true, transformOrigin: "50% 50%" });

// 装饰线脉冲
gsap.to(".deco-line", { opacity: 0.8, duration: 3, ease: "sine.inOut", repeat: Math.floor(totalDur / 6) - 1, yoyo: true });

// 角落装饰脉冲
gsap.to(".corner-deco", { opacity: 0.7, duration: 3.5, ease: "sine.inOut", repeat: Math.floor(totalDur / 7) - 1, yoyo: true });
```

#### 场景时间分配（由配音时长驱动）

**场景切换时间 = 步骤 3d 算出的累积时间。不使用固定间隔。**

示例（8 场景）：

| 场景 | 配音时长 | 起始时间 | blurCrossFade 时间 |
|------|---------|---------|-------------------|
| 1    | 16.5s   | 0       | —                 |
| 2    | 18.9s   | 16.5    | 16.5              |
| 3    | 15.6s   | 35.4    | 35.4              |
| 4    | 24.3s   | 51.0    | 51.0              |
| 5    | 24.5s   | 75.3    | 75.3 (vertical push) |
| 6    | 26.6s   | 99.8    | 99.8              |
| 7    | 23.5s   | 126.4   | 126.4             |
| 8    | 21.2s   | 149.9   | 149.9             |

- `data-duration` = 所有场景配音时长之和
- `totalDur` 变量 = 同上
- 每个过渡函数的 T 参数 = 该场景的起始时间
- 最后场景淡出在 `totalDur - 8` 处开始

### 步骤 6：渲染视频

```bash
cd /Users/liyanda/Documents/project_code/hyperframes-videos

# 渲染
npx hyperframes render <子目录>/ --output <子目录>/output/<标题>-silent.mp4
```

- render 失败时检查：Puppeteer 是否安装（`node_modules/puppeteer`）、GSAP 路径是否正确（`../node_modules/gsap/`）

### 步骤 7：合并输出

```bash
cd /Users/liyanda/Documents/project_code/hyperframes-videos

ffmpeg -y \
  -i <子目录>/output/<标题>-silent.mp4 \
  -i <子目录>/audio/narration-full.mp3 \
  -c:v copy -c:a aac \
  -map 0:v:0 -map 1:a:0 \
  -shortest \
  <子目录>/output/<标题>.mp4

# 清理中间文件
rm <子目录>/output/<标题>-silent.mp4

# 打开给用户查看
open <子目录>/output/<标题>.mp4
```

## 错误处理

| 场景                   | 处理方式                                      |
|-----------------------|-----------------------------------------------|
| 文章 > 4000 字        | 精简幅度更大，目标 400-450 字口播稿            |
| render 失败           | lint + validate 排查，修复后重试               |
| 配音时长偏差 > 5s     | 调整 data-duration 和场景时间，重新 render     |
| 子目录已存在          | 提示用户确认是否覆盖                           |
| edge-tts 不可用       | 检查 `.venv/bin/activate` 和 edge-tts 安装     |

## 依赖检查

开始前确认以下依赖可用：

```bash
# Node.js 依赖
ls /Users/liyanda/Documents/project_code/hyperframes-videos/node_modules/gsap
ls /Users/liyanda/Documents/project_code/hyperframes-videos/node_modules/puppeteer

# Python 依赖
source /Users/liyanda/Documents/project_code/hyperframes-videos/.venv/bin/activate && edge-tts --version

# 系统依赖
ffmpeg -version | head -1
```

任何缺失的依赖先安装再继续。

## 敏感词替换表

| 原词   | 替换词                |
|--------|-----------------------|
| 杀了   | 除掉/离世            |
| 暴毙   | 突然离世             |
| 弑君   | 不轨行为             |
| 死穴   | 致命弱点             |
| 饿死   | 失去生计             |
| 灭亡   | 覆灭/崩溃            |
| 致死   | 导致离世             |
| 血腥   | 残酷/激烈            |
