# pi-claude-code-tui

A pi package that gives startup a polished Pi header while keeping pi's original footer.

![Screenshot](./assets/screenshot.png)

## What it changes

- Header title: left-aligned `─── Pi v<pi version> ─────`
- Pi logo in `rgb(215,119,87)`
- Center text: `Let's build something great!`
- Shows current model, thinking effort, and cwd
- Right-side tips panel on wide terminals
- Codex-style rounded input box
- Keeps pi's original footer and spinner

## Try locally

```bash
pi -e .
```

Or install it into the current project:

```bash
pi install -l .
```

## Commands

- `/pi-startup-look` — reapply this look
- `/pi-look` — restore pi's built-in header, footer, editor, and spinner
