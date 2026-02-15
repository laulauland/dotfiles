import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createProgramRuntime } from "../runtime.js";
import { ObservabilityStore } from "../observability.js";
import { FactoryError } from "../errors.js";
import { config } from "../index.js";

test("rt.join rejects non-handle input with clear hint", () => {
	const rt = createProgramRuntime({} as any, "r1", new ObservabilityStore());

	assert.throws(
		() => (rt as any).join({ taskId: "task-1", text: "ok" }),
		(err: unknown) => {
			assert.ok(err instanceof FactoryError);
			assert.equal(err.details.code, "INVALID_INPUT");
			assert.match(err.details.message, /rt\.join\(\) expects a SpawnHandle/);
			assert.match(err.details.message, /awaited rt\.spawn\(\)/);
			return true;
		},
	);
});

test("rt.join rejects invalid handle arrays", () => {
	const rt = createProgramRuntime({} as any, "r1", new ObservabilityStore());

	assert.throws(
		() => (rt as any).join([{ taskId: "task-1" }]),
		(err: unknown) => {
			assert.ok(err instanceof FactoryError);
			assert.equal(err.details.code, "INVALID_INPUT");
			assert.match(err.details.message, /SpawnHandle\[]/);
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
