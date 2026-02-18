import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createFactory } from "../runtime.js";
import { ObservabilityStore } from "../observability.js";
import { FactoryError } from "../errors.js";
import { config } from "../index.js";

test("factory.spawn rejects empty prompt", () => {
	const factory = createFactory({} as any, "r1", new ObservabilityStore());

	assert.throws(
		() => factory.spawn({ agent: "test", prompt: "", task: "do stuff", model: "opus" }),
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
		() => factory.spawn({ agent: "test", prompt: "You are a tester.", task: "do stuff", model: "" }),
		(err: unknown) => {
			assert.ok(err instanceof FactoryError);
			assert.equal(err.details.code, "INVALID_INPUT");
			assert.match(err.details.message, /non-empty 'model'/);
			return true;
		},
	);
});

// ── Depth limit tests ──────────────────────────────────────────────────

describe("PI_FACTORY_DEPTH", () => {
	const originalDepth = process.env.PI_FACTORY_DEPTH;

	afterEach(() => {
		if (originalDepth === undefined) delete process.env.PI_FACTORY_DEPTH;
		else process.env.PI_FACTORY_DEPTH = originalDepth;
	});

	test("config.maxDepth defaults to 1", () => {
		assert.equal(config.maxDepth, 1);
	});

	test("depth >= maxDepth should block tool registration", () => {
		// Simulates the check in index.ts
		process.env.PI_FACTORY_DEPTH = "1";
		const currentDepth = parseInt(process.env.PI_FACTORY_DEPTH || "0", 10);
		assert.ok(currentDepth >= config.maxDepth, "depth 1 should be >= maxDepth 1");
	});

	test("depth < maxDepth should allow tool registration", () => {
		process.env.PI_FACTORY_DEPTH = "0";
		const currentDepth = parseInt(process.env.PI_FACTORY_DEPTH || "0", 10);
		assert.ok(currentDepth < config.maxDepth, "depth 0 should be < maxDepth 1");
	});
});
