---
name: read-record
description: Record explicitly stated reading progress or notes in map/readings. Use when the user reports progress, completion, or a note for a reading node.
---

# Read Record

Read `AGENTS.md`, `map/AGENTS.md`, and `map/CONTRACT.md` completely.

1. Resolve the user's title path to exactly one recursive node. Ask when the target is ambiguous.
2. Change only the stated `progress` or `notes` fields. Store progress only on leaves; allow notes on any node.
3. Preserve all other content and validate the complete reading before writing.
4. Report the compact changed title path and new value.

Finish when every explicit record is written or its ambiguity is identified.
