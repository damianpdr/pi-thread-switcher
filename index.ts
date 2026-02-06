/**
 * Thread Switcher — Amp-style session switcher for pi.
 *
 * `/threads` command and `ctrl+t` shortcut.
 * Split layout: large preview (last messages) on top, compact thread list below.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { DynamicBorder, parseSessionEntries } from "@mariozechner/pi-coding-agent";
import { SessionManager, type SessionInfo } from "@mariozechner/pi-coding-agent";
import { readFileSync } from "node:fs";
import {
  Container,
  matchesKey,
  Key,
  truncateToWidth,
  visibleWidth,
  fuzzyFilter,
  type Focusable,
  CURSOR_MARKER,
} from "@mariozechner/pi-tui";

// ── Helpers ──────────────────────────────────────────────────────────

function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)}mo`;
}

function sessionLabel(s: SessionInfo): string {
  if (s.name) return s.name;
  const first = s.firstMessage.trim();
  if (!first) return "(empty)";
  return first.replace(/\s+/g, " ");
}

function cwdShort(cwd: string): string {
  if (!cwd) return "";
  const home = process.env.HOME || "";
  let p = cwd;
  if (home && p.startsWith(home)) p = "~" + p.slice(home.length);
  const parts = p.split("/");
  if (parts.length > 3) return parts[0] + "/…/" + parts.slice(-1)[0];
  return p;
}

// ── Session Preview ──────────────────────────────────────────────────

interface PreviewLine {
  text: string;
  role: "user" | "assistant" | "tool" | "gap";
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((c: any) => c?.type === "text" && typeof c.text === "string")
    .map((c: any) => c.text)
    .join("\n");
}

function parsePreview(sessionPath: string): PreviewLine[] {
  try {
    const content = readFileSync(sessionPath, "utf-8");
    const entries = parseSessionEntries(content);
    const lines: PreviewLine[] = [];

    for (const entry of entries) {
      if ((entry as any).type !== "message") continue;
      const msg = (entry as any).message;
      if (!msg?.role) continue;

      if (msg.role === "user") {
        lines.push({ text: "", role: "gap" });
        const text = extractText(msg.content).trim();
        if (text) {
          for (const line of text.split("\n")) {
            lines.push({ text: line, role: "user" });
          }
        }
      } else if (msg.role === "assistant") {
        const text = extractText(msg.content).trim();
        if (text) {
          for (const line of text.split("\n")) {
            lines.push({ text: line, role: "assistant" });
          }
        }
        // Tool calls
        if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block?.type !== "toolCall" || !block.name) continue;
            const args = block.arguments || {};
            let toolLine: string;
            if (block.name === "bash" && args.command) {
              toolLine = `$ ${args.command}`;
            } else if ((block.name === "edit" || block.name === "write" || block.name === "read") && args.path) {
              toolLine = `${block.name} ${args.path}`;
            } else {
              toolLine = `${block.name}(…)`;
            }
            lines.push({ text: toolLine, role: "tool" });
          }
        }
      }
      // skip toolResult — too verbose
    }
    return lines;
  } catch {
    return [];
  }
}

const previewCache = new Map<string, PreviewLine[]>();

function getPreview(path: string): PreviewLine[] {
  let cached = previewCache.get(path);
  if (!cached) {
    cached = parsePreview(path);
    previewCache.set(path, cached);
  }
  return cached;
}

// ── Component ────────────────────────────────────────────────────────

interface ThreadItem {
  session: SessionInfo;
  isCurrent: boolean;
}

interface Opts {
  onSelect: (path: string) => void;
  onCancel: () => void;
  requestRender: () => void;
  theme: any;
  currentSessionFile?: string;
  termHeight: number;
}

class ThreadSwitcher extends Container implements Focusable {
  private items: ThreadItem[] = [];
  private filtered: ThreadItem[] = [];
  private selected = 0;
  private listScroll = 0;
  private searchText = "";
  private opts: Opts;
  private scope: "current" | "all" = "current";
  private currentSessions: SessionInfo[] = [];
  private allSessions: SessionInfo[] | null = null;
  private previewScroll = 0;

  _focused = false;
  get focused() { return this._focused; }
  set focused(v: boolean) { this._focused = v; }

  constructor(sessions: SessionInfo[], opts: Opts) {
    super();
    this.opts = opts;
    this.currentSessions = sessions;
    this.setSessions(sessions);
  }

  setAllSessions(sessions: SessionInfo[]) {
    this.allSessions = sessions;
    if (this.scope === "all") this.setSessions(sessions);
  }

  private setSessions(sessions: SessionInfo[]) {
    this.items = sessions.map((s) => ({
      session: s,
      isCurrent: s.path === this.opts.currentSessionFile,
    }));
    this.items.sort((a, b) => b.session.modified.getTime() - a.session.modified.getTime());
    this.applyFilter();
  }

  private applyFilter() {
    this.filtered = this.searchText
      ? fuzzyFilter(this.items, this.searchText, (i: ThreadItem) => sessionLabel(i.session))
      : this.items;
    this.selected = Math.min(this.selected, Math.max(0, this.filtered.length - 1));
    this.listScroll = 0;
    this.previewScroll = 0;
    this.invalidate();
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape)) { this.opts.onCancel(); return; }

    if (matchesKey(data, Key.enter)) {
      const sel = this.filtered[this.selected];
      if (sel && !sel.isCurrent) this.opts.onSelect(sel.session.path);
      return;
    }

    if (matchesKey(data, Key.up)) {
      if (this.selected > 0) { this.selected--; this.previewScroll = 0; this.ensureListVisible(); this.invalidate(); }
      return;
    }
    if (matchesKey(data, Key.down)) {
      if (this.selected < this.filtered.length - 1) { this.selected++; this.previewScroll = 0; this.ensureListVisible(); this.invalidate(); }
      return;
    }

    // Shift+Up/Down: scroll preview
    if (matchesKey(data, Key.shift("up"))) {
      if (this.previewScroll > 0) { this.previewScroll--; this.invalidate(); }
      return;
    }
    if (matchesKey(data, Key.shift("down"))) {
      this.previewScroll++;
      this.invalidate();
      return;
    }

    if (matchesKey(data, Key.tab)) {
      this.scope = this.scope === "current" ? "all" : "current";
      this.setSessions(this.scope === "all" && this.allSessions ? this.allSessions : this.currentSessions);
      this.invalidate();
      return;
    }

    if (matchesKey(data, Key.backspace)) {
      if (this.searchText.length > 0) { this.searchText = this.searchText.slice(0, -1); this.applyFilter(); }
      return;
    }

    if (data.length === 1 && data.charCodeAt(0) >= 32) {
      this.searchText += data;
      this.applyFilter();
      return;
    }
  }

  private ensureListVisible() {
    const max = this.listMaxVisible();
    if (this.selected < this.listScroll) this.listScroll = this.selected;
    else if (this.selected >= this.listScroll + max) this.listScroll = this.selected - max + 1;
  }

  private listMaxVisible(): number {
    // List section: title(1) + search(1) + blank(1) + help(1) + border(1) = 5 chrome lines
    // Give list ~30% of terminal, min 5 items
    const listBudget = Math.max(5, Math.floor(this.opts.termHeight * 0.3) - 5);
    return Math.min(this.filtered.length, listBudget);
  }

  // ── Render ─────────────────────────────────────────────────────────

  render(width: number): string[] {
    const t = this.opts.theme;
    const out: string[] = [];

    // Calculate layout: list chrome = 5 lines + visible items
    const listVisible = this.listMaxVisible();
    const listChrome = 5; // title + search + blank + help + border
    const listHeight = listVisible + listChrome + (this.listScroll > 0 ? 1 : 0) +
      (this.listScroll + listVisible < this.filtered.length ? 1 : 0);

    // Preview gets the rest
    const previewHeight = Math.max(6, this.opts.termHeight - listHeight - 2); // -2 for top border

    // ── Preview pane ──
    out.push(...this.renderPreview(width, previewHeight, t));

    // ── Separator ──
    const border = new DynamicBorder((s: string) => t.fg("border", s));
    out.push(...border.render(width));

    // ── Title ──
    const scopeTag = this.scope === "all" ? "All" : "Project";
    out.push(truncateToWidth(
      " " + t.fg("accent", t.bold("Select a thread")) + "  " + t.fg("dim", `(${scopeTag})`),
      width
    ));

    // ── Search ──
    const sPrefix = t.fg("dim", " > ");
    const sText = this.searchText ? t.fg("text", this.searchText) : t.fg("dim", "type to filter...");
    out.push(truncateToWidth(sPrefix + sText + (this._focused ? CURSOR_MARKER : ""), width));
    out.push("");

    // ── List ──
    if (this.filtered.length === 0) {
      out.push(truncateToWidth(t.fg("warning", "  No matching sessions"), width));
    } else {
      const start = this.listScroll;
      const end = Math.min(start + listVisible, this.filtered.length);

      if (start > 0) out.push(truncateToWidth(t.fg("dim", `  ↑ ${start} more`), width));

      for (let i = start; i < end; i++) {
        const item = this.filtered[i];
        const isSel = i === this.selected;
        const s = item.session;
        const label = sessionLabel(s);
        const time = relativeTime(s.modified);

        // Prefix
        const prefix = isSel ? t.fg("accent", " ❯ ") : item.isCurrent ? t.fg("dim", " • ") : "   ";

        // Right side
        const right = " " + t.fg("dim", time);
        const rightW = visibleWidth(right);
        const prefixW = visibleWidth(prefix);
        const nameSpace = width - prefixW - rightW - 1;

        let name: string;
        if (item.isCurrent) name = t.fg("muted", label);
        else if (isSel) name = t.fg("accent", t.bold(label));
        else name = t.fg("text", label);

        name = nameSpace > 10 ? truncateToWidth(name, nameSpace) : name;
        const pad = Math.max(1, nameSpace - visibleWidth(name));

        out.push(truncateToWidth(prefix + name + " ".repeat(pad) + right, width));

        if (this.scope === "all" && s.cwd) {
          out.push(truncateToWidth("     " + t.fg("dim", cwdShort(s.cwd)), width));
        }
      }

      if (end < this.filtered.length) {
        out.push(truncateToWidth(t.fg("dim", `  ↓ ${this.filtered.length - end} more`), width));
      }
    }

    // ── Help ──
    const h = [
      "↑↓ navigate",
      "shift+↑↓ scroll",
      "enter select",
      "esc cancel",
      `tab ${this.scope === "current" ? "all" : "project"}`,
    ].map((s) => t.fg("dim", s)).join(t.fg("dim", " · "));
    out.push(truncateToWidth(" " + h, width));

    // ── Bottom border ──
    out.push(...border.render(width));

    return out;
  }

  // ── Preview ────────────────────────────────────────────────────────

  private renderPreview(width: number, height: number, t: any): string[] {
    const sel = this.filtered[this.selected];
    if (!sel) return this.pad([ t.fg("dim", " No session selected") ], height);

    const preview = getPreview(sel.session.path);
    if (preview.length === 0) return this.pad([ t.fg("dim", " (empty session)") ], height);

    // Format all preview lines
    const formatted: string[] = [];
    for (const p of preview) {
      if (p.role === "gap") { formatted.push(""); continue; }

      const indent = p.role === "user" ? " " : "   ";
      let styled: string;
      if (p.role === "user") {
        styled = t.fg("accent", p.text);
      } else if (p.role === "tool") {
        styled = t.fg("warning", p.text);
      } else {
        styled = t.fg("muted", p.text);
      }
      formatted.push(truncateToWidth(indent + styled, width));
    }

    // Default: show LAST messages (bottom). Shift+Up scrolls upward.
    const total = formatted.length;
    const maxScrollBack = Math.max(0, total - height);

    // Clamp previewScroll
    if (this.previewScroll > maxScrollBack) this.previewScroll = maxScrollBack;

    // Slice from the end, shifted by scroll
    const startLine = Math.max(0, total - height - this.previewScroll);
    const endLine = startLine + height;
    const visible = formatted.slice(startLine, endLine);

    // Scroll indicator at top if there's content above
    if (startLine > 0 && visible.length > 0) {
      visible[0] = truncateToWidth(t.fg("dim", ` ↑ ${startLine} more lines`), width);
    }

    return this.pad(visible, height);
  }

  private pad(lines: string[], height: number): string[] {
    while (lines.length < height) lines.push("");
    return lines.slice(0, height);
  }

  invalidate(): void { super.invalidate(); }
}

// ── Extension ────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  async function showThreadSwitcher(ctx: ExtensionCommandContext) {
    if (!ctx.hasUI) return;

    const cwd = ctx.cwd;
    const currentFile = ctx.sessionManager.getSessionFile();

    let sessions: SessionInfo[];
    try {
      sessions = await SessionManager.list(cwd);
    } catch {
      ctx.ui.notify("Failed to load sessions", "error");
      return;
    }

    sessions.sort((a, b) => b.modified.getTime() - a.modified.getTime());

    if (sessions.length === 0) {
      ctx.ui.notify("No sessions found", "info");
      return;
    }

    previewCache.clear();

    const result = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
      const termHeight = tui.terminal?.rows ?? 40;

      const switcher = new ThreadSwitcher(sessions, {
        onSelect: (path: string) => done(path),
        onCancel: () => done(null),
        requestRender: () => tui.requestRender(),
        theme,
        currentSessionFile: currentFile,
        termHeight,
      });

      // Lazy-load all sessions
      SessionManager.listAll()
        .then((all: SessionInfo[]) => {
          all.sort((a: SessionInfo, b: SessionInfo) => b.modified.getTime() - a.modified.getTime());
          switcher.setAllSessions(all);
          tui.requestRender();
        })
        .catch(() => {});

      return {
        render: (w: number) => switcher.render(w),
        invalidate: () => switcher.invalidate(),
        handleInput: (data: string) => { switcher.handleInput(data); tui.requestRender(); },
      };
    });

    if (result) {
      const r = await ctx.switchSession(result);
      if (r.cancelled) ctx.ui.notify("Session switch cancelled", "info");
    }
  }

  pi.registerCommand("threads", {
    description: "Amp-style thread switcher with live preview",
    handler: async (_args, ctx) => { await showThreadSwitcher(ctx); },
  });


}
