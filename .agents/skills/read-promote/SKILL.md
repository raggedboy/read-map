---
name: read-promote
description: Prepare and discuss a reading draft from cloud Inbox sources, then write it only after explicit approval.
---

# Read Promote

Read `map/CONTRACT.md` completely. Promotion has a hard approval gate.

1. Read cloud state with `node client/read-map-client.mjs state` and resolve the selected Inbox indexes.
2. Inspect the actual source and discuss source-faithful versus reorganized structures when both are plausible.
3. Produce a complete contract-valid Reading JSON draft. Show metadata, full child structure, omissions, transformations, and unresolved decisions.
4. Stop and request explicit confirmation. A draft is not permission to write.
5. After confirmation, save the draft to a temporary JSON file and run `node client/read-map-client.mjs promote --file <slug.yaml> --inbox <indexes> --input <file>`.
6. Report the created Reading and removed Inbox sources. If the cloud state changed, stop and re-resolve instead of overwriting.
