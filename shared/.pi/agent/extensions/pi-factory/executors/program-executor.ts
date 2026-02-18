import { pathToFileURL } from "node:url";
import { highlightCode, type ExtensionContext } from "@mariozechner/pi-coding-agent";
import { matchesKey, truncateToWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";
import { FactoryError, toErrorDetails } from "../errors.js";
import type { ObservabilityStore } from "../observability.js";
import { createFactory, patchConsole, patchPromiseAll, prepareProgramModule, preflightTypecheck } from "../runtime.js";
import type { ExecutionResult, RunSummary } from "../types.js";

// ── Confirmation UI ────────────────────────────────────────────────────

export async function confirmExecution(ctx: ExtensionContext, code: string): Promise<{ approved: boolean; reason?: string }> {
	if (!ctx.hasUI) return { approved: true };

	const lines = highlightCode(code, "typescript");
	const displayLines = lines.length > 0 ? lines : code.split("\n");

	const result = await ctx.ui.custom<{ approved: boolean; reason?: string }>(
		(tui, theme, _keybindings, done) => {
			let offset = 0;
			let collectingReason = false;
			let reason = "";

			const codeRows = () => Math.max(8, Math.min(42, tui.terminal.rows - 14));
			const clamp = () => {
				offset = Math.max(0, Math.min(offset, Math.max(0, displayLines.length - codeRows())));
			};
			const boxLine = (text: string, w: number) => `│ ${truncateToWidth(text, w, "…", true)} │`;

			return {
				render(width: number) {
					clamp();
					const totalW = Math.max(40, width);
					const contentW = Math.max(20, totalW - 4);
					const rows = codeRows();
					const end = Math.min(displayLines.length, offset + rows);
					const out: string[] = [];

					out.push(`┌${"─".repeat(totalW - 2)}┐`);
					for (const l of wrapTextWithAnsi(theme.bold("Run subagent program?"), contentW)) out.push(boxLine(l, contentW));
					for (const l of wrapTextWithAnsi(
						theme.fg("muted", `Lines ${offset + 1}-${end} / ${displayLines.length}`),
						contentW,
					))
						out.push(boxLine(l, contentW));
					out.push(boxLine(theme.fg("dim", ""), contentW));

					for (let i = offset; i < end; i++) {
						out.push(boxLine(`${theme.fg("dim", String(i + 1).padStart(4, " "))} ${displayLines[i]}`, contentW));
					}

					out.push(boxLine(theme.fg("dim", ""), contentW));
					if (collectingReason) {
						for (const l of wrapTextWithAnsi(theme.fg("warning", "Reject reason (optional):"), contentW))
							out.push(boxLine(l, contentW));
						for (const l of wrapTextWithAnsi(`${theme.fg("accent", "> ")}${reason || theme.fg("dim", "(empty)")}`, contentW))
							out.push(boxLine(l, contentW));
						for (const l of wrapTextWithAnsi(theme.fg("muted", "Enter reject • Backspace edit • Esc back"), contentW))
							out.push(boxLine(l, contentW));
					} else {
						for (const l of wrapTextWithAnsi(
							theme.fg("muted", "↑/↓ scroll • Enter/Y confirm • N reject • Esc cancel"),
							contentW,
						))
							out.push(boxLine(l, contentW));
					}
					out.push(`└${"─".repeat(totalW - 2)}┘`);
					return out;
				},
				invalidate() {},
				handleInput(data: string) {
					if (collectingReason) {
						if (matchesKey(data, "return")) { done({ approved: false, reason: reason.trim() || undefined }); return; }
						if (matchesKey(data, "escape")) { collectingReason = false; tui.requestRender(); return; }
						if (matchesKey(data, "ctrl+c")) { done({ approved: false }); return; }
						if (matchesKey(data, "backspace") || data === "\x7f") { reason = reason.slice(0, -1); tui.requestRender(); return; }
						if (data.length === 1 && data >= " " && data !== "\x7f") { reason += data; tui.requestRender(); }
						return;
					}
					if (matchesKey(data, "return") || data === "y" || data === "Y") { done({ approved: true }); return; }
					if (data === "n" || data === "N") { collectingReason = true; tui.requestRender(); return; }
					if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) { done({ approved: false }); return; }
					if (matchesKey(data, "up") || data === "k") { offset -= 1; tui.requestRender(); return; }
					if (matchesKey(data, "down") || data === "j") { offset += 1; tui.requestRender(); return; }
					if (matchesKey(data, "pageUp")) { offset -= codeRows(); tui.requestRender(); return; }
					if (matchesKey(data, "pageDown")) { offset += codeRows(); tui.requestRender(); }
				},
			};
		},
		{ overlay: true, overlayOptions: { anchor: "center", width: "92%", maxHeight: "90%", margin: 1 } },
	);

	return result ?? { approved: false };
}

// ── Program execution ──────────────────────────────────────────────────

export async function executeProgram(input: {
	ctx: ExtensionContext;
	runId: string;
	code: string;
	task: string;
	cwd: string;
	obs: ObservabilityStore;
	onUpdate?: (summary: RunSummary) => void;
	signal?: AbortSignal;
	parentSessionPath?: string;
	sessionDir?: string;
	skipConfirmation?: boolean;
}): Promise<RunSummary> {
	const { ctx, runId, code, obs } = input;
	const resultsByTask = new Map<string, ExecutionResult>();
	const results: ExecutionResult[] = [];

	const sync = () => {
		results.splice(0, results.length, ...resultsByTask.values());
	};
	const emit = (status: RunSummary["status"], error?: RunSummary["error"]) => {
		sync();
		input.onUpdate?.({ runId, status, results: [...results], observability: obs.toSummary(runId), error });
	};

	let runtime: ReturnType<typeof createFactory> | null = null;
	try {
		// Write program source as early as possible so failed preflight/confirmation runs
		// still keep a legible copy of the attempted program.
		obs.writeArtifact(runId, "program.ts", code);

		// Preflight typecheck — catch type errors before showing confirmation dialog
		const typeErrors = await preflightTypecheck(code);
		if (typeErrors) {
			throw new FactoryError({
				code: "INVALID_INPUT",
				message: `Type errors in program code:\n${typeErrors}`,
				recoverable: true,
			});
		}

		if (!input.skipConfirmation) {
			const confirmation = await confirmExecution(ctx, code);
			if (!confirmation.approved) {
				throw new FactoryError({
					code: "CONFIRMATION_REJECTED",
					message: confirmation.reason ? `Cancelled: ${confirmation.reason}` : "Cancelled by user.",
					recoverable: true,
				});
			}
		}

		emit("running");
		obs.push(runId, "info", "program:start", { codeBytes: code.length });

		runtime = createFactory(ctx, runId, obs, {
			defaultSignal: input.signal,
			onTaskUpdate: (result) => {
				resultsByTask.set(result.taskId, result);
				emit("running");
			},
			parentSessionPath: input.parentSessionPath,
			sessionDir: input.sessionDir,
		});

		const { modulePath } = prepareProgramModule(code);
		const restorePromise = patchPromiseAll(obs, runId);
		const restoreConsole = patchConsole(obs, runId);

		// Inject the factory global
		const prev = (globalThis as any).factory;
		(globalThis as any).factory = runtime;

		let importPromise: Promise<unknown>;
		try {
			importPromise = import(pathToFileURL(modulePath).toString());
			// Prevent unhandled rejection if importPromise rejects before being awaited
			importPromise.catch(() => {});
		} catch (e) {
			// Restore immediately on synchronous throw
			if (prev === undefined) delete (globalThis as any).factory;
			else (globalThis as any).factory = prev;
			restorePromise();
			restoreConsole();
			throw e;
		}

		if (input.signal) {
			if (input.signal.aborted) {
				if (prev === undefined) delete (globalThis as any).factory;
				else (globalThis as any).factory = prev;
				restorePromise();
				restoreConsole();
				throw new FactoryError({ code: "CANCELLED", message: "Cancelled before execution.", recoverable: true });
			}
			let onAbort: (() => void) | undefined;
			const cancelled = new Promise<never>((_resolve, reject) => {
				onAbort = () => reject(new FactoryError({ code: "CANCELLED", message: "Cancelled.", recoverable: true }));
				input.signal?.addEventListener("abort", onAbort, { once: true });
			});
			try {
				await Promise.race([importPromise, cancelled]);
			} finally {
				if (onAbort) input.signal?.removeEventListener("abort", onAbort);
				if (prev === undefined) delete (globalThis as any).factory;
				else (globalThis as any).factory = prev;
				restorePromise();
				restoreConsole();
			}
		} else {
			try {
				await importPromise;
			} finally {
				if (prev === undefined) delete (globalThis as any).factory;
				else (globalThis as any).factory = prev;
				restorePromise();
				restoreConsole();
			}
		}

		emit("done");
		return { runId, status: "done", results, observability: obs.toSummary(runId), metadata: { modulePath } };
	} catch (error) {
		const details = toErrorDetails(error);
		obs.push(runId, "error", details.message, { code: details.code });
		const status = details.code === "CANCELLED" || details.code === "CONFIRMATION_REJECTED" ? "cancelled" : "failed";
		emit(status, details);
		return { runId, status, results, observability: obs.toSummary(runId), error: details };
	} finally {
		if (runtime) {
			try { await runtime.shutdown(true); } catch (e) { obs.push(runId, "warning", "shutdown_failed", { error: String(e) }); }
		}
	}
}
