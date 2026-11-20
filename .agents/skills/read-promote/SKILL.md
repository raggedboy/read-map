---
name: read-promote
description: Promote identified Inbox sources directly and report the created Readings for review.
---

# Read Promote

Read map/CONTRACT.md. An explicit promotion request authorizes creation for the identified sources. If the user asks for a preview, show it and wait. Clarify ambiguous selections.

1. Read state through Read Map MCP. Match each intended Inbox item and keep its index and original inboxVersion together.
2. Inspect the original. Preserve its headings, nesting and order including any titled introduction. For talks use page body headings first and the transcript as a supplement. When inspection is impossible leave the work unsplit. Only use a semantic split if the source has no explicit sections, marking it 自定义章节 in the description. Put recommendations and skip advice in the description.
3. Verify the source date to its known precision and look for an original image. Use imageRole content for a cover, illustration or screenshot, or identity for an official logo or portrait. Verify the link and omit unverified metadata.
4. Call read_map_promote directly. For multiple works in one request, generate one batchId and reuse it. After each successful creation match remaining source identities against returned state before selecting new indexes. For a conflict re-read and resolve the selection. Retry an uncertain call with its original arguments.
5. Report the created works and any missing metadata. The owner can review the latest batch in the library.

Create independent Reading roots for standalone works. Offer tags and related Reading files instead of requiring a topic. Keep deliberately scoped collections and excerpts as independent works with their own internal units and progress. Reuse an existing work for another tag. Never infer identity solely from a matching URL.
