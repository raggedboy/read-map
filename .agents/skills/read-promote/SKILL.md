---
name: read-promote
description: Prepare and discuss a reading draft from inbox sources or reshape an existing reading. Use only when the user explicitly asks to promote or invokes read-promote.
---

# Read Promote

Read `AGENTS.md`, `map/AGENTS.md`, and `map/CONTRACT.md` completely. Promotion has a hard approval gate: a draft is not permission to write formal reading data.

## Prepare evidence

1. Resolve the selected inbox source or existing reading.
2. Verify identity and inspect the actual material. For a repository, prefer a local copy under `map/resources/{slug}/`; with user approval, shallow-clone it when absent. For a PDF, use the supplied local file. Resources remain untracked.
3. When a local repository already exists, report its current commit or version and use it unchanged. If it is stale or unsuitable, stop and let the user decide whether to refresh it.
4. Decide structure with the user for this material. Present source-faithful and reorganized options when both are plausible; do not encode a global file-selection policy.

This phase is complete only when the material identity, analyzed version, and proposed structural basis are explicit.

## Draft and discuss

Create a contract-valid recursive YAML draft. For a complex draft, store it in `.cache/promote-{slug}.yaml`; simple drafts may stay in the conversation. Show:

1. reading metadata;
2. the complete proposed `children` structure;
3. the structural evidence, omissions, transformations, and unresolved decisions.

Use `$grill-me` when the shape requires substantial judgment. Stop at the approval gate and ask for explicit confirmation. Do not write to `map/readings/` or remove inbox items before confirmation.

## Commit the promotion

After explicit confirmation only:

1. Write the confirmed draft to one flat `map/readings/{slug}.yaml`, or replace the confirmed existing reading.
2. When reshaping an existing reading, preserve progress and notes by verified node mapping; stop and ask when a mapping is ambiguous.
3. Validate the complete reading against `map/CONTRACT.md` and the app validator.
4. After successful validation, remove every promoted inbox item in the same operation. On any failure, keep inbox intact and report the conflict.

Finish when the formal reading validates and the promoted inbox items are gone, or when the exact unresolved decision is in the user's hands.
