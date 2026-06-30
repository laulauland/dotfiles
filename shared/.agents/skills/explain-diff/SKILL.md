---
name: explain-diff
description: Use when the user asks for a rich explanation of a code change, diff, branch, or PR. Produces an interactive HTML page, a Notion page, or an interactive Obsidian vault note.
---

# Explain Diff

Make a rich, interactive explanation of the specified code change. Explore the surrounding code broadly first — the explanation is only as good as your grasp of the system the change touches.

## Sections

Write these four sections, in order, as one continuous page:

- **Background** — The existing system this change touches. The reader's starting knowledge is unknown, so write a deep background for beginners (mark it skippable for those already familiar), then a narrower background aimed directly at the change.
- **Intuition** — The core intuition for the change. Convey the essence, not the full details. Ground it in concrete examples with toy data, and lean on figures and diagrams.
- **Code** — A high-level walkthrough of the changes, grouped and ordered so they build on each other.
- **Quiz** — Five questions that test whether the reader understood the substance of the PR. Medium difficulty: hard enough to require real understanding, but not gotchas. Multiple choice, each answer carrying feedback on why it is right or wrong.

## Writing

Write with the clarity and flow of Martin Kleppmann — engaging, in classic style, with smooth transitions between sections.

## Diagrams

Pick a small number of diagram families and reuse them throughout to explain different cases. Two that carry most explanations:

- A simplified version of the app's UI, to explain UI changes.
- A system diagram showing data flow or communication between components — always with example data in it.

Use callouts for key concepts, definitions, and important edge cases.

## Output

Determine the target: **HTML by default**, **Notion** when the user asks for it, or the **Obsidian vault** when the user asks for it. Then follow that branch.

### HTML

Output a single self-contained HTML file with inline CSS and JavaScript — one long page with section headers and a table of contents (no tabs for the top-level structure). Basic responsive styling so it reads on a phone.

Render the quiz as interactive multiple-choice: clicking an answer tells the reader whether they were correct and gives feedback.

Never use ASCII diagrams — build diagrams as simple HTML, and lists as HTML lists.

For code blocks, always use `<pre>` tags. A custom styled div instead **must** carry `white-space: pre-wrap` in its CSS, or the browser collapses every newline into one line. Before saving, scan each code block and confirm its CSS includes `white-space: pre` or `pre-wrap`.

Save the file outside the code repo, with a filename starting with today's date in `YYYY-MM-DD-` format so the files stay time-sorted and out of version control — for example `/tmp/2026-01-12-explanation-<slug>.html`.

### Notion

Use the Notion MCP tools to create a new page, and return its URL.

Render the quiz with toggle blocks — one toggle per answer option, revealing that choice's ✅/❌ explanation:

```markdown
1. Question
   ▶ Option 1
    ❌ Explanation for why it was incorrect
   ▶ Option 2
    ✅ Explanation for why it was correct
```

### Obsidian vault

Write the explanation as one Markdown note in the vault at `~/code/work/notes/explorations/YYYY-MM-DD-<slug>.md`, and return that path. It must live entirely inside Obsidian — no browser, no external site.

Prose sections are ordinary Markdown. Use Obsidian callouts (`> [!note]`, `> [!tip]`, `> [!warning]`) for key concepts, definitions, and edge cases, and fenced code blocks for code. For flow and system diagrams use native ` ```mermaid ` blocks — Obsidian renders them inline.

All interactivity and custom visuals go in `freeform` blocks (the obsidian-freeform plugin, which must be installed). A `freeform` block is plain JavaScript that is **not** reactive: call `display(node)` to show a DOM node or value, and wire behavior with ordinary event listeners — never Observable-style reactivity. `import` ESM from a CDN (esm.sh / jsdelivr / esm.run) only when you need a library — pull in Observable Plot to chart real data; hand-build DOM/SVG otherwise. `require()` and JSX are unsupported.

Render the quiz as a `freeform` block: each question shows clickable option buttons whose handler reveals ✅/❌ and the explanation.

```freeform
const quiz = [{ q: "…", options: [
  { t: "First option", ok: false, why: "Why it's wrong." },
  { t: "Second option", ok: true, why: "Why it's right." },
]}];
const root = document.createElement("div");
quiz.forEach((item, i) => {
  root.insertAdjacentHTML("beforeend", `<p><b>${i + 1}. ${item.q}</b></p>`);
  for (const opt of item.options) {
    const btn = Object.assign(document.createElement("button"), { textContent: opt.t });
    btn.style.cssText = "display:block;margin:.25em 0";
    btn.onclick = () => btn.after(Object.assign(document.createElement("div"),
      { textContent: `${opt.ok ? "✅" : "❌"} ${opt.why}` }));
    root.append(btn);
  }
});
display(root);
```

End the note with a `## Feedback` heading and an empty line beneath it — the channel where you write notes back for the agent.
