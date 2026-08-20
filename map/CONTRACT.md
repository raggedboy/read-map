# Read Map Contract

This contract defines the stable logical data exchanged by the website, Agent Skills, and Client. Storage is currently implemented by D1 for structured documents and R2 for source files; callers must not depend on those storage details.

## Inbox

An Inbox item is an unshaped source:

```yaml
title: string
type: collection | book | article | paper | repo
author: string       # optional
link: string         # optional
version: string      # optional
description: string  # optional
added: YYYY-MM-DD    # optional
```

`title` and `type` are required. Inbox items never contain reading structure or progress. Identity is determined by canonical link when present, otherwise by normalized title.

## Reading

A Reading is one recursive `ReadingNode`:

```yaml
title: string
type: collection | book | article | paper | repo | section
author: string       # optional
link: string         # optional
version: string      # optional
description: string  # optional
progress: 0          # optional; leaf nodes only
notes: string        # optional; any node
children:            # optional; recursive ReadingNode[]
  - title: string
    type: section
```

A node with children must not store progress. Missing leaf progress means `0`. Parent progress is the arithmetic mean of direct children, calculated recursively.

## Resource links

R2-backed resources use logical links beginning with `resources/`, such as `resources/book.pdf`. Callers must not store local absolute paths, database identifiers, bucket names, or deployment-specific URLs.

## Operations

- `add`: append a confirmed, deduplicated Inbox item.
- `record`: update only an explicitly selected node's progress or notes.
- `promote`: after explicit approval, create one Reading and remove the selected Inbox items.
- `recommend` and `research`: read-only.

All writes use the latest document version and reject stale updates.
