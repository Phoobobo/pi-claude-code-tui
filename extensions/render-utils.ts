import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export const BRAND_RGB = "215;119;87";
export const brand = (text: string) => `\x1b[38;2;${BRAND_RGB}m${text}\x1b[39m`;
export const cursorStyleOpen = () => `\x1b[48;2;${BRAND_RGB}m\x1b[38;2;24;24;30m`;
/**
 * Logo half is the hero (Claude Code style): it takes most of the width and
 * grows on wide terminals so the mark stays centered in a large left area.
 * Tips are a narrow right sidebar that truncates with an ellipsis.
 */
/** Narrowest left column that still fits the animated logo (8×3 cells). */
export const MIN_LEFT_WIDTH = 28;
/** Narrowest tips sidebar; below this, tips are hidden. */
export const MIN_TIPS_WIDTH = 16;
/** Cap tips so they never steal the logo half on wide terminals. */
export const MAX_TIPS_WIDTH = 28;
const COLUMN_GAP = 3; // ` ${divider} `
/** Zero-width APC marker emitted by pi-tui before the fake cursor when focused. */
export const CURSOR_MARKER = "\x1b_pi:c\x07";

/** Strip CSI SGR and APC sequences so border detection can inspect plain text. */
export function stripAnsi(text: string): string {
	return text.replace(/\x1b\[[0-9;]*m/g, "").replace(/\x1b_[^\x07]*\x07/g, "");
}

export function formatCwd(cwd: string, home = process.env.HOME): string {
	return home && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
}

export function center(text: string, width: number): string {
	if (width <= 0) return "";
	const w = visibleWidth(text);
	if (w >= width) return truncateToWidth(text, width, "…");
	return `${" ".repeat(Math.floor((width - w) / 2))}${text}`;
}

export function padRight(text: string, width: number, ellipsis = ""): string {
	const clipped = truncateToWidth(text, width, ellipsis);
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

/**
 * Layout widths for the startup header body (Claude Code proportions).
 *
 * - Tips sidebar ≈ 28% of width, clamped to [MIN_TIPS_WIDTH, MAX_TIPS_WIDTH].
 * - Left (logo) gets the rest and stays the wider half.
 * - Narrow: hide tips and give the left column the full inner width.
 */
export function headerColumnWidths(
	innerWidth: number,
	minTipsWidth = MIN_TIPS_WIDTH,
	maxTipsWidth = MAX_TIPS_WIDTH,
	minLeftWidth = MIN_LEFT_WIDTH,
): { leftWidth: number; rightWidth: number; useTips: boolean } {
	if (innerWidth <= 0) {
		return { leftWidth: 0, rightWidth: 0, useTips: false };
	}

	const gap = COLUMN_GAP;
	if (innerWidth < minLeftWidth + gap + minTipsWidth) {
		return { leftWidth: innerWidth, rightWidth: 0, useTips: false };
	}

	// Narrow tips sidebar; logo half absorbs the remaining width.
	let rightWidth = Math.min(maxTipsWidth, Math.max(minTipsWidth, Math.round(innerWidth * 0.28)));
	let leftWidth = innerWidth - gap - rightWidth;

	if (leftWidth < minLeftWidth) {
		leftWidth = minLeftWidth;
		rightWidth = innerWidth - gap - leftWidth;
	}

	// Keep logo half strictly wider than tips (Claude Code feel).
	if (leftWidth <= rightWidth) {
		leftWidth = Math.ceil((innerWidth - gap) * 0.65);
		rightWidth = innerWidth - gap - leftWidth;
	}

	if (rightWidth < minTipsWidth || leftWidth < minLeftWidth) {
		return { leftWidth: innerWidth, rightWidth: 0, useTips: false };
	}

	return { leftWidth, rightWidth, useTips: true };
}

/**
 * True for the editor's horizontal rule rows (plain ─ fill or scroll indicators).
 * Content and autocomplete rows start with padding spaces and do not match.
 */
export function isEditorBorderLine(line: string): boolean {
	const plain = stripAnsi(line);
	if (/^─+$/.test(plain)) return true;
	if (/^─*\s*[↑↓]\s+\d+\s+more\s*─*$/.test(plain)) return true;
	return false;
}

/** Index of the bottom border in Editor.render output (before autocomplete rows). */
export function findBottomBorderIndex(lines: string[]): number {
	for (let i = lines.length - 1; i >= 1; i--) {
		if (isEditorBorderLine(lines[i]!)) return i;
	}
	return Math.max(0, lines.length - 1);
}

export function roundedBorderLine(
	sourceLine: string,
	width: number,
	kind: "top" | "bottom",
	color: (text: string) => string = brand,
): string {
	if (width < 2) return color(truncateToWidth(kind === "top" ? "╭╮" : "╰╯", width, ""));

	const corners = kind === "top" ? (["╭", "╮"] as const) : (["╰", "╯"] as const);
	const plain = stripAnsi(sourceLine);
	const scrollMatch = plain.match(/([↑↓]\s+\d+\s+more)/);

	if (scrollMatch) {
		const label = `─── ${scrollMatch[1]} `;
		const fill = Math.max(0, width - 2 - visibleWidth(label));
		return color(`${corners[0]}${label}${"─".repeat(fill)}${corners[1]}`);
	}

	return color(`${corners[0]}${"─".repeat(Math.max(0, width - 2))}${corners[1]}`);
}

/**
 * Restyle only the editor fake cursor (reverse-video span), not other reverse video.
 * Prefer the focused form with CURSOR_MARKER; fall back to the first short reverse span.
 */
export function restyleEditorCursor(line: string, openStyle: string): string {
	const markerIdx = line.indexOf(CURSOR_MARKER);
	if (markerIdx !== -1) {
		// Focused editor: only restyle the reverse-video span immediately after the marker.
		const afterMarker = markerIdx + CURSOR_MARKER.length;
		const tail = line.slice(afterMarker);
		const replacedTail = tail.replace(/\x1b\[7m([^\x1b]*)\x1b\[0m/, `${openStyle}$1\x1b[0m`);
		return line.slice(0, afterMarker) + replacedTail;
	}

	// Unfocused: restyle only the first reverse-video span with no nested escapes
	// (cursor is a single grapheme or space).
	return line.replace(/\x1b\[7m([^\x1b]*)\x1b\[0m/, `${openStyle}$1\x1b[0m`);
}

/**
 * Apply Codex-style rounded borders to Editor.render output without touching
 * autocomplete rows that may follow the bottom border.
 */
export function applyRoundedEditorBorders(
	lines: string[],
	width: number,
	color: (text: string) => string = brand,
): string[] {
	if (lines.length === 0 || width < 4) return lines;

	const result = lines.slice();
	result[0] = roundedBorderLine(result[0]!, width, "top", color);

	const bottomIdx = findBottomBorderIndex(result);
	result[bottomIdx] = roundedBorderLine(result[bottomIdx]!, width, "bottom", color);

	return result.map((line) => padRight(truncateToWidth(line, width, ""), width));
}
