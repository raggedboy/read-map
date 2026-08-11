# Read Map

个人阅读索引系统 — 轻量阅读控制面。

只做四件事：收集、推荐、记录、进度。

## 目录

```
read-map/
├── AGENTS.md
├── readings/           # 已经纳入阅读体系的材料，每个一个 YAML 文件
│   ├── domain-driven-design.yaml
│   └── ...
└── inbox.yaml          # 临时收集值得关注、尚未整理的材料
```

## 数据格式

每个 `readings/{name}.yaml`：

```yaml
title: 材料名称
type: book              # book | article | article-series | repo | paper
author: 作者             # 可选
edition: 1st            # 可选，书籍多版本时填写
link: https://...       # 可选，原始来源
description: 简短描述     # 可选，AI 语义匹配用

entries:
  - title: 条目标题
    description: 这个条目主要讲什么
    link: https://...   # 可选，直接阅读入口
    children:           # 可选，递归嵌套
      - title: 子条目
        description: 子条目内容描述
        progress: 0     # 0-100，只有叶子节点保存
        notes:           # 可选，阅读后记录
        link:
```

## 字段说明

| 字段 | 层级 | 必填 | 说明 |
|------|------|------|------|
| title | reading / entry | 是 | 材料或条目标题 |
| type | reading | 是 | book / article / article-series / repo / paper |
| author | reading | 否 | 作者 |
| edition | reading | 否 | 版本 |
| description | reading / entry | 否 | 主要讲什么，AI 语义匹配用 |
| link | reading / entry | 否 | 原始来源或直接阅读入口 |
| entries | reading | 是 | 条目列表 |
| progress | leaf entry | 是 | 0-100，仅叶子节点保存 |
| notes | entry | 否 | 阅读后少量记录 |
| children | entry | 否 | 子条目，递归嵌套 |

不增加 tag、priority、topic、status、rating。AI 根据已有字段推导。

## Progress 规则

- 只有叶子节点保存 `progress: 0-100`
- 父节点 progress = 直接子节点 progress 的平均值（递归计算）
- 叶子节点后来增加 children，删除自身 progress，由 children 接管
- 0 = 未开始，1-99 = 进行中，100 = 已完成

## 行为

### 查询推荐

用户问"XX 相关有什么可读"，扫描所有 `readings/*.yaml`，在 `title` + `description` 中做语义匹配。返回时优先定位到具体阅读单元（章节、文章、小节），不只推荐整本材料。附带当前 progress 和 `link`。

### 添加

用户明确说"添加/记录/收录"才写入。新发现的材料先进入 `inbox.yaml`。确认值得系统阅读后，核验目录结构，转入 `readings/`。

对于书籍：不在发现时猜章节，只有能核验目录时才拆。无法核验时先只保存书级信息。

对于持续变化的 repo/Skill：保存 canonical link，不复制正文。`progress: 100` 表示曾完成当前单元，不因远端变化自动清零。

### 更新进度

只有用户明确指令才能修改 progress。AI 不根据聊天内容自行判断用户读到了哪里。

记录格式尽量简短，例如"DDD / Bounded Context 100%"。

### 查看进度

按需读取 YAML 临时计算，不维护额外 Dashboard。父级进度和统计实时计算。

## 约束

- read-map 是阅读控制面，不是阅读器
- 不保存受版权保护材料的全文
- 不主动新增资料
- progress 只能由用户明确指令修改
- 只有叶子节点保存 progress
- 使用 title + description 做语义匹配，不要求 tag
- 推荐优先定位到具体阅读单元
- 目录无法核验时宁可停留在书级别
- 新材料先进入 inbox，确认后再整理到 readings
- notes 是可选的阅读后记录，不承担材料介绍职责
- 不主动扩展为知识图谱、项目实践库或复杂学习系统
