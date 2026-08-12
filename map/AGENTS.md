# Read Map Data

个人阅读索引系统，只做收集、推荐、记录、进度。

## Storage

- `inbox.yaml`: 尚未整理的原子来源，一项对应一个来源。
- `readings/*.yaml`: 已形成的可执行阅读对象。
- `resources/`: 个人资源文件。
- `example/`: 进入版本管理的数据结构示例。

书籍、完整论文和仓库通常独立成为 reading。围绕同一具体问题的短文章可以整理成 `article-series`。同一来源只在一个 reading 中维护进度。

## Reading schema

```yaml
title: 材料名称
type: book              # book | article | article-series | repo | paper
author: 作者             # 可选
edition: 1st            # 可选
link: https://...       # 可选
description: 简短描述     # 可选，语义匹配用
entries:
  - title: 条目标题
    description: 条目内容
    link: https://...   # 可选
    progress: 0         # 仅叶子节点保存
    notes:              # 可选
    children:           # 可选，存在时删除本节点 progress
```

`title`、`type`、`entries` 必填；`entries: []` 表示尚未核验结构。类型只允许 `book`、`article`、`article-series`、`repo`、`paper`。

## Progress

- 只有叶子节点保存 `progress: 0-100`。
- 父节点进度递归取直接子节点进度的平均值。
- `0` 未开始，`1-99` 进行中，`100` 已完成。
- 只有用户明确指令才能修改 progress。

## Operations

- 推荐：先扫描 `readings/*.yaml` 的 `title + description`，优先返回具体阅读单元、当前进度和链接。
- 收集：只有用户明确要求添加时才写入；新来源先进入 `inbox.yaml`。
- 整理：核验身份和目录后再转入 readings。无法核验时使用 `entries: []`，不猜目录。
- 记录：只修改用户明确指定的 progress 或 notes。

不保存受版权保护材料全文，不主动新增资料，不增加 tag、priority、topic、status 或 rating。
