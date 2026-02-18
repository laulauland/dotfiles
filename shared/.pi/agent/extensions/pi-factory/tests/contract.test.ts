import test from "node:test";
import assert from "node:assert/strict";
import { validateParams } from "../contract.js";

test("accepts valid params with task and code", () => {
	const params = validateParams({
		task: "run pipeline",
		code: "await factory.spawn({ agent: 'worker', prompt: 'test', task: 'do work', model: 'opus' });",
	});
	assert.equal(params.task, "run pipeline");
	assert.equal(typeof params.code, "string");
});

test("accepts valid minimal params", () => {
	const params = validateParams({
		task: "some task",
		code: "factory.observe.log('info', 'hello');",
	});
	assert.equal(params.task, "some task");
});

test("rejects missing task", () => {
	assert.throws(
		() => validateParams({ task: "", code: "factory.observe.log('info', 'test');" }),
		(err: any) => err.details.code === "INVALID_INPUT",
	);
});

test("rejects whitespace-only task", () => {
	assert.throws(
		() => validateParams({ task: "   ", code: "factory.observe.log('info', 'test');" }),
		(err: any) => err.details.code === "INVALID_INPUT",
	);
});

test("rejects missing code", () => {
	assert.throws(
		() => validateParams({ task: "do something", code: "" }),
		(err: any) => err.details.code === "INVALID_INPUT",
	);
});

test("rejects whitespace-only code", () => {
	assert.throws(
		() => validateParams({ task: "do something", code: "   " }),
		(err: any) => err.details.code === "INVALID_INPUT",
	);
});
