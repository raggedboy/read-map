# Read Map App

This directory owns the local visualization and simple YAML controls. `../map/AGENTS.md` owns the data contract.

## Boundaries

- Keep the UI in React + TypeScript and the local API in Node.
- Keep YAML as the only business state. Browser state is temporary UI state.
- Read and write only the configured map directory; listen only on `127.0.0.1`.
- Validate the complete affected YAML document before every atomic write.
- Use optimistic concurrency and reject stale writes.
- Modify progress only on leaves. Compute parent and reading progress recursively.
- Limit destructive UI actions to confirmed Inbox deletion.
- Leave discovery, recommendation, promote, reading deletion, and structural editing to the Agent workflow.

The production start command builds stale frontend assets, starts the local server, and opens the browser. Keep build artifacts and dependencies out of Git.
