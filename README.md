# Raster CLI

Command-line client for the [Raster](https://raster.app) API. Browse, search, upload, download, tag, transfer, and delete library assets from a terminal or CI pipeline.

## Install

```sh
npm install -g @raster-app/cli
```

Run ad hoc without installing:

```sh
npx @raster-app/cli whoami
```

A standalone macOS (Apple Silicon) binary ships with each [GitHub release](https://github.com/raster-app/raster-cli/releases) — no Node required.

## Authenticate

The CLI uses your organization's API key (create one in Raster under Settings → API Keys).

```sh
raster auth login
```

Validates the key against the API and stores it in `~/.config/raster/config.json` (mode `0600`). In CI, set `RASTER_API_KEY` instead — no login needed.

Key resolution order: `--api-key` flag, then `RASTER_API_KEY`, then the config file. `raster auth status` shows which source is active.

## Commands

```text
raster auth login|logout|status
raster whoami
raster libraries ls|create|rename
raster assets ls|get|search|download|upload|rm|describe|transfer
raster tags ls|add|rm
raster orgs create
```

Examples:

```sh
raster libraries ls --org org_123
raster assets ls --org org_123 --library lib_456 --tag sunset
raster assets upload --org org_123 --library lib_456 ./photos/*.png
raster assets search --org org_123 "golden hour" --json | jq '.hits[].id'
raster orgs create --email you@example.com --save
```

`raster <command> --help` documents every flag.

## Output

- Human-readable tables on stdout; progress and notes on stderr, so stdout stays pipeable.
- `--json` prints the raw API payload to stdout and nothing else.
- `--verbose` logs each request (method, path, masked key, status, duration) to stderr.

## Exit codes

| Code | Meaning |
| ---- | ------------------------------------ |
| 0    | Success |
| 1    | Unexpected error |
| 2    | Usage error (bad flags or arguments) |
| 3    | Authentication (missing or rejected key) |
| 4    | Not found |
| 5    | Validation or conflict |
| 6    | File too large |
| 7    | Network failure |

## Environment variables

| Variable | Purpose |
| --- | --- |
| `RASTER_API_KEY` | API key (overrides the config file) |
| `RASTER_API_BASE_URL` | API origin override — https only, except localhost |
| `RASTER_CONFIG_HOME` | Config directory override (default `~/.config/raster`) |

## Development

```sh
bun install
bun test
bun run check:types
bun run gen:types   # regenerate src/api/openapi.d.ts from the live OpenAPI document
bun run build       # bundle dist/index.js
```

Types are generated from the public OpenAPI document at `https://api.raster.app/openapi.json`; CI fails when the committed types drift from production. The published package bundles its three libraries (`commander`, `zod`, `openapi-fetch`) into `dist/index.js` — installing the CLI pulls zero dependencies. Releases run `scripts/check-tarball.ts`, which fails if the tarball contains anything beyond `dist/`, `package.json`, `README.md`, and `LICENSE`.

## License

Apache-2.0. Bundled third-party packages are attributed in [NOTICE](./NOTICE).
