# Read Map

This repository has two independent subdomains:

- Reading operations belong in `map/`. Read `map/AGENTS.md` before recommending, collecting, organizing, or updating reading data.
- Application development belongs in `app/`. Read `app/AGENTS.md` before changing the UI, API, build, or runtime.

The app depends on the YAML contract owned by `map/`; the map does not depend on the app. Keep package management and generated files inside `app/`.
