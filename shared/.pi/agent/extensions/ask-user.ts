import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

type AskDecision = {
	version: 1;
	question: string;
	context?: string;
	answer: string | null;
	options: string[];
	createdAt: string;
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

const normalizeOptions = (options: unknown): string[] => {
	if (!Array.isArray(options)) return [];
	return options.map((option) => (typeof option === "string" ? option.trim() : "")).filter(Boolean);
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

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "ask_user",
		label: "Ask user",
		description: "Ask the user one focused clarification or decision question with optional choices.",
		promptSnippet: "Ask the user one focused decision/clarification question.",
		promptGuidelines: [
			"Use ask_user before making a material assumption about requirements, architecture, destructive changes, credentials, deployment, or personal preference.",
			"When using ask_user, ask exactly one focused question and include the smallest useful context summary.",
		],
		parameters: Type.Object({
			question: Type.String({ description: "One focused question to ask the user." }),
			context: Type.Optional(Type.String({ description: "Brief context needed to answer the question." })),
			options: Type.Optional(Type.Array(Type.String(), { description: "Optional single-choice answers." })),
			allowFreeform: Type.Optional(Type.Boolean({ description: "Allow a typed answer. Defaults to true." })),
			timeout: Type.Optional(Type.Number({ description: "Optional timeout in milliseconds." })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const question = params.question.trim();
			const context = params.context?.trim() || undefined;
			const options = normalizeOptions(params.options);
			const allowFreeform = params.allowFreeform !== false;
			const timeout = typeof params.timeout === "number" && params.timeout > 0 ? params.timeout : undefined;

			if (!ctx.hasUI) {
				return {
					content: [{ type: "text" as const, text: "No interactive UI is available to ask the user." }],
					details: { question, context, options, answer: null, cancelled: true, createdAt: new Date().toISOString() },
					isError: true,
				};
			}

			let answer: string | null = null;
			const prompt = formatPrompt(question, context);

			if (options.length > 0) {
				const choices = allowFreeform ? [...options, "Other…"] : options;
				const choice = await ctx.ui.select(prompt, choices, timeout ? { timeout } : undefined);
				if (choice && choice === "Other…") {
					const typed = await ctx.ui.input(question, "Type your answer", timeout ? { timeout } : undefined);
					answer = typed?.trim() || null;
				} else {
					answer = choice?.trim() || null;
				}
			} else if (allowFreeform) {
				const typed = await ctx.ui.input(prompt, "Type your answer", timeout ? { timeout } : undefined);
				answer = typed?.trim() || null;
			}

			const decision: AskDecision = {
				version: 1,
				question,
				context,
				answer,
				options,
				createdAt: new Date().toISOString(),
			};
			pi.appendEntry<AskDecision>(CUSTOM_TYPE, decision);

			const text = answer === null ? "User did not provide an answer." : `User answered: ${answer}`;
			return {
				content: [{ type: "text" as const, text }],
				details: { ...decision, cancelled: answer === null },
			};
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
