import {
	CustomEditor,
	VERSION,
	type ExtensionAPI,
	type ExtensionContext,
	type KeybindingsManager,
} from "@earendil-works/pi-coding-agent";
import type { Component, EditorTheme, TUI } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import {
	applyRoundedEditorBorders,
	brand,
	center,
	cursorStyleOpen,
	formatCwd,
	headerColumnWidths,
	padRight,
	restyleEditorCursor,
} from "./render-utils.ts";

const LOGO_CELL = "███";
const LOGO_ANIMATION_INTERVAL_MS = 120;

type LogoColor = "panel" | "cyan" | "red" | "green" | "orange" | "white" | "flash" | "brand";
type LogoFrame = {
	phase: number;
	active: "left" | "top" | "right" | "none";
	ax: number;
	ay: number;
	flash: boolean;
	white: boolean;
};

const LOGO_FRAMES: LogoFrame[] = [
	...Array.from({ length: 4 }, (_, ay) => ({ phase: 0, active: "left" as const, ax: 2, ay, flash: false, white: false })),
	...Array.from({ length: 3 }, (_, ay) => ({ phase: 1, active: "top" as const, ax: 2, ay, flash: false, white: false })),
	...Array.from({ length: 5 }, (_, ay) => ({ phase: 2, active: "right" as const, ax: 5, ay, flash: false, white: false })),
	{ phase: 3, active: "none", ax: 0, ay: 0, flash: false, white: false },
	{ phase: 3, active: "none", ax: 0, ay: 0, flash: true, white: false },
	{ phase: 3, active: "none", ax: 0, ay: 0, flash: false, white: false },
	{ phase: 3, active: "none", ax: 0, ay: 0, flash: true, white: false },
	{ phase: 4, active: "none", ax: 0, ay: 0, flash: false, white: false },
	{ phase: 5, active: "none", ax: 0, ay: 0, flash: false, white: false },
	{ phase: 5, active: "none", ax: 0, ay: 0, flash: false, white: true },
	{ phase: 5, active: "none", ax: 0, ay: 0, flash: false, white: false },
	{ phase: 5, active: "none", ax: 0, ay: 0, flash: false, white: true },
	{ phase: 6, active: "none", ax: 0, ay: 0, flash: false, white: false },
];

const colorCell = (color: LogoColor): string => {
	switch (color) {
		case "cyan":
			return `\x1b[36m${LOGO_CELL}\x1b[39m`;
		case "red":
			return `\x1b[31m${LOGO_CELL}\x1b[39m`;
		case "green":
			return `\x1b[32m${LOGO_CELL}\x1b[39m`;
		case "orange":
		case "flash":
			return `\x1b[33m${LOGO_CELL}\x1b[39m`;
		case "white":
			return `\x1b[39m${LOGO_CELL}`;
		case "brand":
			return brand(LOGO_CELL);
		default:
			return " ".repeat(LOGO_CELL.length);
	}
};

function hasCell(y: number, x: number, cells: string): boolean {
	return cells.split(" ").includes(`${y},${x}`);
}

function hasPiece(y: number, x: number, py: number, px: number, cells: string): boolean {
	return cells.split(" ").some((item) => {
		const [dy, dx] = item.split(",").map(Number);
		return y === py + dy && x === px + dx;
	});
}

function logoCellColor(frame: LogoFrame, y: number, x: number): LogoColor {
	if (frame.white) {
		return hasCell(y, x, "3,2 3,3 3,4 4,2 4,4 5,2 5,3 5,5 6,2 6,5") ? "white" : "panel";
	}
	if (frame.flash && y === 6 && x >= 1 && x <= 6) return "flash";

	switch (frame.active) {
		case "left":
			if (hasPiece(y, x, frame.ay, frame.ax, "0,0 1,0 1,1 2,0")) return "red";
			break;
		case "top":
			if (hasPiece(y, x, frame.ay, frame.ax, "0,0 0,1 0,2 1,2")) return "cyan";
			break;
		case "right":
			if (hasPiece(y, x, frame.ay, frame.ax, "0,0 1,0 2,0 2,1")) return "green";
			break;
	}

	if (frame.phase === 6) {
		return hasCell(y, x, "3,2 3,3 3,4 4,4 4,2 5,2 5,3 5,5 6,2 6,5") ? "brand" : "panel";
	}

	if (frame.phase === 4) {
		if (hasCell(y, x, "2,2 2,3 2,4 3,4")) return "cyan";
		if (hasCell(y, x, "3,2 4,2 4,3 5,2")) return "red";
		if (hasCell(y, x, "4,5 5,5")) return "green";
		return "panel";
	}

	if (frame.phase >= 5) {
		if (hasCell(y, x, "3,2 3,3 3,4 4,4")) return "cyan";
		if (hasCell(y, x, "4,2 5,2 5,3 6,2")) return "red";
		if (hasCell(y, x, "5,5 6,5")) return "green";
		return "panel";
	}

	if (frame.phase <= 3 && hasCell(y, x, "6,1 6,2 6,3 6,4")) return "orange";
	if (frame.phase >= 2 && hasCell(y, x, "2,2 2,3 2,4 3,4")) return "cyan";
	if (frame.phase >= 1 && hasCell(y, x, "3,2 4,2 4,3 5,2")) return "red";
	if (frame.phase >= 3 && hasCell(y, x, "4,5 5,5 6,5 6,6")) return "green";
	return "panel";
}

function piLogoFrame(frameIndex: number): string[] {
	const frame = LOGO_FRAMES[frameIndex % LOGO_FRAMES.length]!;
	// Crop the installer's 9-row canvas vertically for a compact header, then
	// tight-crop empty columns so the mark centers cleanly in the logo half
	// (same idea as Claude Code's centered mascot).
	const grid: LogoColor[][] = [];
	for (let y = 1; y <= 7; y++) {
		const row: LogoColor[] = [];
		for (let x = 1; x <= 8; x++) row.push(logoCellColor(frame, y, x));
		grid.push(row);
	}

	let minX = 7;
	let maxX = 0;
	for (const row of grid) {
		row.forEach((cell, x) => {
			if (cell !== "panel") {
				minX = Math.min(minX, x);
				maxX = Math.max(maxX, x);
			}
		});
	}
	if (maxX < minX) {
		minX = 0;
		maxX = 7;
	}

	return grid.map((row) => {
		let line = "";
		for (let x = minX; x <= maxX; x++) line += colorCell(row[x]!);
		return line;
	});
}

function borderLine(left: string, label: string, right: string, width: number): string {
	if (width <= 1) return "";
	if (width < 8 || label.length === 0) return brand(truncateToWidth(left + "─".repeat(Math.max(0, width - 2)) + right, width, ""));

	const before = "─── ";
	const after = " ─────";
	const fixedWidth = visibleWidth(before) + visibleWidth(label) + visibleWidth(after);
	const fill = Math.max(0, width - 2 - fixedWidth);
	return `${brand(left)}${brand(before)}${label}${brand(after)}${brand("─".repeat(fill))}${brand(right)}`;
}

function boxedLine(content: string, width: number): string {
	if (width <= 2) return truncateToWidth(content, width, "");
	return `${brand("│")}${padRight(content, width - 2)}${brand("│")}`;
}

function twoColumn(left: string, right: string, leftWidth: number, rightWidth: number): string {
	// Tips sidebar truncates with an ellipsis (Claude Code style); logo half does not.
	return `${padRight(left, leftWidth)} ${brand("│")} ${padRight(right, rightWidth, "…")}`;
}

class PiStartupHeader implements Component {
	private frame = 0;
	private readonly timer: NodeJS.Timeout;

	constructor(
		private readonly pi: ExtensionAPI,
		private readonly ctx: ExtensionContext,
		private readonly tui: TUI,
	) {
		this.timer = setInterval(() => {
			if (this.frame < LOGO_FRAMES.length - 1) {
				this.frame++;
				this.tui.requestRender();
			} else {
				clearInterval(this.timer);
			}
		}, LOGO_ANIMATION_INTERVAL_MS);
		this.timer.unref?.();
	}

	render(width: number): string[] {
		if (width < 24) return [this.ctx.ui.theme.fg("accent", `Pi v${VERSION}`)];

		const theme = this.ctx.ui.theme;
		const muted = (s: string) => theme.fg("muted", s);
		const dim = (s: string) => theme.fg("dim", s);
		const bold = (s: string) => theme.bold(s);

		const innerWidth = width - 2;
		const { leftWidth, rightWidth, useTips } = headerColumnWidths(innerWidth);
		const model = this.ctx.model?.id ?? "Default model";
		const effort = this.pi.getThinkingLevel();
		const cwd = formatCwd(this.ctx.cwd);

		const leftLines = [
			...piLogoFrame(this.frame).map((line) => center(line, leftWidth)),
			center(bold("Let's build something great"), leftWidth),
			center(muted(`${model} with ${effort} effort`), leftWidth),
			center(dim(cwd), leftWidth),
		];

		// Right sidebar: short headings + body lines (truncated with … when narrow).
		const tipDivider = brand("─".repeat(Math.max(8, Math.min(rightWidth, 22))));
		const tipLines = [
			"",
			brand(bold("This is your own agent harness")),
			muted("Ask Pi to build it"),
			tipDivider,
			brand(bold("AI is powerful")),
			muted("But you are on your own"),
			muted("You are powerful cause you're building"),
			muted("You are wise cause you're creating"),
			"",
			"",
		];

		const lines = [borderLine("╭", `${brand("Pi")} v${VERSION}`, "╮", width)];
		for (let i = 0; i < leftLines.length; i++) {
			const content = useTips ? twoColumn(leftLines[i] ?? "", tipLines[i] ?? "", leftWidth, rightWidth) : padRight(leftLines[i] ?? "", leftWidth);
			lines.push(boxedLine(content, width));
		}
		lines.push(borderLine("╰", "", "╯", width));
		return lines.map((line) => truncateToWidth(line, width, ""));
	}

	invalidate(): void {}

	dispose(): void {
		clearInterval(this.timer);
	}
}

class CodexStyleEditor extends CustomEditor {
	constructor(
		tui: TUI,
		theme: EditorTheme,
		keybindings: KeybindingsManager,
		private readonly cursorOpen: () => string,
	) {
		super(tui, theme, keybindings, { paddingX: 1 });
	}

	render(width: number): string[] {
		const open = this.cursorOpen();
		const lines = super.render(width).map((line) => restyleEditorCursor(line, open));
		return applyRoundedEditorBorders(lines, width);
	}
}

let activePiStartupHeader: PiStartupHeader | undefined;

function disposeActiveHeader(): void {
	activePiStartupHeader?.dispose();
	activePiStartupHeader = undefined;
}

function applyPiLook(pi: ExtensionAPI, ctx: ExtensionContext): void {
	if (ctx.mode !== "tui") return;

	ctx.ui.setTitle("Pi");
	ctx.ui.setHeader((tui) => {
		disposeActiveHeader();
		activePiStartupHeader = new PiStartupHeader(pi, ctx, tui);
		return activePiStartupHeader;
	});
	ctx.ui.setFooter(undefined); // keep pi's original footer
	ctx.ui.setWorkingIndicator(undefined); // keep pi's original spinner
	ctx.ui.setEditorComponent(
		(tui, theme, keybindings) => new CodexStyleEditor(tui, theme, keybindings, cursorStyleOpen),
	);
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		const applyAfterOtherStartupHandlers = setTimeout(() => applyPiLook(pi, ctx), 0);
		applyAfterOtherStartupHandlers.unref?.();
	});

	pi.on("session_shutdown", () => {
		disposeActiveHeader();
	});

	// Named after the package (pi-claude-code-tui), not the host app.
	pi.registerCommand("use-claude-code-tui", {
		description: "Switch to the pi-claude-code-tui look (Pi header + Codex-style input)",
		handler: async (_args, ctx) => {
			applyPiLook(pi, ctx);
			ctx.ui.notify("Using pi-claude-code-tui", "info");
		},
	});

	pi.registerCommand("use-default-tui", {
		description: "Switch back to pi's built-in header, footer, editor, and spinner",
		handler: async (_args, ctx) => {
			disposeActiveHeader();
			ctx.ui.setTitle("pi");
			ctx.ui.setHeader(undefined);
			ctx.ui.setFooter(undefined);
			ctx.ui.setWorkingIndicator(undefined);
			ctx.ui.setEditorComponent(undefined);
			ctx.ui.notify("Using default pi TUI", "info");
		},
	});
}
