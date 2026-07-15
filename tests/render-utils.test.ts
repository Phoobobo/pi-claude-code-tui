import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
	applyRoundedEditorBorders,
	CURSOR_MARKER,
	findBottomBorderIndex,
	formatCwd,
	headerColumnWidths,
	isEditorBorderLine,
	restyleEditorCursor,
	roundedBorderLine,
	stripAnsi,
} from "../extensions/render-utils.ts";

describe("formatCwd", () => {
	it("replaces HOME prefix with ~", () => {
		assert.equal(formatCwd("/Users/me/Workspace/mypi", "/Users/me"), "~/Workspace/mypi");
	});

	it("leaves paths outside home unchanged", () => {
		assert.equal(formatCwd("/tmp/project", "/Users/me"), "/tmp/project");
	});
});

describe("headerColumnWidths", () => {
	it("gives the logo half most of the width on wide terminals", () => {
		const layout = headerColumnWidths(100);
		assert.equal(layout.useTips, true);
		assert.ok(layout.leftWidth > layout.rightWidth);
		assert.ok(layout.rightWidth <= 28);
		assert.equal(layout.leftWidth + layout.rightWidth + 3, 100);
	});

	it("keeps a wide centered logo half on medium split-pane widths", () => {
		// ~76-col herdr pane → inner ~74
		const layout = headerColumnWidths(74);
		assert.equal(layout.useTips, true);
		assert.ok(layout.leftWidth > layout.rightWidth);
		assert.ok(layout.leftWidth >= 45, `left should be hero-width, got ${layout.leftWidth}`);
		assert.ok(layout.rightWidth <= 28);
	});

	it("uses full inner width when tips cannot fit", () => {
		const layout = headerColumnWidths(40);
		assert.equal(layout.useTips, false);
		assert.equal(layout.leftWidth, 40);
		assert.equal(layout.rightWidth, 0);
	});

	it("enables tips when logo + sidebar minimums fit", () => {
		// min left 28 + gap 3 + min tips 16 = 47
		const layout = headerColumnWidths(47);
		assert.equal(layout.useTips, true);
		assert.ok(layout.leftWidth >= 28);
		assert.ok(layout.rightWidth >= 16);
	});
});

describe("editor border detection", () => {
	it("recognizes plain and scroll indicator borders", () => {
		assert.equal(isEditorBorderLine("─".repeat(40)), true);
		assert.equal(isEditorBorderLine("\x1b[38;2;1;2;3m" + "─".repeat(40) + "\x1b[39m"), true);
		assert.equal(isEditorBorderLine("─── ↑ 2 more ──────────"), true);
		assert.equal(isEditorBorderLine("─── ↓ 5 more ──────────"), true);
	});

	it("rejects content and autocomplete-style rows", () => {
		assert.equal(isEditorBorderLine(" hello world"), false);
		assert.equal(isEditorBorderLine(" \x1b[7mselected item\x1b[0m"), false);
		assert.equal(isEditorBorderLine(""), false);
	});

	it("finds the bottom border before autocomplete rows", () => {
		const lines = [
			"─".repeat(20),
			" content line",
			"─── ↓ 1 more ───────",
			" /model",
			" /compact",
		];
		assert.equal(findBottomBorderIndex(lines), 2);
	});

	it("falls back to the last line when no border is found", () => {
		assert.equal(findBottomBorderIndex(["only", "content"]), 1);
	});
});

describe("roundedBorderLine", () => {
	it("wraps plain borders with rounded corners at the requested width", () => {
		const width = 20;
		const top = roundedBorderLine("─".repeat(width), width, "top", (s) => s);
		const bottom = roundedBorderLine("─".repeat(width), width, "bottom", (s) => s);
		assert.equal(visibleWidth(top), width);
		assert.equal(visibleWidth(bottom), width);
		assert.equal(stripAnsi(top).startsWith("╭"), true);
		assert.equal(stripAnsi(top).endsWith("╮"), true);
		assert.equal(stripAnsi(bottom).startsWith("╰"), true);
		assert.equal(stripAnsi(bottom).endsWith("╯"), true);
	});

	it("preserves scroll indicators inside rounded borders", () => {
		const width = 30;
		const line = roundedBorderLine("─── ↓ 3 more ──────────────", width, "bottom", (s) => s);
		assert.match(stripAnsi(line), /↓ 3 more/);
		assert.equal(visibleWidth(line), width);
	});
});

describe("applyRoundedEditorBorders", () => {
	it("does not turn the last autocomplete row into a bottom border", () => {
		const width = 24;
		const lines = [
			"─".repeat(width),
			" typed text",
			"─".repeat(width),
			" /use-claude-code-tui",
			" /use-default-tui",
		];
		const result = applyRoundedEditorBorders(lines, width, (s) => s);
		assert.equal(stripAnsi(result[0]!).startsWith("╭"), true);
		assert.equal(stripAnsi(result[2]!).startsWith("╰"), true);
		assert.equal(stripAnsi(result[3]!), " /use-claude-code-tui".padEnd(width));
		assert.equal(stripAnsi(result[4]!), " /use-default-tui".padEnd(width));
	});
});

describe("restyleEditorCursor", () => {
	const open = "\x1b[48;2;215;119;87m\x1b[38;2;24;24;30m";

	it("restyles reverse-video cursor after the focus marker", () => {
		const line = `hello${CURSOR_MARKER}\x1b[7m \x1b[0mworld`;
		const out = restyleEditorCursor(line, open);
		assert.equal(out.includes(CURSOR_MARKER), true);
		assert.equal(out.includes("\x1b[7m"), false);
		assert.equal(out.includes(`${open} \x1b[0m`), true);
	});

	it("restyles unfocused reverse-video cursor", () => {
		const line = `ab\x1b[7mc\x1b[0mde`;
		const out = restyleEditorCursor(line, open);
		assert.equal(out, `ab${open}c\x1b[0mde`);
	});

	it("does not restyle reverse video that appears before the cursor marker", () => {
		const line = `\x1b[7mselected\x1b[0m${CURSOR_MARKER}plain`;
		const out = restyleEditorCursor(line, open);
		assert.equal(out, line);
		assert.equal(out.includes("\x1b[7mselected\x1b[0m"), true);
	});
});
