# Raster CLI

Command-line client for the [Raster](https://raster.app) API. Browse, search, upload, download, tag, transfer, and delete library assets from a terminal or CI pipeline.

## Install

```sh
npm install -g @raster-app/cli
```

Run a single command without installing — the binary is `raster`:

```sh
npx -p @raster-app/cli raster whoami
```

A standalone macOS (Apple Silicon) binary ships with each [GitHub release](https://github.com/raster-app/raster-cli/releases) — no Node required.

## Authenticate

The CLI uses your organization's API key (create one in Raster under Settings → API Keys).

```sh
raster auth login
```

The command validates the key against the API and stores it in `~/.config/raster/config.json` with owner-only permissions. In CI, set `RASTER_API_KEY` instead.

The key resolves from the `--api-key` flag, then `RASTER_API_KEY`, then the config file. `raster auth status` shows which source is active.

## Org and library are derived from the key

An API key is scoped to one organization and a set of libraries. `raster auth login` captures that scope into the config file, so commands resolve it locally — no extra request per command:

- **`--org` is optional** — the organization comes from the key.
- **`--library` is optional when the key has a single library.** When the key can reach several, commands that act on one library ask you to pass `--library <id>` and list the choices.

Pass `--org` / `--library` to override, or to pick a library when the key spans more than one. A key supplied via `RASTER_API_KEY` with no prior login resolves its scope from the API on first use. If a key's library access changes in Raster, re-run `raster auth login` to refresh the cached list, or pass `--library`.

## Global flags

These work on every command, before or after the subcommand.

| Flag | Purpose |
| --- | --- |
| `--api-key <key>` | API key (overrides `RASTER_API_KEY` and the config file) |
| `--org <organizationId>` | Organization id (derived from the key when omitted) |
| `--library <libraryId>` | Library id (derived from the key when it has one library) |
| `--json` | Print the raw API payload to stdout and nothing else |
| `--verbose` | Log each request to stderr (method, path, masked key, status, duration) |

## Commands

Asset ids are always positional. `--library` selects the library when the key can reach more than one. `raster <command> --help` lists every flag.

### `auth`

| Command | Description | Example |
| --- | --- | --- |
| `raster auth login` | Validate an API key and store it (`--api-key`, or an interactive prompt). | `raster auth login` |
| `raster auth logout` | Remove the stored API key. | `raster auth logout` |
| `raster auth status` | Show which key is in use, its source, and the organization it reaches. | `raster auth status` |

### `whoami`

```sh
raster whoami
```

Show the organization, plan, and libraries the API key can access.

### `libraries`

| Command | Description | Example |
| --- | --- | --- |
| `raster libraries ls` | List libraries in the organization (`--page`, `--page-size`). | `raster libraries ls` |
| `raster libraries create --name <name>` | Create a library (`--slug` optional). | `raster libraries create --name "Brand"` |
| `raster libraries rename --name <name>` | Rename the library. | `raster libraries rename --name "Brand assets"` |

### `assets`

| Command | Description | Example |
| --- | --- | --- |
| `raster assets ls` | List assets; filter with `--tag` (up to 5), page with `--page`/`--page-size`. | `raster assets ls --library brand --tag sunset` |
| `raster assets get <assetId>` | Show one asset's metadata. | `raster assets get asset_123` |
| `raster assets search <query>` | Search across the organization (`--library` scopes to one). | `raster assets search "golden hour"` |
| `raster assets download <assetId>` | Download the file (`-o` path, `--force` to overwrite). | `raster assets download asset_123 -o photo.png` |
| `raster assets upload <files...>` | Upload local files (batched at 20 per request). | `raster assets upload ./photos/*.png` |
| `raster assets rm <assetIds...>` | Move assets to trash (`--yes` skips the prompt). | `raster assets rm asset_123 asset_456` |
| `raster assets describe <assetId> --text <text>` | Set an asset's description. | `raster assets describe asset_123 --text "Hero shot"` |
| `raster assets transfer <assetIds...> --to <libraryId>` | Move assets to another library. | `raster assets transfer asset_123 --to archive` |

### `tags`

| Command | Description | Example |
| --- | --- | --- |
| `raster tags ls` | List tags in the library (`--limit`). | `raster tags ls --library brand` |
| `raster tags add <assetIds...> --tag <tag...>` | Add tags to assets. | `raster tags add asset_123 --tag launch` |
| `raster tags rm <assetIds...> --tag <tag...>` | Remove tags from assets. | `raster tags rm asset_123 --tag launch` |

### `orgs`

```sh
raster orgs create --email <email> [--name <name>] [--save]
```

Create an organization and library with no account (held 30 days until claimed). Prints the claim URL; `--save` stores the minted key. Anonymous — sends no API key.

## Output and scripting

Human-readable tables print to stdout; progress and notes go to stderr, so stdout stays pipeable. Add `--json` for machine-readable output — e.g. `raster assets search "sunset" --json | jq '.hits[].id'`.

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
| `RASTER_CONFIG_HOME` | Config directory override (default `~/.config/raster`) |

## Development

```sh
bun install
bun test
bun run check:types
bun run gen:types   # regenerate src/api/openapi.d.ts from the live OpenAPI document
bun run build       # bundle dist/index.js
```

Types are generated from the public OpenAPI document at `https://api.raster.app/openapi.json`; CI fails when the committed types drift from production. The published package bundles its three libraries (`commander`, `zod`, `openapi-fetch`) into `dist/index.js` — installing the CLI pulls zero dependencies.

## License

Apache-2.0. Bundled third-party packages are attributed in [NOTICE](./NOTICE).
