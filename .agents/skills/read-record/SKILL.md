---
name: read-record
description: Record explicitly stated cloud reading progress or notes. Use when the user reports progress, completion, or a note.
---

# Read Record

Read `map/CONTRACT.md` completely and establish Agent access before calling the Client.

1. Read cloud state with `node client/read-map-client.mjs state`.
2. Resolve the user's title path to exactly one Reading file and recursive numeric path. Ask when ambiguous.
3. Change only the stated progress or notes. Progress is allowed only on leaves.
4. Run `node client/read-map-client.mjs record --file <file.yaml> --path <0.1> --progress <0-100>` or use `--notes <text>`.
5. Report the compact changed title path and new value.
