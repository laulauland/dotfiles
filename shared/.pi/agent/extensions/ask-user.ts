import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	Editor,
	type EditorTheme,
	Key,
	matchesKey,
	Text,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { Type } from "typebox";

type AskDecision = {
	version: 1;
	question: string;
	context?: string;
	answer: string | null;
	options: string[];
	createdAt: string;
};

type AskQuestion = {
	id: string;
	question: string;
	context?: string;
	options: string[];
	allowFreeform: boolean;
};

type AskAnswer = {
	id: string;
	question: string;
	context?: string;
	answer: string | null;
	selectedOption?: string;
	extraInput?: string;
	wasFreeform: boolean;
	cancelled: boolean;
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
	options?: unknown;
	allowFreeform?: boolean;
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

const CUSTOM_TYPE = "ask-user-decision";
const MAX_SUMMARY_DECISIONS = 12;
const OTHER_OPTION = "Other…";

const normalizeOptions = (options: unknown): string[] => {
	if (!Array.isArray(options)) return [];
	return options.map((option) => (typeof option === "string" ? option.trim() : "")).filter(Boolean);
};

const normalizeQuestion = (raw: RawQuestion, index: number): AskQuestion | undefined => {
	const question = raw.question?.trim();
	if (!question) return undefined;
	const context = raw.context?.trim() || undefined;
	return {
		id: raw.id?.trim() || `question_${index + 1}`,
		question,
		context,
		options: normalizeOptions(raw.options),
		allowFreeform: raw.allowFreeform !== false,
	};
};

const normalizeQuestions = (params: AskUserParams): AskQuestion[] => {
	const rawQuestions = Array.isArray(params.questions) && params.questions.length > 0 ? params.questions : [params];
	return rawQuestions.map(normalizeQuestion).filter((question): question is AskQuestion => question !== undefined);
};

const formatPrompt = (question: string, context?: string): string => {
	const trimmedContext = context?.trim();
	if (!trimmedContext) return question;
	return `${trimmedContext}\n\n${question}`;
};

const formatDecision = (decision: AskDecision): string => {
	const answer = decision.answer === null ? "(cancelled/no answer)" : decision.answer;
	const context = decision.context?.trim() ? ` Context: ${decision.context.trim()}` : "";
	return `Q: ${decision.question.trim()} A: ${answer}.${context}`;
};

const decisionFromEntry = (entry: SessionEntry): AskDecision | undefined => {
	if (entry.type === "custom" && entry.customType === CUSTOM_TYPE && entry.data && typeof entry.data === "object") {
		const data = entry.data as Partial<AskDecision>;
		if (typeof data.question === "string" && (typeof data.answer === "string" || data.answer === null)) {
			return {
				version: 1,
				question: data.question,
				context: typeof data.context === "string" ? data.context : undefined,
				answer: data.answer,
				options: normalizeOptions(data.options),
				createdAt: typeof data.createdAt === "string" ? data.createdAt : new Date().toISOString(),
			};
		}
	}

	if (entry.type === "message" && entry.message?.role === "toolResult" && entry.message.toolName === "ask_user") {
		const details = entry.message.details as Partial<AskDecision> | undefined;
		if (details && typeof details.question === "string" && (typeof details.answer === "string" || details.answer === null)) {
			return {
				version: 1,
				question: details.question,
				context: typeof details.context === "string" ? details.context : undefined,
				answer: details.answer,
				options: normalizeOptions(details.options),
				createdAt: typeof details.createdAt === "string" ? details.createdAt : new Date().toISOString(),
			};
		}
	}

	return undefined;
};

const collectDecisions = (entries: SessionEntry[]): AskDecision[] => {
	const seen = new Set<string>();
	const decisions: AskDecision[] = [];

	for (const entry of entries) {
		const decision = decisionFromEntry(entry);
		if (!decision) continue;
		const key = `${decision.createdAt}\n${decision.question}\n${decision.answer ?? ""}`;
		if (seen.has(key)) continue;
		seen.add(key);
		decisions.push(decision);
	}

	return decisions;
};

const answerFromOption = (question: AskQuestion, selectedOption: string, extraInput?: string): AskAnswer => {
	const answer = extraInput ? `${selectedOption} — ${extraInput}` : selectedOption;
	return {
		id: question.id,
		question: question.question,
		context: question.context,
		answer,
		selectedOption,
		...(extraInput ? { extraInput } : {}),
		wasFreeform: false,
		cancelled: false,
	};
};

const answerFromFreeform = (question: AskQuestion, answer: string): AskAnswer => ({
	id: question.id,
	question: question.question,
	context: question.context,
	answer,
	wasFreeform: true,
	cancelled: false,
});

const cancelledAnswer = (question: AskQuestion): AskAnswer => ({
	id: question.id,
	question: question.question,
	context: question.context,
	answer: null,
	wasFreeform: false,
	cancelled: true,
});

const answerToDecision = (answer: AskAnswer, options: string[], createdAt: string): AskDecision => ({
	version: 1,
	question: answer.question,
	context: answer.context,
	answer: answer.answer,
	options,
	createdAt,
});

const summarizeAnswers = (answers: AskAnswer[]): string => {
	if (answers.length === 0) return "User did not provide an answer.";
	if (answers.length === 1) {
		const [answer] = answers;
		return answer.answer === null ? "User did not provide an answer." : `User answered: ${answer.answer}`;
	}
	return [
		"User answered:",
		...answers.map((answer) => `- ${answer.id}: ${answer.answer === null ? "(cancelled/no answer)" : answer.answer}`),
	].join("\n");
};

async function askSequentially(
	questions: AskQuestion[],
	ctx: ExtensionContext,
	timeout: number | undefined,
): Promise<AskAnswer[]> {
	const answers: AskAnswer[] = [];
	for (const question of questions) {
		let answer: AskAnswer | undefined;
		const prompt = formatPrompt(question.question, question.context);
		if (question.options.length > 0) {
			const choices = question.allowFreeform ? [...question.options, OTHER_OPTION] : question.options;
			const choice = await ctx.ui.select(prompt, choices, timeout ? { timeout } : undefined);
			if (choice === OTHER_OPTION) {
				const typed = await ctx.ui.input(question.question, "Type your answer", timeout ? { timeout } : undefined);
				const trimmed = typed?.trim();
				answer = trimmed ? answerFromFreeform(question, trimmed) : cancelledAnswer(question);
			} else {
				answer = choice?.trim() ? answerFromOption(question, choice.trim()) : cancelledAnswer(question);
			}
		} else if (question.allowFreeform) {
			const typed = await ctx.ui.input(prompt, "Type your answer", timeout ? { timeout } : undefined);
			const trimmed = typed?.trim();
			answer = trimmed ? answerFromFreeform(question, trimmed) : cancelledAnswer(question);
		} else {
			answer = cancelledAnswer(question);
		}
		answers.push(answer);
		if (answer.cancelled) break;
	}
	return answers;
}

async function askWithQuestionnaire(questions: AskQuestion[], timeout: number | undefined, ctx: ExtensionContext): Promise<AskAnswer[]> {
	const result = await ctx.ui.custom<AskUserResult>((tui, theme, _keybindings, done) => {
		let currentTab = 0;
		let optionIndex = 0;
		let inputQuestion: AskQuestion | undefined;
		let inputBaseOption: string | undefined;
		let cachedLines: string[] | undefined;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const answers = new Map<string, AskAnswer>();
		const isMulti = questions.length > 1;
		const submitTab = questions.length;
		const totalTabs = questions.length + 1;

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

		if (timeout) {
			timer = setTimeout(() => submit(true), timeout);
		}

		function currentQuestion(): AskQuestion | undefined {
			return questions[currentTab];
		}

		function currentOptions(): string[] {
			const question = currentQuestion();
			if (!question) return [];
			return question.allowFreeform ? [...question.options, OTHER_OPTION] : question.options;
		}

		function allAnswered(): boolean {
			return questions.every((question) => answers.has(question.id));
		}

		function advanceAfterAnswer(): void {
			if (!isMulti) {
				submit(false);
				return;
			}
			const nextUnanswered = questions.findIndex((question, index) => index > currentTab && !answers.has(question.id));
			currentTab = nextUnanswered >= 0 ? nextUnanswered : submitTab;
			optionIndex = 0;
			refresh();
		}

		function startInput(question: AskQuestion, baseOption?: string): void {
			inputQuestion = question;
			inputBaseOption = baseOption;
			editor.setText("");
			refresh();
		}

		editor.onSubmit = (value) => {
			const question = inputQuestion;
			if (!question) return;
			const trimmed = value.trim();
			if (!trimmed) {
				inputQuestion = undefined;
				inputBaseOption = undefined;
				editor.setText("");
				refresh();
				return;
			}
			answers.set(
				question.id,
				inputBaseOption ? answerFromOption(question, inputBaseOption, trimmed) : answerFromFreeform(question, trimmed),
			);
			inputQuestion = undefined;
			inputBaseOption = undefined;
			editor.setText("");
			advanceAfterAnswer();
		};

		function handleInput(data: string): void {
			if (inputQuestion) {
				if (matchesKey(data, Key.escape)) {
					inputQuestion = undefined;
					inputBaseOption = undefined;
					editor.setText("");
					refresh();
					return;
				}
				editor.handleInput(data);
				refresh();
				return;
			}

			if (isMulti) {
				if (matchesKey(data, Key.right)) {
					currentTab = (currentTab + 1) % totalTabs;
					optionIndex = 0;
					refresh();
					return;
				}
				if (matchesKey(data, Key.left)) {
					currentTab = (currentTab - 1 + totalTabs) % totalTabs;
					optionIndex = 0;
					refresh();
					return;
				}
			}

			if (currentTab === submitTab) {
				if (matchesKey(data, Key.enter) && allAnswered()) submit(false);
				else if (matchesKey(data, Key.escape)) submit(true);
				return;
			}

			const question = currentQuestion();
			if (!question) return;
			const options = currentOptions();

			if (question.options.length === 0) {
				if (matchesKey(data, Key.escape)) {
					submit(true);
					return;
				}
				if (!question.allowFreeform) return;
				startInput(question);
				editor.handleInput(data);
				refresh();
				return;
			}

			if (matchesKey(data, Key.up)) {
				optionIndex = Math.max(0, optionIndex - 1);
				refresh();
				return;
			}
			if (matchesKey(data, Key.down)) {
				optionIndex = Math.min(options.length - 1, optionIndex + 1);
				refresh();
				return;
			}

			const selectedOption = options[optionIndex];
			if (matchesKey(data, Key.tab) && selectedOption && selectedOption !== OTHER_OPTION && question.allowFreeform) {
				startInput(question, selectedOption);
				return;
			}
			if (matchesKey(data, Key.enter) && selectedOption) {
				if (selectedOption === OTHER_OPTION) startInput(question);
				else {
					answers.set(question.id, answerFromOption(question, selectedOption));
					advanceAfterAnswer();
				}
				return;
			}

			if (matchesKey(data, Key.escape)) submit(true);
		}

		function render(width: number): string[] {
			if (cachedLines) return cachedLines;
			const renderWidth = Math.max(1, width);
			const lines: string[] = [];
			const question = currentQuestion();
			const options = currentOptions();

			function addWrapped(text: string): void {
				lines.push(...wrapTextWithAnsi(text, renderWidth));
			}

			function addWrappedWithPrefix(prefix: string, text: string): void {
				const prefixWidth = visibleWidth(prefix);
				if (prefixWidth >= renderWidth) {
					addWrapped(prefix + text);
					return;
				}
				const wrapped = wrapTextWithAnsi(text, renderWidth - prefixWidth);
				const continuationPrefix = " ".repeat(prefixWidth);
				for (let i = 0; i < wrapped.length; i++) {
					lines.push(`${i === 0 ? prefix : continuationPrefix}${wrapped[i]}`);
				}
			}

			lines.push(theme.fg("accent", "─".repeat(renderWidth)));
			if (isMulti) {
				const tabs: string[] = [];
				for (let i = 0; i < questions.length; i++) {
					const isActive = i === currentTab;
					const isAnswered = answers.has(questions[i].id);
					const tabText = ` ${isAnswered ? "■" : "□"} ${questions[i].id} `;
					tabs.push(isActive ? theme.bg("selectedBg", theme.fg("text", tabText)) : theme.fg(isAnswered ? "success" : "muted", tabText));
				}
				const submitText = " ✓ Submit ";
				tabs.push(currentTab === submitTab ? theme.bg("selectedBg", theme.fg("text", submitText)) : theme.fg(allAnswered() ? "success" : "dim", submitText));
				addWrappedWithPrefix(" ", tabs.join(" "));
				lines.push("");
			}

			if (inputQuestion) {
				addWrappedWithPrefix(" ", theme.fg("text", formatPrompt(inputQuestion.question, inputQuestion.context)));
				if (inputBaseOption) addWrappedWithPrefix(" ", theme.fg("muted", `Selected: ${inputBaseOption}`));
				lines.push("");
				addWrappedWithPrefix(" ", theme.fg("muted", inputBaseOption ? "Add details:" : "Your answer:"));
				for (const line of editor.render(Math.max(1, renderWidth - 2))) {
					lines.push(` ${line}`);
				}
				lines.push("");
				addWrappedWithPrefix(" ", theme.fg("dim", "Enter submit • Esc back"));
			} else if (currentTab === submitTab) {
				addWrappedWithPrefix(" ", theme.fg("accent", theme.bold("Ready to submit")));
				lines.push("");
				for (const q of questions) {
					const answer = answers.get(q.id)?.answer;
					if (answer) addWrappedWithPrefix(" ", `${theme.fg("muted", `${q.id}: `)}${theme.fg("text", answer)}`);
				}
				lines.push("");
				addWrappedWithPrefix(" ", allAnswered() ? theme.fg("success", "Press Enter to submit") : theme.fg("warning", `Unanswered: ${questions.filter((q) => !answers.has(q.id)).map((q) => q.id).join(", ")}`));
			} else if (question) {
				addWrappedWithPrefix(" ", theme.fg("text", formatPrompt(question.question, question.context)));
				lines.push("");
				if (question.options.length === 0) {
					addWrappedWithPrefix(" ", theme.fg("dim", question.allowFreeform ? "Start typing to answer" : "No answer choices available"));
				} else {
					for (let i = 0; i < options.length; i++) {
						const option = options[i];
						const isSelected = i === optionIndex;
						const prefix = isSelected ? theme.fg("accent", "→ ") : "  ";
						addWrappedWithPrefix(prefix, theme.fg(isSelected ? "accent" : "text", option));
					}
				}
			}

			lines.push("");
			if (!inputQuestion) {
				const help = isMulti
					? "←/→ questions • ↑↓ select • Enter choose • Tab add details • Esc cancel"
					: "↑↓ select • Enter choose • Tab add details • Esc cancel";
				addWrappedWithPrefix(" ", theme.fg("dim", help));
			}
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
			},
		};
	});

	if (!result || result.cancelled) {
		const firstUnanswered = questions.find((question) => !result?.answers.some((answer) => answer.id === question.id));
		return result?.answers ?? (firstUnanswered ? [cancelledAnswer(firstUnanswered)] : []);
	}
	return result.answers;
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "ask_user",
		label: "Ask user",
		description: "Ask the user one or more related clarification or decision questions with optional choices.",
		promptSnippet: "Ask the user one or more decision/clarification questions.",
		promptGuidelines: [
			"Use ask_user before making a material assumption about requirements, architecture, destructive changes, credentials, deployment, or personal preference.",
			"Prefer one focused question. Use the questions array only for a small set of related decisions that should be answered together.",
			"When choices are provided, the user can select one with Enter or press Tab on the selected choice to add extra typed detail.",
			"Include the smallest useful context summary for each question.",
		],
		parameters: Type.Object({
			question: Type.Optional(Type.String({ description: "One focused question to ask the user." })),
			context: Type.Optional(Type.String({ description: "Brief context needed to answer the question." })),
			options: Type.Optional(Type.Array(Type.String(), { description: "Optional single-choice answers." })),
			allowFreeform: Type.Optional(Type.Boolean({ description: "Allow a typed answer. Defaults to true." })),
			questions: Type.Optional(
				Type.Array(
					Type.Object({
						id: Type.Optional(Type.String({ description: "Stable answer identifier." })),
						question: Type.String({ description: "One focused question to ask the user." }),
						context: Type.Optional(Type.String({ description: "Brief context needed to answer this question." })),
						options: Type.Optional(Type.Array(Type.String(), { description: "Optional single-choice answers." })),
						allowFreeform: Type.Optional(Type.Boolean({ description: "Allow a typed answer. Defaults to true." })),
					}),
					{ description: "A small set of related questions to ask together." },
				),
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
			const answers = mode === "tui" ? await askWithQuestionnaire(questions, timeout, ctx) : await askSequentially(questions, ctx, timeout);
			const createdAt = new Date().toISOString();
			for (const answer of answers) {
				const question = questions.find((candidate) => candidate.id === answer.id);
				pi.appendEntry<AskDecision>(CUSTOM_TYPE, answerToDecision(answer, question?.options ?? [], createdAt));
			}

			return {
				content: [{ type: "text" as const, text: summarizeAnswers(answers) }],
				details: {
					version: 2,
					questions,
					answers,
					cancelled: answers.length === 0 || answers.some((answer) => answer.cancelled),
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
					details.answers.map((answer) => `${theme.fg("success", "✓ ")}${theme.fg("accent", answer.id)}: ${answer.answer}`).join("\n"),
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
