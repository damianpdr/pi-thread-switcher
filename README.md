<p align="center">
  <h1 align="center">pi-thread-switcher</h1>
  <p align="center">
    A floating overlay thread/session switcher for <a href="https://github.com/mariozechner/pi-coding-agent">pi</a>
  </p>
  <p align="center">
    <a href="#features"><strong>Features</strong></a> ·
    <a href="#installation"><strong>Install</strong></a> ·
    <a href="#usage"><strong>Usage</strong></a> ·
    <a href="#keybindings"><strong>Keys</strong></a>
  </p>
</p>

<br/>

## Overview

A pi extension that adds a `/threads` command for fast session switching. Opens a centered floating panel over a live dimmed preview of the selected session — navigate threads and see their content in real-time before switching.

## Features

- **Floating overlay** — centered box composited over a live session preview background
- **Live preview** — background shows the selected session's messages, scrollable with `Shift+↑/↓`
- **Fuzzy search** — type to instantly filter sessions by name or first message
- **Scope toggle** — switch between project sessions and all sessions across your machine
- **Session management**
  - **Rename** (`Ctrl+R`) — give sessions meaningful names
  - **Delete** (`Ctrl+D`) — remove old sessions (protects current)
  - **Paste** (`Ctrl+P`) — paste a session's first message into the editor
- **Loading progress** — visual indicator while scanning all sessions
- **Smart display** — shows message count, relative timestamps, and working directory

## Installation

Copy `index.ts` into your pi extensions directory:

```bash
# Clone the repo
git clone https://github.com/damianpdr/pi-thread-switcher.git

# Copy to pi extensions
mkdir -p ~/.pi/agent/extensions/thread-switcher
cp pi-thread-switcher/index.ts ~/.pi/agent/extensions/thread-switcher/
```

Or directly:

```bash
mkdir -p ~/.pi/agent/extensions/thread-switcher
curl -o ~/.pi/agent/extensions/thread-switcher/index.ts \
  https://raw.githubusercontent.com/damianpdr/pi-thread-switcher/main/index.ts
```

Restart pi — the extension auto-loads.

## Usage

Type `/threads` in any pi session to open the switcher.

The overlay shows a compact list of sessions with a live preview in the background. Navigate with arrow keys to preview different sessions, then press `Enter` to switch.

### Scopes

| Scope | Description |
|-------|-------------|
| **Project** (default) | Sessions from the current working directory |
| **All** | Every session across all projects on your machine |

Press `Tab` to toggle between scopes.

## Keybindings

### Navigation

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate session list |
| `Shift+↑` / `Shift+↓` | Scroll background preview |
| `Enter` | Switch to selected session |
| `Tab` | Toggle project / all sessions |
| `Esc` | Close switcher |

### Session Management

| Key | Action |
|-----|--------|
| `Ctrl+R` | Rename selected session |
| `Ctrl+P` | Paste session's first message into editor |
| `Ctrl+D` | Delete selected session |

### Search

Just start typing to fuzzy-filter sessions by name or first message content.

## How It Works

The extension uses pi's `ctx.ui.custom()` API to render a full-screen TUI component:

1. **Background layer** — parses the selected session file and renders its messages as a dimmed preview filling the entire terminal
2. **Overlay layer** — a bordered floating box (75% width, centered) containing the session list, search bar, and help footer
3. **Compositing** — the overlay is drawn on top of the background, creating a layered effect

Sessions are loaded from pi's `SessionManager` — first the current project's sessions, then lazily all sessions in the background.

## Requirements

- [pi](https://github.com/mariozechner/pi-coding-agent) coding agent

## License

MIT
