---
name: read-recommend
description: Recommend relevant material already present in cloud readings. Use when the user asks what to read for a problem.
---

# Read Recommend

Read `map/CONTRACT.md` completely.

1. Read current cloud state with `node client/read-map-client.mjs state`.
2. Match the user's problem against Reading and node titles and descriptions. Do not search externally.
3. Prefer the most specific useful nodes and include current progress and direct links.
4. Return a short ranked recommendation. Keep all data unchanged.
