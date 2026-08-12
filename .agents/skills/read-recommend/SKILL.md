---
name: read-recommend
description: Recommend the most relevant material already present in map/readings. Use when the user asks what to read for a problem or wants suggestions from the existing read map.
---

# Read Recommend

Read `AGENTS.md`, `map/AGENTS.md`, and `map/CONTRACT.md` completely.

1. Scan every node's `title` and `description` under `map/readings/*.yaml`.
2. Match the user's current problem to the most specific useful nodes. Do not search externally.
3. Recursively compute progress from leaves and include the direct link when available.
4. Return a short ranked recommendation with why each item is useful now.

Keep the repository unchanged. Finish when the recommendations cover the stated problem or clearly say the existing map has no suitable material.
