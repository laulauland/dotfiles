import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pollForExit } from "../herdr.ts";
import { clearSubagentExitSidecar } from "../session.ts";

function withTempSession(sidecar: unknown): string {
  const directory = mkdtempSync(join(tmpdir(), "herdr-subagents-test-"));
  const sessionFile = join(directory, "child.jsonl");
  writeFileSync(`${sessionFile}.exit`, JSON.stringify(sidecar));
  return sessionFile;
}

test("pollForExit consumes a settled sidecar without consulting Herdr", async () => {
  const sessionFile = withTempSession({ type: "settled" });
  try {
    const result = await pollForExit(
      { paneId: "test-pane" },
      new AbortController().signal,
      { interval: 1, sessionFile, existsSync, readFileSync, rmSync },
    );
    expect(result).toEqual({ reason: "settled", exitCode: 0 });
    expect(existsSync(`${sessionFile}.exit`)).toBe(false);
  } finally {
    rmSync(dirname(sessionFile), { recursive: true, force: true });
  }
});

test("resume clears a stale completion sidecar", () => {
  const sessionFile = withTempSession({ type: "settled" });
  try {
    clearSubagentExitSidecar(sessionFile);
    expect(existsSync(`${sessionFile}.exit`)).toBe(false);
  } finally {
    rmSync(dirname(sessionFile), { recursive: true, force: true });
  }
});

test("pollForExit rejects unknown sidecar shapes as failures", async () => {
  const sessionFile = withTempSession({ type: "unexpected" });
  try {
    const result = await pollForExit(
      { paneId: "test-pane" },
      new AbortController().signal,
      { interval: 1, sessionFile, existsSync, readFileSync, rmSync },
    );
    expect(result.reason).toBe("done");
    expect(result.exitCode).toBe(1);
    expect(result.errorMessage).toContain("unknown type");
  } finally {
    rmSync(dirname(sessionFile), { recursive: true, force: true });
  }
});
