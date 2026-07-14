import {
	CustomEditor,
	VERSION,
	type ExtensionAPI,
	type ExtensionContext,
	type KeybindingsManager,
} from "@earendil-works/pi-coding-agent";
import type { Component, EditorTheme, TUI } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const BRAND_RGB = "215;119;87";
const brand = (text: string) => `\x1b[38;2;${BRAND_RGB}m${text}\x1b[39m`;
const cursorStyle = () => `\x1b[48;2;${BRAND_RGB}m\x1b[38;2;24;24;30m`;
const LEFT_PANEL_WIDTH = 42;
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
			return "\x1b[36m██\x1b[39m";
		case "red":
			return "\x1b[31m██\x1b[39m";
		case "green":
			return "\x1b[32m██\x1b[39m";
		case "orange":
		case "flash":
			return "\x1b[33m██\x1b[39m";
		case "white":
			return "\x1b[39m██";
		case "brand":
			return brand("██");
		default:
			return "  ";
	}
};

function formatCwd(cwd: string): string {
	const home = process.env.HOME;
	return home && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
}

function center(text: string, width: number): string {
	if (width <= 0) return "";
	const w = visibleWidth(text);
	if (w >= width) return truncateToWidth(text, width, "");
	return `${" ".repeat(Math.floor((width - w) / 2))}${text}`;
}

function padRight(text: string, width: number): string {
	const clipped = truncateToWidth(text, width, "");
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

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
	const frame = LOGO_FRAMES[frameIndex % LOGO_FRAMES.length];
	const lines: string[] = [];
	// Crop the installer's 9-row animation canvas slightly so the startup
	// header stays compact while preserving the final mark.
	for (let y = 1; y <= 7; y++) {
		let line = "";
		for (let x = 1; x <= 8; x++) line += colorCell(logoCellColor(frame, y, x));
		lines.push(line);
	}
	return lines;
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
	return `${padRight(left, leftWidth)} ${brand("│")} ${padRight(right, rightWidth)}`;
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
		const leftWidth = Math.min(LEFT_PANEL_WIDTH, innerWidth);
		const rightWidth = Math.max(0, innerWidth - leftWidth - 3);
		const useTips = rightWidth >= 24;
		const model = this.ctx.model?.id ?? "Default model";
		const effort = this.pi.getThinkingLevel();
		const cwd = formatCwd(this.ctx.cwd);

		const leftLines = [
			...piLogoFrame(this.frame).map((line) => center(line, leftWidth)),
			center(bold("Let's build something great"), leftWidth),
			center(muted(`${model} with ${effort} effort`), leftWidth),
			center(dim(cwd), leftWidth),
		];

		const tipLines = [
			"",
			brand(bold("This is your own agent harness")),
			muted("Ask Pi to build it"),
			brand("──────────────────────"),
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
		private readonly cursorStyle: () => string,
	) {
		super(tui, theme, keybindings, { paddingX: 1 });
	}

	render(width: number): string[] {
		const cursor = this.cursorStyle();
		const lines = super.render(width).map((line) => line.replaceAll("\x1b[7m", cursor));
		if (lines.length === 0 || width < 4) return lines;

		const border = (s: string) => brand(s);
		lines[0] = border(`╭${"─".repeat(Math.max(0, width - 2))}╮`);
		lines[lines.length - 1] = border(`╰${"─".repeat(Math.max(0, width - 2))}╯`);
		return lines.map((line) => padRight(truncateToWidth(line, width, ""), width));
	}
}

let activePiStartupHeader: PiStartupHeader | undefined;

function applyPiLook(pi: ExtensionAPI, ctx: ExtensionContext): void {
	if (ctx.mode !== "tui") return;

	ctx.ui.setTitle("Pi");
	ctx.ui.setHeader((tui) => {
		activePiStartupHeader?.dispose();
		activePiStartupHeader = new PiStartupHeader(pi, ctx, tui);
		return activePiStartupHeader;
	});
	ctx.ui.setFooter(undefined); // keep pi's original footer
	ctx.ui.setWorkingIndicator(undefined); // keep pi's original spinner
	ctx.ui.setEditorComponent(
		(tui, theme, keybindings) => new CodexStyleEditor(tui, theme, keybindings, cursorStyle),
	);
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		applyPiLook(pi, ctx);
	});

	pi.registerCommand("pi-startup-look", {
		description: "Apply the Pi startup header with a Codex-style input box",
		handler: async (_args, ctx) => {
			applyPiLook(pi, ctx);
			ctx.ui.notify("Pi startup look applied", "info");
		},
	});

	pi.registerCommand("pi-look", {
		description: "Restore pi's built-in TUI header, footer, editor, and spinner",
		handler: async (_args, ctx) => {
			activePiStartupHeader?.dispose();
			activePiStartupHeader = undefined;
			ctx.ui.setTitle("pi");
			ctx.ui.setHeader(undefined);
			ctx.ui.setFooter(undefined);
			ctx.ui.setWorkingIndicator(undefined);
			ctx.ui.setEditorComponent(undefined);
			ctx.ui.notify("Built-in pi look restored", "info");
		},
	});
}
