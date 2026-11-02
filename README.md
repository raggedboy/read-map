# Read Map

Read Map is a personal reading workspace. Agent Skills handle research, discussion, approval, and recording; the hosted application provides visualization and lightweight controls; D1 and R2 hold authoritative data and source files.

## Directory map

```text
.agents/skills/   Agent reading workflows
app/              UI and HTTP routes
client/           stable remote data client
map/CONTRACT.md   the single stable data contract
db/ + drizzle/    D1 schema and migrations
public/           site assets
scripts/          build and environment helpers
```

The remaining root files are build-tool configuration required by Sites/Vinext. Generated output, dependencies, local runtime state, reading data, and resource files are excluded from Git.

## Client

The Client defaults to the production Read Map URL. For a protected Site, configure `READ_MAP_AUTHORIZATION` with an authorized Sites bearer token in the calling environment; never commit it.

```bash
npm run read-map -- state
npm run read-map -- inbox add --input /tmp/item.json
npm run read-map -- record --file example.yaml --path 0.1 --progress 60
npm run read-map -- promote --file example.yaml --inbox 0 --input /tmp/reading.json
```

See `map/CONTRACT.md` for the logical protocol.

## Recoverable Inbox removal

The connected Read Map plugin supports standalone `read_map_delete_inbox` with an original Inbox version, selected index, and complete expected item. Recover deleted sources using `read_map_deleted_inbox` and `read_map_restore_inbox`. Restore appends only the deleted source and preserves current Inbox contents. See the contract for approval, conflict, and safe-retry rules. These operations are not added to the CLI.
