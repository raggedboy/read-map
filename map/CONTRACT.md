# Read Map Contract

This file is the source of truth for YAML data under `map/`. The app validator is an executable implementation of this contract. If they disagree, stop the operation and report the conflict.

## Inbox

`inbox.yaml` is a YAML list of atomic, unshaped sources. Each item uses:

```yaml
title: string
type: collection | book | article | paper | repo
author: string       # optional
link: string         # optional
version: string      # optional; edition, revision, tag, or commit
description: string  # optional
added: YYYY-MM-DD    # optional
```

`title` and `type` are required. Inbox items do not contain reading structure or progress.

## Readings

Every `readings/*.yaml` file contains one recursive `ReadingNode`:

```yaml
title: string
type: collection | book | article | paper | repo | section
author: string       # optional
link: string         # optional
version: string      # optional; edition, revision, tag, or commit
description: string  # optional
progress: 0          # optional; leaf nodes only
notes: string        # optional; any node
children:            # optional; recursive ReadingNode[]
  - title: string
    type: section
```

`title` and `type` are required on every node. A node with non-empty `children` must not store `progress`. A leaf may omit `progress`; it is then treated as `0`. Empty `children` is equivalent to a leaf and should normally be omitted.

Parent progress is computed recursively as the arithmetic mean of its direct children. A reading with no children and no explicit progress is unstarted.

## Invariants

- Use only the fields defined above.
- Keep `author` as display text, including multiple people or an organization.
- Use `section` for internal source structure such as parts, chapters, sections, directories, or files when no more specific material type applies.
- Use `collection` for a reading that groups independent sources.
- Store a source's progress in only one reading.
- Preserve verified source structure. Structural selection and rearrangement are decisions made during each promote; the contract does not prescribe them.
