import { test } from "node:test";
import assert from "node:assert/strict";
import { createFactory } from "../runtime.js";
import { ObservabilityStore } from "../observability.js";
import { FactoryError } from "../errors.js";

test("factory.spawn rejects empty systemPrompt", () => {
	const factory = createFactory({} as any, "r1", new ObservabilityStore());

	assert.throws(
		() => factory.spawn({ agent: "test", systemPrompt: "", prompt: "do stuff", model: "opus" }),
		(err: unknown) => {
			assert.ok(err instanceof FactoryError);
			assert.equal(err.details.code, "INVALID_INPUT");
			assert.match(err.details.message, /non-empty systemPrompt/);
			return true;
		},
	);
});

test("factory.spawn rejects empty prompt", () => {
	const factory = createFactory({} as any, "r1", new ObservabilityStore());

	assert.throws(
		() => factory.spawn({ agent: "test", systemPrompt: "You are a tester.", prompt: "", model: "opus" }),
		(err: unknown) => {
			assert.ok(err instanceof FactoryError);
			assert.equal(err.details.code, "INVALID_INPUT");
			assert.match(err.details.message, /non-empty prompt/);
			return true;
		},
	);
});

test("factory.spawn rejects empty model", () => {
	const factory = createFactory({} as any, "r1", new ObservabilityStore());

	assert.throws(
		() => factory.spawn({ agent: "test", systemPrompt: "You are a tester.", prompt: "do stuff", model: "" }),
		(err: unknown) => {
			assert.ok(err instanceof FactoryError);
			assert.equal(err.details.code, "INVALID_INPUT");
			assert.match(err.details.message, /non-empty 'model'/);
			return true;
		},
	);
});
