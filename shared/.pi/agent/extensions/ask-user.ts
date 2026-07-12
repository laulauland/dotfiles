import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import {
	Editor,
	type EditorTheme,
	Key,
	Markdown,
	matchesKey,
	Text,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { Type } from "typebox";

type AskOption = {
	label: string;
	description?: string;
	preview?: string;
};

type AskDecision = {
	version: 1;
	question: string;
	context?: string;
	kind?: AskAnswer["kind"];
	answer: string | null;
	selected?: string[];
	notes?: string;
	options: string[];
	createdAt: string;
};

type AskQuestion = {
	id: string;
	question: string;
	context?: string;
	header?: string;
	options: AskOption[];
	allowFreeform: boolean;
	multiSelect: boolean;
};

type AskAnswerBase = {
	id: string;
	question: string;
	context?: string;
	cancelled: false;
};

type AskAnswer =
	| (AskAnswerBase & {
			kind: "option";
			answer: string;
			selectedOption: string;
			extraInput?: string;
			notes?: string;
		})
	| (AskAnswerBase & {
			kind: "custom";
			answer: string;
			notes?: string;
		})
	| (AskAnswerBase & {
			kind: "multi";
			answer: null;
			selected: string[];
			notes?: string;
		})
	| {
			id: string;
			question: string;
			context?: string;
			kind: "cancelled";
			answer: null;
			cancelled: true;
		};

type AskUserResult = {
	questions: AskQuestion[];
	answers: AskAnswer[];
	cancelled: boolean;
};

type RawQuestion = {
	id?: string;
	question?: string;
	context?: string;
	header?: string;
	options?: unknown;
	allowFreeform?: boolean;
	multiSelect?: boolean;
};

type AskUserParams = RawQuestion & {
	questions?: RawQuestion[];
	timeout?: number;
};

type SessionEntry = {
	type: string;
	customType?: string;
	data?: unknown;
	message?: {
		role?: string;
		toolName?: string;
		details?: unknown;
		content?: unknown;
	};
};

type QuestionnaireRow =
	| { kind: "option"; option: AskOption }
	| { kind: "other"; label: string }
	| { kind: "next"; label: string };

type InputMode = "answer" | "notes";

const CUSTOM_TYPE = "ask-user-decision";
const MAX_SUMMARY_DECISIONS = 12;
const OTHER_OPTION = "Other…";
const NEXT_OPTION = "Next →";
const MAX_PREVIEW_CHARS = 600;
const MAX_PREVIEW_LINES = 12;

const OptionSchema = Type.Object({
	label: Type.String({ description: "A concise answer choice." }),
	description: Type.Optional(Type.String({ description: "What this choice means or its trade-offs." })),
	preview: Type.Optional(Type.String({ description: "Optional Markdown/code preview for this choice." })),
});

const QuestionSchema = Type.Object({
	id: Type.Optional(Type.String({ description: "Stable answer identifier." })),
	question: Type.String({ description: "One focused question to ask the user." }),
	context: Type.Optional(Type.String({ description: "Brief context needed to answer the question." })),
	header: Type.Optional(Type.String({ description: "Short label shown above the question." })),
	options: Type.Optional(Type.Array(OptionSchema, { description: "Optional answer choices." })),
	allowFreeform: Type.Optional(Type.Boolean({ description: "Allow a typed answer. Defaults to true." })),
	multiSelect: Type.Optional(Type.Boolean({ description: "Allow selecting multiple choices." })),
});

const normalizeOption = (raw: unknown): AskOption | undefined => {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;

	// SAFETY: the object check above establishes that property reads are safe; each
	// field is independently narrowed before it enters the normalized option.
	const candidate = raw as Record<string, unknown>;
	if (typeof candidate.label !== "string") return undefined;
	const label = candidate.label.trim();
	if (!label) return undefined;
	const description = typeof candidate.description === "string" ? candidate.description.trim() : undefined;
	const preview = typeof candidate.preview === "string" ? candidate.preview.trim() : undefined;
	return {
		label,
		...(description ? { description } : {}),
		...(preview ? { preview } : {}),
	};
};

const normalizeOptions = (options: unknown): AskOption[] => {
	if (!Array.isArray(options)) return [];
	return options.map(normalizeOption).filter((option): option is AskOption => option !== undefined);
};

const optionLabels = (options: unknown): string[] => {
	if (!Array.isArray(options)) return [];
	return options.filter((option): option is string => typeof option === "string");
};

const normalizeQuestion = (raw: RawQuestion, index: number): AskQuestion | undefined => {
	const question = raw.question?.trim();
	if (!question) return undefined;
	const context = raw.context?.trim() || undefined;
	const header = raw.header?.trim() || undefined;
	return {
		id: raw.id?.trim() || `question_${index + 1}`,
		question,
		context,
		header,
		options: normalizeOptions(raw.options),
		allowFreeform: raw.allowFreeform !== false,
		multiSelect: raw.multiSelect === true,
	};
};

const normalizeQuestions = (params: AskUserParams): AskQuestion[] => {
	const rawQuestions = Array.isArray(params.questions) && params.questions.length > 0 ? params.questions : [params];
	return rawQuestions.map(normalizeQuestion).filter((question): question is AskQuestion => question !== undefined);
};

const formatPrompt = (question: AskQuestion): string => {
	const parts = [question.header ? `[${question.header}]` : "", question.context?.trim() ?? "", question.question.trim()];
	return parts.filter(Boolean).join("\n\n");
};

const formatOptionForSelect = (option: AskOption): string =>
	option.description ? `${option.label} — ${option.description}` : option.label;

const formatPreviewPrompt = (question: AskQuestion): string => {
	const previews = question.options.flatMap((option) =>
		option.preview ? [`--- ${option.label} ---\n${option.preview.slice(0, MAX_PREVIEW_CHARS)}`] : [],
	);
	return previews.length > 0 ? `${formatPrompt(question)}\n\n${previews.join("\n\n")}` : formatPrompt(question);
};

const formatAnswerValue = (answer: AskAnswer): string => {
	switch (answer.kind) {
		case "option":
			return answer.extraInput ? `${answer.selectedOption} — ${answer.extraInput}` : answer.answer;
		case "custom":
			return answer.answer;
		case "multi":
			return answer.selected.length > 0 ? answer.selected.join(", ") : "(none selected)";
		case "cancelled":
			return "(cancelled/no answer)";
	}
	throw new Error("Unknown ask_user answer kind");
};

const formatDecision = (decision: AskDecision): string => {
	const answer =
		decision.kind === "multi"
			? decision.selected?.length
				? decision.selected.join(", ")
				: "(none selected)"
			: decision.selected?.length
				? decision.selected.join(", ")
				: decision.answer ?? "(cancelled/no answer)";
	const context = decision.context?.trim() ? ` Context: ${decision.context.trim()}` : "";
	const notes = decision.notes?.trim() ? ` Notes: ${decision.notes.trim()}` : "";
	return `Q: ${decision.question.trim()} A: ${answer}.${context}${notes}`;
};

const decisionFromEntry = (entry: SessionEntry): AskDecision | undefined => {
	let raw: unknown;
	if (entry.type === "custom" && entry.customType === CUSTOM_TYPE) raw = entry.data;
	if (entry.type === "message" && entry.message?.role === "toolResult" && entry.message.toolName === "ask_user") {
		raw = entry.message.details;
	}
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;

	// SAFETY: the object check above establishes safe property reads; fields are
	// narrowed below because session entries are serialized boundary data.
	const data = raw as Record<string, unknown>;
	if (typeof data.question !== "string") return undefined;
	if (typeof data.answer !== "string" && data.answer !== null) return undefined;
	const kind =
		data.kind === "option" || data.kind === "custom" || data.kind === "multi" || data.kind === "cancelled"
			? data.kind
			: undefined;
	const selected = Array.isArray(data.selected)
			? data.selected.filter((value): value is string => typeof value === "string")
			: undefined;
	const notes = typeof data.notes === "string" ? data.notes : undefined;
	return {
		version: 1,
		question: data.question,
		context: typeof data.context === "string" ? data.context : undefined,
		kind,
		answer: data.answer,
		...(selected && selected.length > 0 ? { selected } : {}),
		...(notes ? { notes } : {}),
		options: optionLabels(data.options),
		createdAt: typeof data.createdAt === "string" ? data.createdAt : new Date().toISOString(),
	};
};

const collectDecisions = (entries: SessionEntry[]): AskDecision[] => {
	const seen = new Set<string>();
	const decisions: AskDecision[] = [];

	for (const entry of entries) {
		const decision = decisionFromEntry(entry);
		if (!decision) continue;
		const key = `${decision.createdAt}\n${decision.question}\n${decision.answer ?? ""}\n${decision.selected?.join(",") ?? ""}`;
		if (seen.has(key)) continue;
		seen.add(key);
		decisions.push(decision);
	}

	return decisions;
};

const answerFromOption = (
	question: AskQuestion,
	option: AskOption,
	extraInput?: string,
	notes?: string,
): AskAnswer => ({
	id: question.id,
	question: question.question,
	context: question.context,
	kind: "option",
	answer: extraInput ? `${option.label} — ${extraInput}` : option.label,
	selectedOption: option.label,
	...(extraInput ? { extraInput } : {}),
	...(notes ? { notes } : {}),
	cancelled: false,
});

const answerFromFreeform = (question: AskQuestion, answer: string, notes?: string): AskAnswer => ({
	id: question.id,
	question: question.question,
	context: question.context,
	kind: "custom",
	answer,
	...(notes ? { notes } : {}),
	cancelled: false,
});

const answerFromMulti = (question: AskQuestion, selected: string[], notes?: string): AskAnswer => ({
	id: question.id,
	question: question.question,
	context: question.context,
	kind: "multi",
	answer: null,
	selected,
	...(notes ? { notes } : {}),
	cancelled: false,
});

const cancelledAnswer = (question: AskQuestion): AskAnswer => ({
	id: question.id,
	question: question.question,
	context: question.context,
	kind: "cancelled",
	answer: null,
	cancelled: true,
});

const withAnswerNotes = (answer: AskAnswer, notes: string): AskAnswer => {
	if (answer.kind === "cancelled") return answer;
	if (answer.kind === "option") {
		return {
			id: answer.id,
			question: answer.question,
			context: answer.context,
			kind: "option",
			answer: answer.answer,
			selectedOption: answer.selectedOption,
			...(answer.extraInput ? { extraInput: answer.extraInput } : {}),
			...(notes ? { notes } : {}),
			cancelled: false,
		};
	}
	if (answer.kind === "custom") {
		return {
			id: answer.id,
			question: answer.question,
			context: answer.context,
			kind: "custom",
			answer: answer.answer,
			...(notes ? { notes } : {}),
			cancelled: false,
		};
	}
	return {
		id: answer.id,
		question: answer.question,
		context: answer.context,
		kind: "multi",
		answer: null,
		selected: answer.selected,
		...(notes ? { notes } : {}),
		cancelled: false,
	};
};

const answerToDecision = (answer: AskAnswer, options: AskOption[], createdAt: string): AskDecision => ({
	version: 1,
	question: answer.question,
	context: answer.context,
	kind: answer.kind,
	answer: answer.answer,
	...(answer.kind === "multi" && answer.selected.length > 0 ? { selected: answer.selected } : {}),
	...(answer.kind !== "cancelled" && answer.notes ? { notes: answer.notes } : {}),
	options: options.map((option) => option.label),
	createdAt,
});

const summarizeAnswers = (answers: AskAnswer[]): string => {
	if (answers.length === 0) return "User did not provide an answer.";
	if (answers.length === 1) {
		const [answer] = answers;
		return answer ? `User answered: ${formatAnswerValue(answer)}` : "User did not provide an answer.";
	}
	return ["User answered:", ...answers.map((answer) => `- ${answer.id}: ${formatAnswerValue(answer)}`)].join("\n");
};

const isOptionRow = (row: QuestionnaireRow | undefined): row is Extract<QuestionnaireRow, { kind: "option" }> =>
	row?.kind === "option";

const optionRow = (option: AskOption): QuestionnaireRow => ({ kind: "option", option });

const buildRows = (question: AskQuestion): QuestionnaireRow[] => {
	const rows = question.options.map(optionRow);
	if (question.allowFreeform) rows.push({ kind: "other", label: OTHER_OPTION });
	if (question.multiSelect) rows.push({ kind: "next", label: NEXT_OPTION });
	return rows;
};

const renderBorderedPreview = (lines: string[], width: number, theme: EditorTheme["borderColor"]): string[] => {
	const boxWidth = Math.max(4, width);
	const innerWidth = boxWidth - 2;
	const border = (line: string) => theme(line);
	const output = [border(`┌${"─".repeat(innerWidth)}┐`)];
	for (const line of lines) {
		const clipped = truncateToWidth(line, innerWidth, "…", false);
		output.push(`${border("│")}${clipped}${" ".repeat(Math.max(0, innerWidth - visibleWidth(clipped)))}${border("│")}`);
	}
	output.push(border(`└${"─".repeat(innerWidth)}┘`));
	return output;
};

async function askSequentially(
	questions: AskQuestion[],
	ctx: ExtensionContext,
	timeout: number | undefined,
): Promise<AskAnswer[]> {
	const answers: AskAnswer[] = [];
	for (const question of questions) {
		const prompt = formatPreviewPrompt(question);
		if (question.multiSelect) {
			const typed = await ctx.ui.input(
				`${prompt}\n\nSelect option numbers separated by commas, or type a custom answer.`,
				"1,3",
				timeout ? { timeout } : undefined,
			);
			if (typed === undefined) {
				answers.push(cancelledAnswer(question));
				break;
			}
			const value = typed.trim();
			if (!value) {
				answers.push(answerFromMulti(question, []));
				continue;
			}
			const tokens = value.split(/[,\s]+/).filter((token) => token.length > 0);
			const indices = tokens.map((token) => {
				if (!/^\d+$/.test(token)) return undefined;
				const index = Number.parseInt(token, 10) - 1;
				return index >= 0 && index < question.options.length ? index : undefined;
			});
			if (indices.every((index): index is number => index !== undefined)) {
				const selected: string[] = [];
				for (const index of indices) {
					const option = question.options[index];
					if (option && !selected.includes(option.label)) selected.push(option.label);
				}
				answers.push(answerFromMulti(question, selected));
				continue;
			}
			if (question.allowFreeform) {
				answers.push(answerFromFreeform(question, value));
				continue;
			}
			answers.push(cancelledAnswer(question));
			break;
		}

		const choices = question.options.map(formatOptionForSelect);
		if (question.allowFreeform) choices.push(OTHER_OPTION);
		if (choices.length > 0) {
			const choice = await ctx.ui.select(prompt, choices, timeout ? { timeout } : undefined);
			if (!choice) {
				answers.push(cancelledAnswer(question));
				break;
			}
			const selectedIndex = choices.indexOf(choice);
			if (selectedIndex >= 0 && selectedIndex < question.options.length) {
				const option = question.options[selectedIndex];
				if (option) answers.push(answerFromOption(question, option));
				continue;
			}
			if (question.allowFreeform && choice === OTHER_OPTION) {
				const typed = await ctx.ui.input(question.question, "Type your answer", timeout ? { timeout } : undefined);
				const value = typed?.trim();
				if (value) answers.push(answerFromFreeform(question, value));
				else answers.push(cancelledAnswer(question));
				if (!value) break;
				continue;
			}
			answers.push(cancelledAnswer(question));
			break;
		}

		if (question.allowFreeform) {
			const typed = await ctx.ui.input(prompt, "Type your answer", timeout ? { timeout } : undefined);
			const value = typed?.trim();
			if (value) answers.push(answerFromFreeform(question, value));
			else {
				answers.push(cancelledAnswer(question));
				break;
			}
		} else {
			answers.push(cancelledAnswer(question));
			break;
		}
	}
	return answers;
}

async function askWithQuestionnaire(
	questions: AskQuestion[],
	timeout: number | undefined,
	ctx: ExtensionContext,
): Promise<{ answers: AskAnswer[]; cancelled: boolean }> {
	const result = await ctx.ui.custom<AskUserResult>((tui, theme, _keybindings, done) => {
		let currentTab = 0;
		let optionIndex = 0;
		let inputQuestion: AskQuestion | undefined;
		let inputBaseOption: AskOption | undefined;
		let inputMode: InputMode | undefined;
		let notesQuestion: AskQuestion | undefined;
		let cachedLines: string[] | undefined;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let previewWidth: number | undefined;
		const answers = new Map<string, AskAnswer>();
		const checkedByQuestion = new Map<string, Set<number>>();
		const notesByQuestion = new Map<string, string>();
		const previewCache = new Map<string, Markdown>();
		const isMultiQuestion = questions.length > 1;
		const submitTab = questions.length;
		const totalTabs = isMultiQuestion ? questions.length + 1 : 1;
		const markdownTheme = getMarkdownTheme();

		const editorTheme: EditorTheme = {
			borderColor: (text) => theme.fg("accent", text),
			selectList: {
				selectedPrefix: (text) => theme.fg("accent", text),
				selectedText: (text) => theme.fg("accent", text),
				description: (text) => theme.fg("muted", text),
				scrollInfo: (text) => theme.fg("dim", text),
				noMatch: (text) => theme.fg("warning", text),
			},
		};
		const editor = new Editor(tui, editorTheme);

		function refresh(): void {
			cachedLines = undefined;
			tui.requestRender();
		}

		function submit(cancelled: boolean): void {
			if (timer) clearTimeout(timer);
			done({ questions, answers: Array.from(answers.values()), cancelled });
		}

		if (timeout) timer = setTimeout(() => submit(true), timeout);

		function currentQuestion(): AskQuestion | undefined {
			return questions[currentTab];
		}

		function currentRows(): QuestionnaireRow[] {
			const question = currentQuestion();
			return question ? buildRows(question) : [];
		}

		function currentRow(): QuestionnaireRow | undefined {
			return currentRows()[optionIndex];
		}

		function allAnswered(): boolean {
			return questions.every((question) => answers.has(question.id));
		}

		function advanceAfterAnswer(): void {
			if (!isMultiQuestion) {
				submit(false);
				return;
			}
			currentTab = currentTab < questions.length - 1 ? currentTab + 1 : submitTab;
			optionIndex = 0;
			refresh();
		}

		function checkedFor(question: AskQuestion): Set<number> {
			const existing = checkedByQuestion.get(question.id);
			if (existing) return existing;
			const created = new Set<number>();
			checkedByQuestion.set(question.id, created);
			return created;
		}

		function selectedFor(question: AskQuestion): string[] {
			const checked = checkedFor(question);
			return question.options.flatMap((option, index) => (checked.has(index) ? [option.label] : []));
		}

		function notesFor(question: AskQuestion): string | undefined {
			return notesByQuestion.get(question.id);
		}

		function finishNotes(): void {
			const question = notesQuestion;
			if (!question) return;
			const notes = editor.getText().trim();
			if (notes) notesByQuestion.set(question.id, notes);
			else notesByQuestion.delete(question.id);
			const existing = answers.get(question.id);
			if (existing) answers.set(question.id, withAnswerNotes(existing, notes));
			inputQuestion = undefined;
			inputBaseOption = undefined;
			inputMode = undefined;
			notesQuestion = undefined;
			editor.setText("");
			refresh();
		}

		function startInput(question: AskQuestion, baseOption?: AskOption): void {
			inputQuestion = question;
			inputBaseOption = baseOption;
			inputMode = "answer";
			editor.setText("");
			refresh();
		}

		function startNotes(question: AskQuestion): void {
			const row = currentRow();
			if (!isOptionRow(row) || !row.option.preview) return;
			inputQuestion = question;
			inputBaseOption = row.option;
			inputMode = "notes";
			notesQuestion = question;
			editor.setText(notesFor(question) ?? answers.get(question.id)?.notes ?? "");
			refresh();
		}

		editor.onSubmit = (value) => {
			if (inputMode === "notes") {
				finishNotes();
				return;
			}
			const question = inputQuestion;
			if (!question) return;
			const trimmed = value.trim();
			if (!trimmed) {
				inputQuestion = undefined;
				inputBaseOption = undefined;
				inputMode = undefined;
				editor.setText("");
				refresh();
				return;
			}
			const notes = notesFor(question);
			answers.set(
				question.id,
				inputBaseOption
					? answerFromOption(question, inputBaseOption, trimmed, notes)
					: answerFromFreeform(question, trimmed, notes),
			);
			inputQuestion = undefined;
			inputBaseOption = undefined;
			inputMode = undefined;
			editor.setText("");
			advanceAfterAnswer();
		};

		function move(delta: number): void {
			const length = currentRows().length;
			optionIndex = length === 0 ? 0 : (optionIndex + delta + length) % length;
			refresh();
		}

		function switchTab(delta: number): void {
			currentTab = (currentTab + delta + totalTabs) % totalTabs;
			optionIndex = 0;
			inputQuestion = undefined;
			inputBaseOption = undefined;
			inputMode = undefined;
			notesQuestion = undefined;
			editor.setText("");
			refresh();
		}

		function toggleCurrentOption(question: AskQuestion): void {
			const row = currentRow();
			if (!isOptionRow(row)) return;
			const checked = new Set(checkedFor(question));
			const index = question.options.indexOf(row.option);
			if (index < 0) return;
			if (checked.has(index)) checked.delete(index);
			else checked.add(index);
			checkedByQuestion.set(question.id, checked);
			refresh();
		}

		function commitMulti(question: AskQuestion): void {
			answers.set(question.id, answerFromMulti(question, selectedFor(question), notesFor(question)));
			advanceAfterAnswer();
		}

		function handleInput(data: string): void {
			if (inputMode === "notes") {
				if (matchesKey(data, Key.escape)) {
					finishNotes();
					return;
				}
				editor.handleInput(data);
				refresh();
				return;
			}
			if (inputMode === "answer") {
				if (matchesKey(data, Key.escape)) {
					inputQuestion = undefined;
					inputBaseOption = undefined;
					inputMode = undefined;
					editor.setText("");
					refresh();
					return;
				}
				editor.handleInput(data);
				refresh();
				return;
			}

			if (isMultiQuestion && (matchesKey(data, Key.right) || matchesKey(data, Key.tab))) {
				switchTab(1);
				return;
			}
			if (isMultiQuestion && (matchesKey(data, Key.left) || matchesKey(data, Key.shift("tab")))) {
				switchTab(-1);
				return;
			}

			if (isMultiQuestion && currentTab === submitTab) {
				if (matchesKey(data, Key.escape)) {
					submit(true);
					return;
				}
				if (matchesKey(data, Key.up) || matchesKey(data, Key.down)) {
					optionIndex = optionIndex === 0 ? 1 : 0;
					refresh();
					return;
				}
				if (matchesKey(data, Key.enter)) {
					if (optionIndex === 0 && allAnswered()) submit(false);
					else if (optionIndex === 1) submit(true);
					return;
				}
				return;
			}

			const question = currentQuestion();
			if (!question) return;
			if (question.options.length === 0 && question.allowFreeform) {
				startInput(question);
				editor.handleInput(data);
				refresh();
				return;
			}
			const row = currentRow();
			if (data === "n" && !question.multiSelect && isOptionRow(row) && row.option.preview) {
				startNotes(question);
				return;
			}
			if (matchesKey(data, Key.up)) {
				move(-1);
				return;
			}
			if (matchesKey(data, Key.down)) {
				move(1);
				return;
			}

			if (question.multiSelect) {
				if (data === " " && isOptionRow(row)) {
					toggleCurrentOption(question);
					return;
				}
				if (matchesKey(data, Key.enter)) {
					if (isOptionRow(row)) toggleCurrentOption(question);
					else if (row?.kind === "other") startInput(question);
					else if (row?.kind === "next") commitMulti(question);
					return;
				}
				if (matchesKey(data, Key.escape)) submit(true);
				return;
			}

			if (matchesKey(data, Key.tab) && isOptionRow(row) && question.allowFreeform) {
				startInput(question, row.option);
				return;
			}
			if (matchesKey(data, Key.enter)) {
				if (row?.kind === "other") startInput(question);
				else if (isOptionRow(row)) answers.set(question.id, answerFromOption(question, row.option, undefined, notesFor(question)));
				else return;
				if (isOptionRow(row)) advanceAfterAnswer();
				return;
			}
			if (matchesKey(data, Key.escape)) submit(true);
		}

		function renderPreview(question: AskQuestion, optionIndexForPreview: number, width: number): string[] {
			const option = question.options[optionIndexForPreview];
			const innerWidth = Math.max(1, width - 4);
			if (previewWidth !== innerWidth) {
				for (const markdown of previewCache.values()) markdown.invalidate();
				previewWidth = innerWidth;
			}
			const preview = option?.preview;
			if (!preview) return renderBorderedPreview([theme.fg("dim", "No preview available")], width, (text) => theme.fg("accent", text));
			const key = `${question.id}:${optionIndexForPreview}`;
			let markdown = previewCache.get(key);
			if (!markdown) {
				markdown = new Markdown(preview, 0, 0, markdownTheme);
				previewCache.set(key, markdown);
			}
			const rendered = markdown.render(innerWidth);
			const lines = rendered.length > MAX_PREVIEW_LINES ? [...rendered.slice(0, MAX_PREVIEW_LINES - 1), theme.fg("dim", "… more preview …")] : rendered;
			return renderBorderedPreview(lines, width, (text) => theme.fg("accent", text));
		}

		function renderOptionRows(question: AskQuestion, rows: QuestionnaireRow[], width: number): string[] {
			const lines: string[] = [];
			const numberedCount = question.options.length + (question.allowFreeform ? 1 : 0);
			const numberWidth = String(Math.max(1, numberedCount)).length;
			const checked = checkedFor(question);
			let optionNumber = 0;
			for (const [index, row] of rows.entries()) {
				const active = index === optionIndex;
				if (row.kind === "next") {
					const pointer = active ? theme.fg("accent", "→ ") : "  ";
					lines.push(truncateToWidth(`${pointer}${theme.fg(active ? "accent" : "text", row.label)}`, width, ""));
					continue;
				}
				optionNumber += 1;
				const pointer = active ? theme.fg("accent", "→ ") : "  ";
				const number = `${String(optionNumber).padStart(numberWidth, " ")}. `;
				const checkbox = question.multiSelect
					? `${theme.fg(row.kind === "option" && checked.has(optionNumber - 1) ? "accent" : "muted", row.kind === "option" && checked.has(optionNumber - 1) ? "[x] " : "[ ] ")}`
					: "";
				const label = row.kind === "option" ? row.option.label : row.label;
				const prefix = `${pointer}${number}${checkbox}`;
				const styledLabel = active ? theme.fg("accent", theme.bold(label)) : label;
				lines.push(truncateToWidth(`${prefix}${styledLabel}`, width, ""));
				if (row.kind === "option" && row.option.description) {
					const continuation = " ".repeat(visibleWidth(prefix));
					const contentWidth = Math.max(1, width - visibleWidth(prefix));
					for (const line of wrapTextWithAnsi(row.option.description, contentWidth)) {
						lines.push(`${continuation}${theme.fg("muted", line)}`);
					}
				}
			}
			return lines;
		}

		function renderQuestionBody(question: AskQuestion, width: number): string[] {
			const rows = buildRows(question);
			if (inputMode) return renderOptionRows(question, rows, width);
			const focusedOption = currentRow();
			const hasPreview = question.options.some((option) => option.preview);
			if (!hasPreview || question.multiSelect || !isOptionRow(focusedOption) || width < 76) {
				return renderOptionRows(question, rows, width);
			}
			const leftWidth = Math.min(Math.max(30, Math.floor(width * 0.43)), Math.max(30, width - 34));
			const rightWidth = Math.max(20, width - leftWidth - 2);
			const leftLines = renderOptionRows(question, rows, leftWidth);
			const rightLines = renderPreview(question, question.options.indexOf(focusedOption.option), rightWidth);
			const totalLines = Math.max(leftLines.length, rightLines.length);
			const output: string[] = [];
			for (let index = 0; index < totalLines; index += 1) {
				const left = leftLines[index] ?? "";
				const right = rightLines[index] ?? "";
				const leftClipped = truncateToWidth(left, leftWidth, "");
				output.push(`${leftClipped}${" ".repeat(Math.max(0, leftWidth - visibleWidth(leftClipped)))}  ${right}`);
			}
			return output;
		}

		function addWrapped(lines: string[], text: string, width: number): void {
			lines.push(...wrapTextWithAnsi(text, Math.max(1, width)));
		}

		function addWrappedWithPrefix(lines: string[], prefix: string, text: string, width: number): void {
			const prefixWidth = visibleWidth(prefix);
			if (prefixWidth >= width) {
				addWrapped(lines, `${prefix}${text}`, width);
				return;
			}
			const wrapped = wrapTextWithAnsi(text, width - prefixWidth);
			const continuationPrefix = " ".repeat(prefixWidth);
			for (const [index, line] of wrapped.entries()) lines.push(`${index === 0 ? prefix : continuationPrefix}${line}`);
		}

		function renderSubmit(width: number): string[] {
			const lines: string[] = [];
			addWrappedWithPrefix(lines, " ", theme.fg("accent", theme.bold("Review your answers")), width);
			lines.push("");
			for (const question of questions) {
				const answer = answers.get(question.id);
				const label = question.header ?? question.id;
				if (!answer) {
					lines.push(` ${theme.fg("warning", `○ ${label}: unanswered`)}`);
					continue;
				}
				lines.push(` ${theme.fg("success", `● ${label}: `)}${theme.fg("text", formatAnswerValue(answer))}`);
				if (answer.kind !== "cancelled" && answer.notes) lines.push(`   ${theme.fg("dim", `notes: ${answer.notes}`)}`);
			}
			lines.push("");
			if (optionIndex === 0) {
				lines.push(` ${allAnswered() ? theme.fg("success", "→ Submit") : theme.fg("warning", "→ Submit (answer all questions first)")}`);
				lines.push(`   ${theme.fg("muted", "Cancel")}`);
			} else {
				lines.push(`   ${theme.fg("muted", "Submit")}`);
				lines.push(` ${theme.fg("warning", "→ Cancel")}`);
			}
			lines.push("");
			lines.push(` ${theme.fg("dim", "↑↓ choose action · Enter confirm · ←/→ questions")}`);
			return lines;
		}

		function render(width: number): string[] {
			if (cachedLines) return cachedLines;
			const renderWidth = Math.max(1, width);
			const lines: string[] = [];
			if (isMultiQuestion) {
				const tabs = questions.map((question, index) => {
					const active = currentTab === index;
					const answered = answers.has(question.id);
					const text = ` ${answered ? "■" : "□"} ${question.header ?? question.id} `;
					return active ? theme.bg("selectedBg", theme.fg("text", text)) : theme.fg(answered ? "success" : "muted", text);
				});
				const submitLabel = " ✓ Submit ";
				tabs.push(currentTab === submitTab ? theme.bg("selectedBg", theme.fg("text", submitLabel)) : theme.fg(allAnswered() ? "success" : "dim", submitLabel));
				lines.push(theme.fg("accent", "─".repeat(renderWidth)));
				addWrappedWithPrefix(lines, " ", tabs.join(" "), renderWidth);
				lines.push("");
			}

			if (isMultiQuestion && currentTab === submitTab) {
				lines.push(...renderSubmit(renderWidth));
				lines.push(theme.fg("accent", "─".repeat(renderWidth)));
				cachedLines = lines;
				return lines;
			}

			const question = currentQuestion();
			if (!question) return lines;
			addWrappedWithPrefix(lines, " ", theme.fg("text", formatPrompt(question)), renderWidth);
			lines.push("");

			if (inputMode) {
				if (inputMode === "notes") {
					addWrappedWithPrefix(lines, " ", theme.fg("muted", `Notes for ${inputBaseOption?.label ?? "this choice"}:`), renderWidth);
				} else {
					if (inputBaseOption) addWrappedWithPrefix(lines, " ", theme.fg("muted", `Selected: ${inputBaseOption.label}`), renderWidth);
					addWrappedWithPrefix(lines, " ", theme.fg("muted", "Your answer:"), renderWidth);
				}
				for (const line of editor.render(Math.max(1, renderWidth - 2))) lines.push(` ${line}`);
				lines.push("");
				addWrappedWithPrefix(lines, " ", theme.fg("dim", "Enter save · Esc back"), renderWidth);
			} else if (question.options.length === 0 && question.allowFreeform) {
				addWrappedWithPrefix(lines, " ", theme.fg("dim", "Start typing to answer"), renderWidth);
			} else {
				lines.push(...renderQuestionBody(question, renderWidth));
			}

			lines.push("");
			const hasNotes = !question.multiSelect && isOptionRow(currentRow()) && Boolean(currentRow()?.option.preview);
			const controls = question.multiSelect
				? "↑↓ select · Space toggle · Enter choose/next"
				: "↑↓ select · Enter choose · Tab add details";
			const tabHint = isMultiQuestion ? " · ←/→ questions" : "";
			const notesHint = hasNotes ? " · n notes" : "";
			addWrappedWithPrefix(lines, " ", theme.fg("dim", `${controls}${notesHint}${tabHint} · Esc cancel`), renderWidth);
			lines.push(theme.fg("accent", "─".repeat(renderWidth)));
			cachedLines = lines;
			return lines;
		}

		return {
			render,
			invalidate: () => {
				cachedLines = undefined;
			},
			handleInput,
			dispose: () => {
				if (timer) clearTimeout(timer);
				for (const markdown of previewCache.values()) markdown.invalidate();
			},
		};
	});

	if (!result) return { answers: [], cancelled: true };
	return { answers: result.answers, cancelled: result.cancelled };
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "ask_user",
		label: "Ask user",
		description: "Ask the user one or more related clarification or decision questions with descriptions, previews, optional multi-select, and freeform answers.",
		promptSnippet: "Ask the user one or more decision/clarification questions.",
		promptGuidelines: [
			"Use ask_user before making a material assumption about requirements, architecture, destructive changes, credentials, deployment, or personal preference.",
			"Prefer one focused question. Use the questions array only for a small set of related decisions that should be answered together.",
			"Give each option a concise label and an optional description explaining its trade-offs. Use preview for Markdown, code, diagrams, or configuration examples that benefit from visual comparison.",
			"Set multiSelect to true when multiple choices are valid. Users can toggle choices with Space and commit with the Next row.",
			"Users can type a custom answer when allowFreeform is true. On preview-bearing choices, press n to attach notes.",
			"Include the smallest useful context summary for each question.",
		],
		parameters: Type.Object({
			question: Type.Optional(Type.String({ description: "One focused question to ask the user." })),
			context: Type.Optional(Type.String({ description: "Brief context needed to answer the question." })),
			header: Type.Optional(Type.String({ description: "Short label shown above the question." })),
			options: Type.Optional(Type.Array(OptionSchema, { description: "Optional answer choices." })),
			allowFreeform: Type.Optional(Type.Boolean({ description: "Allow a typed answer. Defaults to true." })),
			multiSelect: Type.Optional(Type.Boolean({ description: "Allow selecting multiple choices." })),
			questions: Type.Optional(
				Type.Array(QuestionSchema, { description: "A small set of related questions to ask together." }),
			),
			timeout: Type.Optional(Type.Number({ description: "Optional timeout in milliseconds." })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const questions = normalizeQuestions(params as AskUserParams);
			const timeout = typeof params.timeout === "number" && params.timeout > 0 ? params.timeout : undefined;

			if (questions.length === 0) {
				return {
					content: [{ type: "text" as const, text: "No valid question was provided." }],
					details: { questions: [], answers: [], cancelled: true, createdAt: new Date().toISOString() },
					isError: true,
				};
			}

			if (!ctx.hasUI) {
				return {
					content: [{ type: "text" as const, text: "No interactive UI is available to ask the user." }],
					details: { questions, answers: [], cancelled: true, createdAt: new Date().toISOString() },
					isError: true,
				};
			}

			const mode = (ctx as { mode?: string }).mode;
			const interaction =
				mode === "tui"
					? await askWithQuestionnaire(questions, timeout, ctx)
					: { answers: await askSequentially(questions, ctx, timeout), cancelled: false };
			const answers = interaction.answers;
			const createdAt = new Date().toISOString();
			for (const answer of answers) {
				const question = questions.find((candidate) => candidate.id === answer.id);
				pi.appendEntry<AskDecision>(CUSTOM_TYPE, answerToDecision(answer, question?.options ?? [], createdAt));
			}

			return {
				content: [{ type: "text" as const, text: summarizeAnswers(answers) }],
				details: {
					version: 3,
					questions,
					answers,
					cancelled: interaction.cancelled || answers.length === 0 || answers.some((answer) => answer.cancelled),
					createdAt,
				},
			};
		},
		renderCall(args, theme) {
			const questions = normalizeQuestions(args as AskUserParams);
			const label = questions.length > 1 ? `${questions.length} questions` : questions[0]?.question ?? "Ask user";
			return new Text(theme.fg("toolTitle", theme.bold("ask_user ")) + theme.fg("muted", label), 0, 0);
		},
		renderResult(result, _options, theme) {
			const details = result.details as { answers?: AskAnswer[]; answer?: string | null } | undefined;
			if (details?.answers) {
				if (details.answers.length === 0 || details.answers.some((answer) => answer.cancelled)) {
					return new Text(theme.fg("warning", "Cancelled"), 0, 0);
				}
				return new Text(
					details.answers
						.map((answer) => `${theme.fg("success", "✓ ")}${theme.fg("accent", answer.id)}: ${formatAnswerValue(answer)}`)
						.join("\n"),
					0,
					0,
				);
			}
			if (details?.answer === null) return new Text(theme.fg("warning", "Cancelled"), 0, 0);
			const text = result.content[0];
			return new Text(text?.type === "text" ? text.text : "", 0, 0);
		},
	});

	pi.on("session_before_tree", async (event) => {
		const decisions = collectDecisions(event.preparation.entriesToSummarize as SessionEntry[]);
		if (decisions.length === 0) return;

		const latest = decisions.slice(-MAX_SUMMARY_DECISIONS).map(formatDecision).join("\n");
		const existing = event.preparation.customInstructions?.trim();
		const customInstructions = [
			existing,
			"When summarizing this abandoned branch, explicitly preserve user decisions and answers from ask_user. Treat these as durable constraints if they remain relevant after navigation.",
			"ask_user decisions on the branch:",
			latest,
		]
			.filter(Boolean)
			.join("\n\n");

		return {
			customInstructions,
			replaceInstructions: event.preparation.replaceInstructions ?? false,
			label: event.preparation.label ?? "ask-user branch summary",
		};
	});
}
