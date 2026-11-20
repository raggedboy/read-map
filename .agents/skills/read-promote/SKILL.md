---
name: read-promote
description: Prepare and discuss a reading draft from cloud Inbox sources, then write it only after explicit approval.
---

# Read Promote

Read `map/CONTRACT.md` completely and establish Agent access before calling the Client. Promotion has a hard approval gate.

1. Read cloud state with `node client/read-map-client.mjs state` and preserve the original inboxVersion together with the selected Inbox indexes.
2. Inspect each original source. When splitting a work, use its original headings, nesting and order. For talks, use the page’s body headings first and the transcript as a supplement. If the original cannot be inspected, leave the work unsplit pending verification. Only when the source has no explicit sections may you split by meaning; label the split 自定义章节 in the work’s description.
3. For every promotion, check the original source for its date (book edition, first publication, or talk delivery) and look for an original illustration, cover or screenshot (imageRole: content). An official portrait or logo is a fallback (identity). Verify the image link. Show published at its known precision, image and imageRole in the approval draft; identify unavailable metadata in the preview and omit unverified fields from the Reading.
4. Produce a complete contract-valid Reading JSON draft. Compare the draft with the original outline before approval. Account for each heading including any Introduction, in order, without omissions, merges or invented sections. Distinguish unheaded introductory text from a titled section. Put recommendations, importance and skip advice in description. Show the complete outline and flag uncertain boundaries.
5. Stop and request explicit confirmation. A draft is not permission to write.
6. After confirmation, save the draft to a temporary JSON file and run `node client/read-map-client.mjs promote --file <slug.yaml> --inbox <indexes> --inbox-version <original-version> --input <file>`.
7. Report the created Reading and removed Inbox sources. If the cloud state changed, stop and re-resolve instead of overwriting.

Create independent Reading roots for standalone works. Offer tags and related Reading files instead of requiring a topic. Keep deliberately scoped collections and excerpts as independent works with their own internal units and progress. Reuse an existing work for another tag. Never infer identity solely from a matching URL.
