---
name: laodazi-article-illustrator
description: 为文章生成配图。分析文章结构，在前半部、后半部各布置 1 张，共 2 张统一规格插画（国风厚涂写实 · 柔和低对比 · 青灰冷调 · 1920×1080 横版）。当用户说"给文章配图""加插图""illustrate article""generate images for article"时使用。
---

# 老达子文章配图 Skill

分析文章结构，识别需要配图的位置，按**统一规格**生成插画。

> ⚙️ **风格已固定，不做风格选择、不问用户** —— 直接生成。规格见下。

## 用法

```bash
/laodazi-article-illustrator path/to/article.md
```

无需任何风格参数，一律按统一规格出图。

## 统一风格规格（固定，不可选）

| 项 | 规格 |
|----|------|
| 画风 | 国风厚涂写实（Chinese 国风 thick-painting realism） |
| 对比 | 柔和低对比（soft, low contrast） |
| 色调 | 青灰冷调（青灰为主、冷色温） |
| 尺寸 | 1920×1080 横版 |
| 其它 | 无文字、无水印 |

**Prompt recipe** —— 每张图用以下前缀，再接场景描述：

```
国风厚涂写实，柔和低对比，青灰冷调，画面沉稳，构图大气，不要任何文字、不要水印。<场景描述>
```

场景描述中贴合文章的时代/场景（朝代、衣冠、城防、兵器、人物等）。**不要用水墨 / ink-wash** —— 对强叙事历史文太单薄。

## File Management

### Output Directory

每次会话建一个独立目录，以内容 slug 命名（**放在 vault 外**，见 Step 6）：

```
~/Documents/laodazi-illustrations/{topic-slug}/
├── source-article.md       # 源文件副本
├── outline.md              # 插图方案（固定风格）
├── prompts/
│   ├── illustration-1-xxx.md
│   └── illustration-2-yyy.md
└── illustration-1-xxx.png  # 本地生成的图（之后上传图床，不在 vault 留本地文件）
```

**Slug 生成**：
1. 从内容提取主题（2-4 词，kebab-case，可用拼音）
2. 例："大凌河之战" → `dalinghe-zhizhan`；"The Future of AI" → `future-of-ai`

### 冲突处理

若 `~/Documents/laodazi-illustrations/{topic-slug}/` 已存在：
- 追加时间戳：`{topic-slug}-YYYYMMDD-HHMMSS`

### 源文件

复制所有来源，命名为 `source-{slug}.{ext}`：`source-article.md`、`source-photo.jpg`、`source-reference.pdf` 等。

## Workflow

### Step 1：分析文章（不做风格选择）

1. 读文章内容
2. 提取关键信息：
   - 主题与核心论点
   - 各段落/章节的核心信息
   - 需要可视化的抽象概念、强画面场景
3. 提示词一律用中文，**无需做语言检测或多语言询问**

> 风格已固定，本步**不再**做风格信号扫描或风格选择。

### Step 2：确定插图位置（固定 2 张）

**插图的三个作用**：
1. 信息补充：帮助理解抽象概念
2. 概念可视化：把抽象转化为具体画面
3. 想象引导：营造氛围、增强阅读体验

**适合配图的内容**：
- 需要可视化的抽象概念
- 需要图解的过程/步骤
- 需要直观呈现的对比
- 需要强化的核心论点
- 需要氛围引导的场景

**插图数量：固定 2 张**（除非用户明确要求改数量）。
- 按「前半部一张、后半部一张」两点分布：前半部取开头布势或首个强画面/核心概念；后半部取关键转折或结尾升华。
- 对**无小标题的纯线性文章**（如老达子春秋体历史文），**不要按"每章一张"算** —— 按上述前半/后半两点分布，各取最强画面。
- 优先选核心论点、抽象概念、最强画面场景。

### Step 3：生成插图方案

写一份方案（固定风格，无需多套变体）：

```markdown
# Illustration Plan

**Article**: [文章路径]
**Style**: 统一规格（国风厚涂写实 · 柔和低对比 · 青灰冷调 · 1920×1080）
**Illustration Count**: 2

---

## Illustration 1

**Insert Position**: [段落名 / 段落描述]
**Purpose**: [此处为何需要配图]
**Visual Content**: [画面应呈现什么]
**Filename**: illustration-[slug].png

---

## Illustration 2
...
```

保存为 `outline.md`。

### Step 4：展示方案并直接生成

1. 简要展示 2 张插图的位置/画面方案（一张表即可）。
2. **不再询问风格**（已固定统一规格），**不设阻塞性确认门**。
3. 用户若想微调，可直接编辑 `outline.md` 后告知；如未提出异议，**展示方案后即进入生成**。

### Step 5：创建 prompt 文件

在 `prompts/` 下为每张图写一个 prompt 文件（中文），格式：

```markdown
Illustration theme: [2-3 词概念]
Style: 统一规格（国风厚涂写实 · 柔和低对比 · 青灰冷调 · 1920×1080）

Visual composition:
- Main visual: [画面主体描述]
- Layout: [元素布局]
- Decorative elements: [装饰元素]

Color scheme:
- Primary: 青灰
- Background: 冷调低饱和
- Accent: 低对比柔光

Style notes: 国风厚涂写实，柔和低对比，青灰冷调，无文字无水印
```

最终送给出图的实际 prompt = 统一前缀 + 本图场景描述（见 Step 6）。

### Step 6：生成图片

**出图后端（默认：通义万相 via baoyu-imagine）**

默认用 `baoyu-imagine` + 阿里 DashScope（通义万相）—— 便宜（约 ¥0.2/张）、对中文/古风理解强，复用用户已有的 `QWEN_API_KEY`（在 `~/.zprofile` 里映射成 `DASHSCOPE_API_KEY`）。默认模型 `qwen-image-2.0-pro-2026-04-22`（经 `DASHSCOPE_IMAGE_MODEL` 设定）。**不要用 Gemini**（用户无 Gemini key）。

**图片存到 vault 外**目录（如 `~/Documents/laodazi-illustrations/<slug>/`），**不要**存进文章所在 vault —— 它们会在 Step 6.5 上传到图床。

每张图一条命令（`${BUN_X}` 取值：优先 `bun`，否则 `npx -y bun`）。prompt 用统一前缀，`--size 1920x1080` 锁定横版（qwen-image-2.0 接受 512²–2048² 像素范围内的自由尺寸，1920×1080 合法）：

```bash
${BUN_X} ~/.claude/skills/baoyu-imagine/scripts/main.ts \
  --prompt "国风厚涂写实，柔和低对比，青灰冷调，画面沉稳，构图大气，不要任何文字、不要水印。<场景描述>" \
  --image "~/Documents/laodazi-illustrations/<slug>/illustration-<n>-<name>.png" \
  --provider dashscope --model qwen-image-2.0-pro-2026-04-22 --size 1920x1080
```

仅在用户要求时换后端：
- `--provider zai --model glm-image` → 智谱 CogView（更便宜；需 `BIGMODEL_API_KEY` + `ZAI_BASE_URL=https://open.bigmodel.cn/api/paas/v4`，可从 `ZHIPU_API_KEY` 映射）。
- 其它后端见 `baoyu-imagine` 文档。

**生成流程**：
1. 逐张执行上面的命令（顺序）
2. 每张完成后报进度："Generated X/2"
3. 失败自动重试一次
4. 重试仍失败则记原因，跳到下一张

### Step 6.5：上传图床（GitHub picgo）

依用户 `.FILE-RULES.md`，**vault 内不得放本地图片文件/文件夹** —— 图片必须落在 GitHub 图床。每张图在本地生成后（存 vault 外），上传并取 raw URL：

```bash
python3 ~/.claude/skills/laodazi-article-illustrator/scripts/upload_to_picgo.py \
  "<local.png>" "<article-slug>-<n>-<name>.png"
# 输出: OK <remote> https://raw.githubusercontent.com/hzauliyanda/picgo-images/main/img/<remote>
```

- Token 来自环境变量 `GH_PICGO_TOKEN`（在 `~/.zprofile` 设）。若缺失，告知用户并停止（**不要**回退到 vault 内本地路径）。
- 每张图用唯一远程名：`<article-slug>-<index>-<short-name>.png`（避免冲突）。
- 记下每张返回的 raw URL，供 Step 7 用。

### Step 7：更新文章

用 Step 6.5 返回的**图床 raw URL**（绝不用本地路径）在对应位置插入：

```markdown
![插图描述](https://raw.githubusercontent.com/hzauliyanda/picgo-images/main/img/<remote>.png)
```

**插入规则**：
- 在对应段落后插入
- 图片前后各空一行
- alt 文字用文章语言的简洁描述（alt 文字里不要用引号字符）
- 用 **Edit** 工具插入（**不要**用 Write 整文件重写 —— 会把文章的中文弯引号转成半角）。插入后核对半角 `"` 数量不变。

### Step 8：输出总结

```
文章配图完成！

Article: [文章路径]
Style: 统一规格（国风厚涂写实 · 柔和低对比 · 青灰冷调 · 1920×1080）
Generated: X/2 成功

Illustration Positions:
- illustration-xxx.png → After "段落名/描述"
- illustration-yyy.png → After "..."
...

[若有失败]
Failed:
- illustration-zzz.png: [失败原因]
```

## 插图修改

支持对单张插图的后续修改。

### 改单张

1. 找到要改的图（如 `illustration-siege.png`）
2. 如需要，更新 `prompts/` 下对应 prompt
3. 内容变化大则同步更新文件名 slug
4. 重新生成该图
5. 若图片引用变了，更新文章

### 新增一张

1. 在文章里确定插入位置
2. 建新 prompt（合适 slug，如 `illustration-new-concept.md`）
3. 生成新图
4. 在 `outline.md` 加一条
5. 在文章对应位置插入图片引用

### 删除一张

1. 找到要删的图
2. 删图文件与 prompt 文件
3. 删文章里的图片引用
4. 在 `outline.md` 删对应条目

### 文件命名约定

文件用有意义的 slug：
```
illustration-[slug].png
illustration-[slug].md (在 prompts/)
```

例：`illustration-siege-encirclement.png`、`illustration-lone-stand.png`

**Slug 规则**：
- 源自插图用途/内容（kebab-case）
- 文章内唯一
- 内容大改时同步更新 slug

## References

| File | Content |
|------|---------|
| `scripts/upload_to_picgo.py` | 图床上传脚本 |

> 历史 `references/styles/<style>.md` 多风格库已停用（风格已固定统一规格），不再引用。

## Notes

- 插图服务于内容：补充信息、可视化概念
- 同一文章内保持统一规格一致
- 单图生成通常 10-30 秒
- 敏感人物可用卡通替代
- 提示词用中文
- 插图文字（标签、说明）匹配文章语言

## Extension Support

自定义配置经 EXTEND.md。

**检查路径**（优先级）：
1. `.laodazi-skills/laodazi-article-illustrator/EXTEND.md`（项目）
2. `~/.laodazi-skills/laodazi-article-illustrator/EXTEND.md`（用户）

找到则在 Step 1 前加载。EXTEND 内容覆盖默认。
