---
name: read-add
description: Add explicitly confirmed reading sources to map/inbox.yaml. Use when the user asks to add, collect, or save selected material to the reading inbox.
---

# Read Add

Read `AGENTS.md`, `map/AGENTS.md`, and `map/CONTRACT.md` completely.

1. Accept only sources the user explicitly selected.
2. Deduplicate against `map/inbox.yaml` and every node in `map/readings/*.yaml` using identity and canonical link.
3. Resolve only missing identity fields needed by the Inbox contract. Do not discover additional material or shape reading structure.
4. Append valid items with the current local date in `added`, preserving all unrelated YAML.
5. Validate the complete inbox document before finishing.

Finish when every selected source is added or reported as a duplicate or unresolved identity.
