# pi-claude-code-tui

A pi package that gives startup a polished Pi header while keeping pi's original footer.

![Screenshot](./assets/screenshot.png)

## Installation

Install from npm globally for your user:

```bash
pi install npm:pi-claude-code-tui
```

Or install it only for the current project:

```bash
pi install -l npm:pi-claude-code-tui
```

Try it for one run without installing:

```bash
pi -e npm:pi-claude-code-tui
```

## What it changes

- Header title: left-aligned `─── Pi v<pi version> ─────`
- Pi logo in `rgb(215,119,87)`
- Center text: `Let's build something great!`
- Shows current model, thinking effort, and cwd
- Right-side tips panel on wide terminals
- Codex-style rounded input box
- Keeps pi's original footer and spinner

## Local development

```bash
pi -e .
```

## Commands

- `/pi-startup-look` — reapply this look
- `/pi-look` — restore pi's built-in header, footer, editor, and spinner

## License

MIT
