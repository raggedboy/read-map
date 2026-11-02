---
name: read-add
description: Add explicitly confirmed reading sources to the cloud Inbox. Use when the user asks to add, collect, or save selected material.
---

# Read Add

Read `map/CONTRACT.md` completely and establish Agent access before calling the Client.

1. Accept only sources the user explicitly selected.
2. Read current cloud state with `node client/read-map-client.mjs state` and deduplicate by canonical link or normalized title.
3. Resolve only missing identity fields required by the Inbox contract.
4. Put one contract-valid item in a temporary JSON file and run `node client/read-map-client.mjs inbox add --input <file>`.
5. Report whether the source was added, duplicated, or unresolved. Do not discover additional material or create reading structure.
