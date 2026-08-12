# Read Map Data

个人阅读索引系统，只做收集、推荐、整理、记录和进度。任何 YAML 读写前必须完整读取 `CONTRACT.md`；它是数据格式的唯一规约。

## Storage

- `inbox.yaml`: 尚未整理的原子来源，一项对应一个来源。
- `readings/*.yaml`: 已形成的可执行阅读对象。
- `resources/`: 个人资源文件。
- `example/`: 进入版本管理的数据结构示例，不承担规范定义。

同一来源只在一个 reading 中维护进度。只有用户明确指令才能修改 progress。

## Operations

- 推荐：先扫描 `readings/*.yaml` 的 `title + description`，优先返回具体阅读单元、当前进度和链接。
- 收集：只有用户明确要求添加时才写入；新来源先进入 `inbox.yaml`。
- 整理：使用 `read-promote` 先形成草案并讨论；用户明确确认后才写 readings 并移除 inbox 项。
- 记录：只修改用户明确指定的 progress 或 notes。

不保存受版权保护材料全文，不主动新增资料，不增加 contract 之外的字段。
