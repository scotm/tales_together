# FigCraft from source — launch and agent notes

FigCraft is the open-source, Rust interface-design app used to sketch Tales Together screens. This
note covers the local source build (v0.11.2), how to launch it for an agent, and the rules an agent
must follow when driving it. Product docs: <https://getartcraft.com/apps/figcraft>.

## What is installed

| Thing | Path |
| --- | --- |
| Source (tag `v0.11.2`) | `~/src/figcraft` |
| Optional fonts | `~/src/craft-fonts` |
| GUI | `~/src/figcraft/target/release/figcraft` |
| Headless CLI | `~/src/figcraft/target/release/figcraft-cli` |
| Collab server | `~/src/figcraft/target/release/figcraft-server` |
| Upstream docs | `~/src/figcraft/docs/{cli,mcp,control-protocol}.md` |

Build (release, about 1–2 minutes on this machine after the first fetch):

```sh
cd ~/src/figcraft
cargo build --release -p figcraft -p figcraft-cli -p figcraft-server
```

Fonts are optional. Without `~/src/craft-fonts` the build warns and falls back to system fonts. With
it, UI and Text-tool fonts match upstream. Rebuild if the font checkout changes.

The clone is a detached HEAD at the release tag. Branch before editing upstream code.

## Launch

### GUI, no agent

```sh
~/src/figcraft/target/release/figcraft
```

### GUI with the control channel (required for attached MCP)

```sh
# quit the installed app first if you want the source build to be the only one running
osascript -e 'quit app "FigCraft"'

~/src/figcraft/target/release/figcraft --control 7979
```

- The control channel binds `127.0.0.1` only.
- Pick a free port with `lsof -nP -iTCP:7979 -sTCP:LISTEN`; any number works.
- Confirm it is up: the process logs `FigCraft control server listening on 127.0.0.1:7979`.
- The installed `.app` is **not** started with a control port by default. The source binary is a
  separate process; launching it does not add a port to the installed app.

### Headless CLI

```sh
~/src/figcraft/target/release/figcraft-cli info ~/src/figcraft/examples/ridgeline-app.figcraft
~/src/figcraft/target/release/figcraft-cli export <file> -o out/ --format png --scale 2
~/src/figcraft/target/release/figcraft-cli run script.json --out result.figcraft
~/src/figcraft/target/release/figcraft-cli commands --filter layout
```

### Collaboration server

```sh
~/src/figcraft/target/release/figcraft-server --help
```

Not needed for local design work.

## Copying binaries to `~/.local/bin`

**Yes, the binaries are self-contained.** On macOS they link only Apple system frameworks
(`AppKit`, `Metal`, `CoreGraphics`, `libSystem`, …). No Homebrew dylibs, no `LC_RPATH`, no runtime
files next to the executable. Fonts are embedded in the binary.

Verified by copying all three to a temp folder and running them there: CLI `info` worked, GUI started
with `--control`, answered `ui.inspect`, and quit.

```sh
mkdir -p ~/.local/bin
ln -sf ~/src/figcraft/target/release/figcraft      ~/.local/bin/figcraft
ln -sf ~/src/figcraft/target/release/figcraft-cli  ~/.local/bin/figcraft-cli
ln -sf ~/src/figcraft/target/release/figcraft-server ~/.local/bin/figcraft-server
```

Prefer symlinks over copies: rebuilds then update the command in place. Make sure `~/.local/bin` is
on `PATH`.

Caveats:

- Build is **arm64 only** (Apple Silicon). Intel needs a rebuild for `x86_64`.
- `figcraft` outside a `.app` bundle works, but macOS treats it as a plain executable: no Dock
  identity, icon or document-type registration. Use the installed `.app` for normal design work and
  the source binary for agent-controlled sessions.
- Code signing is not applied to local build output. Locally built binaries run fine; copying them to
  another Mac may trigger Gatekeeper.

## MCP setup

Two modes, never both at once:

```sh
# headless: in-process engine, one untitled document, CPU renders
~/src/figcraft/target/release/figcraft-cli mcp

# attached: every change appears in the running window
~/src/figcraft/target/release/figcraft-cli mcp --attach 7979
```

Claude Code:

```sh
claude mcp add figcraft -- ~/src/figcraft/target/release/figcraft-cli mcp
claude mcp add figcraft-app -- ~/src/figcraft/target/release/figcraft-cli mcp --attach 7979
```

OpenCode (`~/.config/opencode/opencode.jsonc`, V2 schema; add one server at a time):

```jsonc
{
  "mcp": {
    "servers": {
      "figcraft": {
        "type": "local",
        "command": ["/Users/scotm/src/figcraft/target/release/figcraft-cli", "mcp"]
      },
      "figcraft-app": {
        "type": "local",
        "command": ["/Users/scotm/src/figcraft/target/release/figcraft-cli", "mcp", "--attach", "7979"],
        "disabled": true
      }
    }
  }
}
```

Global MCP timeouts are already raised in that file (`mcp.timeout.startup` and `catalog` = 120s).
Execution defaults to 12 hours. Restart OpenCode after editing.

MCP exposes 19 tools: `list_commands`, `run_command`, `batch`, `create_node`, `set_properties`,
`inspect_document`, `get_node`, `select`, `export`, `screenshot`, `open_file`, `save_file`, `undo`,
`redo`, `pointer`, `key`, `type_text`, `inspect_ui`. Resources: `figcraft://document`,
`figcraft://commands`, `figcraft://node/{id}`, `figcraft://command/{id}`.

## Agent workflow

1. `list_commands` (filter) before guessing a command or parameter.
2. Build with `batch`; use `{"$ref": "name"}` / `{"$step": n}` for ids created in the same batch.
3. Verify with `inspect_document` / `get_node` for numbers and `screenshot` for pixels.
4. Save the source `.figcraft` under `docs/design/` (the first screen is
   `docs/design/story-forge.figcraft`, exported to `docs/design/exports/story-forge@2x.png`) and
   export PNGs for review.

Template start:

```sh
printf '%s' '[{"command":"file.newFromTemplate","params":{"template":"mobile-app"}}]' > start.json
~/src/figcraft/target/release/figcraft-cli run start.json --out app.figcraft
```

Templates: `mobile-app`, `landing-page`, `dashboard`, `design-system`, `wireframe-kit`,
`social-posts`, `slides`, `icon-set`.

Headless scripts are one undo step and all-or-nothing. A failed step rolls back, writes nothing and
exits 1.

## Rules that prevent broken layouts

- Coordinates are page units, x right, **y down**.
- `x`/`y` are relative to the parent frame. Groups and boolean groups have no coordinate space.
- Children of an auto-layout frame are positioned by the layout. Set `layout`, `gap`, `padding`,
  `mainAlign`, `crossAlign`, `sizingH`/`sizingV`; x/y is ignored.
- `sizingV: "hug"` wins over an explicit `height`. A 180px card collapses to content unless sizing is
  fixed.
- Colours are `#RRGGBB` or `#RRGGBBAA`. Gradients accept
  `{"type":"linearGradient","stops":["#7048E8","#1098AD"]}`.
- Commands act on `ids` when given, else on the current selection. New layers become the selection.
- Every mutation is one undo step; `batch` is atomic.
- Programmatic calls never open dialogs. File pickers, export dialogs and confirms do not appear.
- Attached calls are **not replayed** after a transport failure: the edit may already have applied.
  Inspect before retrying.

## Control channel (attached mode)

Newline-delimited JSON over loopback, one reply per request:

```json
{"id":1,"method":"engine.execute","params":{"command":"shape.rectangle","params":{"x":10,"y":10,"width":100,"height":50}}}
{"id":1,"ok":true,"result":{"id":2}}
```

Methods: `engine.execute`, `engine.commands`, `document.inspect`, `node.get`, `ui.inspect`,
`ui.pointer`, `ui.key`, `ui.type`, `ui.input`, `ui.menu.invoke`, `ui.set`, `ui.screenshot`,
`ui.render`, `window.new`, `window.list`, `window.focus`, `app.quit`.

Limits: 32 MiB per line, 8 connections, 60s request timeout, 8 queued requests. Hidden or minimised
windows still answer edits and inspection; screenshots wait for a paint. Requests run on the UI thread
on the next frame.

## Safety and confinement

Do not give an agent the whole disk. Confine file access:

```sh
~/src/figcraft/target/release/figcraft-cli mcp \
  --automation-read-root ~/src/tales_together \
  --automation-write-root ~/src/tales_together/design

~/src/figcraft/target/release/figcraft \
  --control 7979 \
  --automation-read-root ~/src/tales_together \
  --automation-write-root ~/src/tales_together/design
```

Reads are allowed inside read/write roots; writes only inside write roots. Symlinks are resolved and
missing paths fail closed. `--attach` refuses these flags because the app enforces its own roots.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `mcp --attach` cannot connect | App not started with `--control`, or wrong port. Check `lsof -nP -iTCP:7979 -sTCP:LISTEN`. |
| Port already in use | Pick another port; pass it to both app and `--attach`. |
| Text looks wrong | `~/src/craft-fonts` missing at build time. Clone it next to `figcraft` and rebuild. |
| Binary won't start after copying | Confirm architecture with `file <binary>`; this build is arm64. |
| `cargo` build errors after pull | Run `cargo clean -p figcraft-text` once, then rebuild (font embedding). |

## Version notes

- Source and binaries are **0.11.2**. Upstream is alpha; flags and commands change between releases.
- Command count at 0.11.2: **597**.
- The website says "400+ commands"; use `figcraft-cli commands --json` as the source of truth.
- Full MCP reference: `~/src/figcraft/docs/mcp.md`. CLI: `docs/cli.md`. Control protocol:
  `docs/control-protocol.md`. Contributor rules: `~/src/figcraft/AGENTS.md`.
