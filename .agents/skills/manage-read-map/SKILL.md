---
name: manage-read-map
description: Manage this repository's reading control plane. Use when the user asks for reading recommendations, external discovery of books/articles/papers/repos, adding confirmed material to inbox.yaml, promoting an inbox item into readings, recording reading progress or notes, or viewing progress.
---

# Manage Read Map

Read `AGENTS.md` before acting. Treat it as the source of truth for the data model and write boundaries.

## Route the request

Choose the matching branch:

- **Recommend:** search existing `readings/*.yaml` and return the most specific matching entries with computed progress and links. Keep the repository unchanged.
- **Discover:** investigate external candidates, applying the verification rubric below. Separate discovery from collection and keep the repository unchanged unless the user explicitly says to add, record, or collect candidates.
- **Add:** deduplicate against `inbox.yaml` and `readings/*.yaml`, then append explicitly confirmed candidates to `inbox.yaml` with `title`, `type`, optional `author`, canonical `link`, a concise semantic `description`, and `added` using the current local date.
- **Promote:** move an explicitly confirmed inbox item into one flat `readings/{slug}.yaml`. Verify its identity and reading structure from a canonical source, supplied PDF, or repository documentation. Preserve only verified entries; use `entries: []` when no structure can be verified. Remove the promoted inbox item only after writing the reading successfully.
- **Record:** update only the progress or notes the user explicitly identifies. Resolve the title path, preserve leaf-only progress, and report the compact changed path.
- **Progress:** recursively compute progress from leaf entries without persisting derived values.

Finish when every requested branch has either produced its stated result or named the exact unresolved evidence needed.

## Verify discovery candidates

Identify each work exactly before recommending it: title, author or owning organization, material type, canonical link, and publication identity. Search primary or canonical sources first; use reputable bibliographic sources to resolve books and papers. Treat a research direction, tool name, vague title, or unattributed concept as unresolved rather than inventing a work.

Classify candidates:

- **Classic:** field-defining work with durable influence.
- **Authoritative:** first-party or recognized expert source with direct relevance.
- **Supporting:** credible and useful, but narrower, derivative, or weakly matched.
- **Unresolved:** identity, provenance, or relevance cannot be verified.

For a short list, favor Classic and Authoritative candidates that cover distinct parts of the user's problem. Explain exclusions briefly. Authority alone is insufficient: require direct relevance to the stated reading goal.

## Shape readings

Default to one source per reading. Combine multiple articles only when they form a coherent series under the same canonical publisher or author; represent that as `article-series`. Keep unrelated sources separate even when they share a topic.

For books and PDFs, use the published table of contents, PDF bookmarks, and visible heading pages as evidence. For repositories, prefer the canonical documentation's intended reading path over the raw directory tree. Mark proposed structure as unverified instead of presenting it as an official table of contents.

Write descriptions for semantic retrieval: state what the unit teaches and the decision or problem it helps address. Keep notes for post-reading observations.
