import { existsSync, lstatSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, parse } from "node:path";

export interface PreloadedSkill {
  name: string;
  content: string;
}

function isUnsafeName(name: string): boolean {
  return name.includes("..") || name.includes("/") || name.includes("\\") || name.trim() !== name || name.length === 0;
}

function safeReadFile(path: string): string | undefined {
  try {
    if (!existsSync(path)) return undefined;
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) return undefined;
    return readFileSync(path, "utf8").trim();
  } catch {
    return undefined;
  }
}

function ancestorDirs(cwd: string): string[] {
  const dirs: string[] = [];
  let current = cwd;
  while (true) {
    dirs.push(current);
    const parent = dirname(current);
    if (parent === current || current === parse(current).root) break;
    current = parent;
  }
  return dirs;
}

function skillDirs(cwd: string): string[] {
  const dirs = [
    join(cwd, ".pi", "skills"),
    join(cwd, ".claude", "skills"),
    join(homedir(), ".pi", "agent", "skills"),
    join(homedir(), ".pi", "skills"), // legacy location used by pi-subagents
    join(homedir(), ".agents", "skills"),
    join(homedir(), ".claude", "skills"),
  ];

  for (const dir of ancestorDirs(cwd)) {
    dirs.push(join(dir, ".agents", "skills"));
  }

  return [...new Set(dirs)];
}

function tryReadSkill(dir: string, name: string): string | undefined {
  // pi-subagents-style flat files: <dir>/<name>.md, .txt, or no extension.
  for (const ext of [".md", ".txt", ""]) {
    const content = safeReadFile(join(dir, name + ext));
    if (content !== undefined) return content;
  }

  // Agent Skills standard: <dir>/<name>/SKILL.md.
  return safeReadFile(join(dir, name, "SKILL.md"));
}

function findAndReadSkill(name: string, cwd: string): string | undefined {
  for (const dir of skillDirs(cwd)) {
    const content = tryReadSkill(dir, name);
    if (content !== undefined) return content;
  }
  return undefined;
}

export function preloadSkills(skillNames: string[], cwd: string): PreloadedSkill[] {
  return skillNames.map((name) => {
    if (isUnsafeName(name)) {
      return { name, content: `(Skill "${name}" skipped: name contains path traversal characters)` };
    }
    return {
      name,
      content: findAndReadSkill(name, cwd) ?? `(Skill "${name}" not found in project/global pi, agents, or Claude skill directories)`,
    };
  });
}
