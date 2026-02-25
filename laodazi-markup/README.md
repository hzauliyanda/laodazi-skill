# Markdown文章智能标注器

根据 laodazi-history-writer 的格式规则，自动为markdown文章添加颜色和加粗标注，突出重点内容。

## 快速开始

### 标注文章

```
/markup 文章路径.md
```

示例：
```
/markup /Users/liyanda/Documents/project_code/claudeCode/article/古装剧倭风化风波.md
```

我会：
1. 读取markdown文件
2. 智能分析重点内容
3. 自动添加颜色+加粗标注
4. 创建备份文件
5. 保存到原文件

## 标注规则

### 自动识别并标注

#### 1. 核心观点（红色 #DF2A3F）
```markdown
**<font style="color:#DF2A3F;">这不是艺术加工的问题，这是文化身份的问题。</font>**
```

#### 2. 关键问题（橙色 #FF6600）
```markdown
**<font style="color:#FF6600;">观众真的看得出来吗？</font>**
```

#### 3. 正面价值（绿色 #52C41A）
```markdown
**<font style="color:#52C41A;">观众的眼睛，是越来越毒了。</font>**
```

#### 4. 补充说明（蓝色 #1677FF）
```markdown
**<font style="color:#1677FF;">这不是艺术加工，这是误导。</font>**
```

#### 5. 一般重点（加粗）
```markdown
**真正的历史剧，不应该只是穿古装的现代剧。**
```

### 智能识别逻辑

| 类型 | 识别规则 | 标注样式 |
|------|----------|----------|
| 核心观点 | 包含"不是...而是"、"本质"、"核心"、"关键" | 红色+加粗 |
| 关键问题 | 包含"？"、"为什么"、"怎么"、"难道" | 橙色+加粗 |
| 正面价值 | 包含"成功"、"提升"、"进步"、"觉醒" | 绿色+加粗 |
| 补充说明 | 包含"这是"、"实际上"、"换句话说" | 蓝色+加粗 |
| 一般重点 | 包含"但是"、"然而"、"因此" | 加粗 |

## 使用模式

### 全面标注模式（默认）

```
/markup 文章.md
```

标注所有类型的内容，适合大多数文章。

### 保守标注模式

```
/markup 文章.md --rule conservative
```

只标注最重要的内容（核心观点+关键问题），避免过度标注。

### 基础标注模式

```
/markup 文章.md --rule basic
```

只加粗，不添加颜色，适合简洁风格。

### 预览模式

```
/markup 文章.md --preview
```

显示标注预览，不保存文件。用于查看效果后再决定是否应用。

## 使用示例

### 示例1：标注已写好的文章

```
/markup /Users/liyanda/article/从海昏侯墓看汉代的财富与权力.md
```

### 示例2：预览标注效果

```
/markup /Users/liyanda/article/古装剧倭风化风波.md --preview
```

### 示例3：保守标注

```
/markup /Users/liyanda/article/万历四十年砍树案.md --rule conservative
```

## 工作流程

### 配合写作流程

```
# 步骤1：生成文章
/history-write [选题]

# 步骤2：智能标注
/markup /path/to/article.md

# 步骤3：预览效果（可选）
/markup /path/to/article.md --preview

# 步骤4：发布到公众号
/laodazi-post-to-wechat /path/to/article.md
```

### 手动调整

如果自动标注不符合预期：
1. 使用备份文件恢复：`cp 文件.md.bak 文件.md`
2. 手动调整标注
3. 或者使用 `--rule conservative` 减少标注

## 标注前后对比

### 标注前
```markdown
这让人不禁想问：我们为什么突然对古装剧的服化道这么挑剔？

表面上看，这是观众在挑刺。但实际上，这是文化自信的一种体现。
```

### 标注后
```markdown
**<font style="color:#FF6600;">我们为什么突然对古装剧的服化道这么挑剔？</font>**

表面上看，这是观众在挑刺。**<font style="color:#52C41A;">但实际上，这是文化自信的一种体现。</font>**
```

## 注意事项

### 自动备份
标注前会自动创建 `.bak` 备份文件，可以随时恢复：

```bash
# 恢复原文件
cp 文章.md.bak 文章.md
```

### 不处理的内容

以下内容不会被标注：
- ✅ 标题（# ## ###）
- ✅ 代码块（```）
- ✅ 引用块（>）
- ✅ 图片说明
- ✅ 列表项

### 标注强度建议

| 文章类型 | 推荐模式 | 说明 |
|---------|----------|------|
| 短文章（<2000字） | conservative | 避免过度标注 |
| 长文章（>3000字） | comprehensive | 全面标注 |
| 观点型文章 | comprehensive | 突出观点 |
| 叙事型文章 | basic | 轻度标注 |

## 文件结构

```
laodazi-markup/
├── SKILL.md          # 主文档
├── README.md         # 本文件
└── scripts/
    └── markup.ts     # 标注脚本
```

## 常见问题

**Q：标注过度怎么办？**
A：使用 `--rule conservative` 减少标注，或从备份文件恢复后手动调整。

**Q：可以自定义颜色吗？**
A：可以，修改脚本中的 `colors` 配置。

**Q：标注后可以撤销吗？**
A：可以，使用 `.bak` 备份文件恢复原文件。

**Q：某些句子被错误标注了怎么办？**
A：手动调整即可，或者使用 `--rule conservative` 减少自动标注。

**Q：可以只标注特定类型吗？**
A：目前只支持按模式（basic/comprehensive/conservative）选择。

## 高级技巧

### 1. 逐步标注
```
# 先预览
/markup 文章.md --preview

# 满意后再应用
/markup 文章.md
```

### 2. 对比不同模式
```
# 保守模式
/markup 文章.md --rule conservative

# 查看效果，然后
# 恢复原文件
cp 文章.md.bak 文章.md

# 全面模式
/markup 文章.md --rule comprehensive
```

### 3. 批量处理
```
# 批量标注多篇文章
for file in *.md; do
  bun run markup.ts "$file" --rule conservative
done
```

---

**建议**：生成文章后先使用 `--preview` 预览效果，满意后再正式标注。
