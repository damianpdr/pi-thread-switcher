# pi-thread-switcher

Amp-style session/thread switcher extension for [pi](https://github.com/nichochar/pi-coding-agent).

![thread-switcher](https://img.shields.io/badge/pi-extension-blue)

## Features

- **`/threads`** command — opens a full-screen thread switcher
- **`ctrl+t`** shortcut — quick access
- Split layout: live message preview on top, compact thread list below
- Fuzzy search filtering
- Project-scoped or all-sessions view (toggle with `ctrl+t` inside the switcher)
- Scroll preview with `shift+↑/↓`

## Install

Copy `index.ts` to your pi extensions directory:

```bash
mkdir -p ~/.pi/agent/extensions/thread-switcher
cp index.ts ~/.pi/agent/extensions/thread-switcher/
```

Restart pi — the extension auto-loads.

## Usage

| Key | Action |
|-----|--------|
| `/threads` | Open thread switcher |
| `↑` / `↓` | Navigate threads |
| `shift+↑` / `shift+↓` | Scroll preview |
| `enter` | Switch to selected thread |
| `ctrl+t` | Toggle project / all sessions |
| `esc` | Cancel |
| Type anything | Fuzzy filter |

## License

MIT
