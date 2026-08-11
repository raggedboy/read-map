# Read Map

个人阅读索引系统。

目标只做四件事：

1. 收集高质量读物
2. 根据当前问题推荐相关读物
3. 记录阅读进度与简短笔记
4. 查看阅读进度

不做知识图谱，不保存原文，不维护复杂标签体系，也不把项目本身做成阅读器。

---

## 项目定位

`read-map` 是一个轻量的**阅读控制面**。

它负责：

- 我有哪些值得读的材料
- 当前问题最值得读什么
- 应该定位到哪个具体阅读单元
- 已经读到哪里
- 留下少量必要记录

真正的阅读仍在原始载体中完成，例如：

- 纸质书 / Kindle / 电子书
- PDF
- 网页
- GitHub 仓库 / Skill 文档

AI 会话只在需要时辅助理解，不承担材料长期存储。

适合管理：

- 经典书籍
- 文章 / 文章系列
- 论文
- 值得系统阅读的仓库或 Skill

核心原则：

> 只存元数据、阅读结构和进度，由 AI 基于 `title + description` 做语义匹配。

---

## 目录结构

```text
read-map/
├── AGENTS.md
├── readings/
│   ├── domain-driven-design.yaml
│   ├── refactoring.yaml
│   └── matt-pocock-skills.yaml
└── inbox.yaml
```

### `readings/`

已经纳入阅读体系的材料。

每本书、文章系列、论文集合或仓库使用一个 YAML 文件。

### `inbox.yaml`

临时收集值得关注、但尚未正式整理的材料。

流程：

```text
发现高质量材料
→ 加入 inbox
→ 确认值得系统阅读
→ 核验必要元数据 / 目录
→ 转入 readings/
```

不要在发现材料时提前猜测章节结构。

---

## 数据模型

示例：

```yaml
title: 领域驱动设计
type: book
author: Eric Evans
edition: 1st
link:
description: 领域驱动设计的经典著作。

entries:
  - title: Ch14 Maintaining Model Integrity
    description: 大型模型中的边界、一致性以及不同模型之间的关系。
    link:
    children:
      - title: Bounded Context
        description: 限界上下文的定义和识别方法，模型边界的理论基础。
        progress: 0
        notes:
        link:
```

字段：

| 字段 | 层级 | 必填 | 说明 |
|---|---|---:|---|
| title | reading / entry | 是 | 材料或条目标题 |
| type | reading | 是 | book / article / article-series / repo / paper |
| author | reading | 否 | 作者 |
| edition | reading | 否 | 版本；书籍存在多个版本时建议填写 |
| description | reading / entry | 否 | 这个材料或条目主要讲什么，供推荐匹配使用 |
| link | reading / entry | 否 | 原始来源或直接阅读入口 |
| entries | reading | 是 | 条目列表 |
| progress | leaf entry | 是 | 0-100，仅叶子节点保存 |
| notes | entry | 否 | 阅读后的少量记录、重点、链接或补充说明 |
| children | entry | 否 | 子条目，递归嵌套 |

不增加：

- tag
- priority
- topic
- practice
- rating
- status

这些信息优先由 AI 根据已有字段推导，避免数据模型膨胀。

### 层级约束

数据结构允许递归，但正常只展开到有实际阅读价值的层级，通常控制在 2-3 层。

不要为了目录完整而拆得过细。

### Progress 规则

`progress` 是唯一持久化的阅读状态。

规则：

- 只有叶子节点保存 `progress: 0-100`
- 父节点不保存 progress
- 父节点 progress = 直接子节点 progress 的平均值
- 如果子节点本身还有 children，则先递归计算其 progress
- 一个节点原本是叶子，后来增加 children 时，删除自身 progress，由 children 接管

展示时可以直接显示百分比，不需要保存 `todo / reading / done`。

如需统计：

```text
0      → 未开始
1-99   → 进行中
100    → 已完成
```

统计只针对**当前节点的直接 children**，避免因为某一章节拆分得更细而获得更高权重。

例如：

```text
领域驱动设计
42%
3 未开始 / 2 进行中 / 7 已完成 / 12 章
```

进入某章后：

```text
Ch14 Maintaining Model Integrity
60%
1 未开始 / 1 进行中 / 3 已完成 / 5 节
```

---

## 核心能力

第一阶段只实现：

```text
add
recommend
record
progress
```

### 1. 收集 `add`

用户明确说"添加 / 记录 / 收录"时才写入。

新发现但尚未整理的材料进入：

```text
inbox.yaml
```

确认需要系统阅读后，再核验必要元数据和结构并转入：

```text
readings/*.yaml
```

对于书籍：

- 不在发现阶段猜章节
- 只有能够从可靠来源核验目录时，才拆成具体章节
- 无法可靠获取目录时，可以先只保存书级信息
- 存在多个版本且章节可能不同，应记录 `edition`

对于持续变化的仓库 / Skill：

- 保存 canonical link
- 不复制正文到 read-map
- `progress: 100` 表示曾完成当前阅读单元，不因远端后来变化自动清零
- 只有确实出现版本追踪需求时，再考虑增加 commit / read_ref，不在第一阶段实现

---

### 2. 阅读推荐 `recommend`

推荐分为两层。

#### A. 内部推荐

优先扫描现有：

```text
readings/*.yaml
```

AI：

1. 根据当前问题匹配 `title + description`
2. 优先返回更具体的阅读单元
3. 返回当前 progress
4. 返回直接阅读入口 `link`
5. 简短说明为什么现在值得读

推荐尽量定位到具体章节、文章、论文部分或 Skill，而不是只推荐整本材料。

不要为了给出具体章节而临时猜测目录。

推荐结果示例：

```text
1. 《领域驱动设计》
   Ch14 → Bounded Context
   进度：0%
   原因：与你当前讨论的模块边界直接相关
   [打开来源]
```

#### B. 外部发现

只有现有 readings 不足，或者用户明确要求寻找新材料时，才进行 Web / Deep Research。

流程：

```text
当前问题
→ 搜索高质量外部材料
→ 推荐候选
→ 用户确认
→ inbox
→ 必要时核验目录
→ readings
```

外部发现与内部推荐分开：

- 外部搜索负责"还有什么值得收录"
- read-map 负责"我已经收录的东西里，现在该读什么"

外部发现可以由 ChatGPT、Codex + Deep Research 类 Skill 或其它研究 Agent 完成，不绑定具体工具。

---

### 3. 阅读 `read`

阅读本身不在 read-map 仓库中处理。

推荐后直接进入原始载体：

```text
read-map 推荐
→ 纸质书 / 电子书 / PDF / 网页 / GitHub
→ 阅读
```

需要 AI 辅助时，再临时把合法可访问的材料或指定部分带入 AI 会话：

```text
原始材料
→ AI 辅助解释 / 总结 / 问答
→ 返回原始材料继续阅读
```

read-map 不长期保存书籍、文章、论文或仓库正文。

---

### 4. 阅读记录 `record`

记录动作尽量压缩到一句话。

例如：

```text
DDD / Bounded Context 100%
```

或者：

```text
Matt / improve-codebase-architecture 60%
note: deep module 那部分值得结合模块审计再看
```

规则：

- 只有用户明确指令才能修改 progress
- AI 不根据聊天内容自行判断用户读到了哪里
- notes 完全可选
- notes 只保存少量阅读后信息，例如重点、链接、疑问或一句话说明
- 不要求维护完整读书笔记

---

### 5. 阅读进度 `progress`

按需读取 YAML 临时计算，不维护额外 Dashboard 数据。

例如：

```text
领域驱动设计
42%
3 未开始 / 2 进行中 / 7 已完成 / 12 章
```

父级进度和当前层级统计都实时计算。

需要更复杂的可视化时再增加，不作为第一阶段能力。

---

## 推荐与阅读链路

理想链路：

```text
遇到问题
→ 询问 read-map
→ 推荐 1-3 个最具体的阅读单元
→ 打开原始材料
→ 阅读
→ 必要时 AI 辅助理解
→ 一句话更新 progress / notes
→ 随时查看进度
```

手机端可以完成询问、推荐和阅读；如果没有方便的写入环境，可以在之后回到电脑统一记录。

不为了即时同步而引入数据库、Web UI 或复杂同步机制。

---

## AI 行为约束

建议写入 `AGENTS.md`：

```md
# Read Map Rules

- 项目只用于阅读资料的收集、推荐、记录和进度查询。
- read-map 是阅读控制面，不是阅读器，不保存受版权保护材料的全文。
- 不主动新增资料；只有用户明确要求时才写入。
- progress 只能由用户明确指令修改。
- 只有叶子节点保存 progress；父级递归计算。
- 推荐优先读取现有 readings/*.yaml。
- 使用 title + description 做语义匹配，不要求维护 tag。
- 推荐优先定位到具体阅读单元。
- 不为了具体章节而猜测书籍目录；目录无法可靠核验时宁可停留在书级别。
- 如果现有材料不足，可以搜索并建议新的高质量资料，但不要自动加入。
- 新材料先进入 inbox，确认后再整理到 readings。
- notes 是可选的阅读后记录，不承担材料介绍职责。
- 对持续变化的 repo / Skill 保存 canonical link，不复制正文。
- 不主动扩展为知识图谱、项目实践库、复杂学习系统或阅读器。
```

---

## 第一阶段边界

第一阶段只实现：

```text
add
recommend
record
progress
```

暂不实现：

- Dashboard 脚本
- Web UI
- 知识图谱
- Topic 文件
- 项目实践映射
- 自动评分
- 自动阅读状态推断
- 外部数据库
- 正文存储
- 自动版本追踪
- 自动同步远端仓库变化

先确保这四个能力足够顺手，再决定是否扩展。
