---
name: read-research
description: Research external books, articles, papers, repositories, or collections for a reading goal.
---

# Read Research

Read `map/CONTRACT.md` completely. Keep cloud data unchanged.

1. State the reading goal and inspect current readings with `node client/read-map-client.mjs state` to avoid duplicates.
2. Identify each candidate exactly: title, author or owner, type, canonical link, relevant version, and concrete value.
3. Verify claims from primary or canonical sources and judge the material itself.
4. Conclude `推荐` or `不推荐`; when evidence is insufficient, state the exact uncertainty and ask the user.

Do not add candidates to Inbox. Collection is handled by `$read-add` after explicit selection.
