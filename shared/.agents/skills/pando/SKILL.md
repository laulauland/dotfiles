---
name: pando
description: Create and operate per-feature copy-on-write Pando workspaces, optionally backed by persistent BoxLite microVMs with native jj integration. Use for any mention of pando/pd or /pando, requests such as "create a /pando workspace for <rev>", isolated parallel work that should preserve build caches, or requests to run coding-agent hands inside a Pando VM.
---

# Pando

Pando (`pando`, alias `pd`) clones the current directory with CoW storage and registers a native jj workspace when applicable. A workspace may also own a persistent BoxLite microVM.

## Choose the execution shape

- Use a normal Pando workspace for cheap parallel filesystem isolation with inherited untracked state.
- Use a Pando VM when the user asks for a VM/sandbox, when configured defaults enable one, or when build/test commands should execute away from the host.
- Keep planning, file inspection, and patching on the host. Treat `pando exec` as the hands: the same CoW files appear at guest `/workspace`.
- Use plain `jj workspace add` only for a clean repo that does not need ignored state or runtime isolation.

## Natural-language trigger workflow

For requests like `create a /pando workspace for zx revision`:

1. Run from the canonical source directory, not an existing Pando workspace.
2. Derive a short valid name; names cannot contain whitespace or path separators.
3. Create with `pando create <name> --from '<revset>'`. The revset must resolve to one commit.
4. Read the printed absolute path. Use it as the host working directory.
5. Check `pando info <name> --json` to learn whether configured defaults attached a runtime.
6. If a runtime exists, run builds, tests, and executable tools with `pando exec <name> -- <argv...>`. Patch files through normal host tools in the printed workspace path.
7. Remove with `pando rm <name>` when the task is disposable.

Do not invent a `--source` flag. `create` always clones `$PWD`.
Standard colocated jj repositories are supported directly; do not create a temporary
`--no-colocate` clone or other staging repository before running `pando create`.

## Commands

```bash
pando create <name> [--from <revset>] [--runtime boxlite] [--no-runtime]
pando exec <name> -- <command> [args...]
pando shell <name>
pando stop <name>
pando list
pando info <name> --json
pando cd <name> --print
pando rm <name> [--keep-jj-workspace]
```

`exec` preserves argv and returns the guest exit status. `exec` and `shell` restart a stopped VM. `stop` retains the workspace, guest disk, and VM metadata but kills guest processes.

## Runtime defaults

Read `$PANDO_HOME/config.toml` (normally `~/.pando/config.toml`). A useful Linux configuration is:

```toml
[runtime]
runtime = "boxlite"
image = "alpine:3.22"
cpus = 2
memory_mib = 512
allow_unqualified_seccomp = true
```

With this file, `pando create <name>` creates a VM automatically. Explicit CLI values override config. Use `--no-runtime` for a host-only exception. VM runtimes are supported only on Linux x86_64/KVM in Pando 0.4; on macOS, leave runtime unconfigured and use host-only workspaces.

Never add the Linux seccomp acknowledgement silently. It records that BoxLite 0.9.7's provider filter is disabled on the qualified Linux path; VM isolation, sealed mounts, resource limits, and disabled networking remain, but seccomp is not qualified.

## VM and jj invariants

- Guest `/workspace` is the Pando CoW workspace, read-write.
- The canonical working copy is never mounted.
- For native jj repos, canonical `.jj/repo` is mounted read-write at the validated relative-pointer destination.
- Standard colocated jj repos are supported: canonical `.git` is also mounted read-write at its validated `git_target` destination, while canonical working-copy files remain unavailable.
- Self-contained/non-colocated jj repos remain supported. Unusual symlinked, external, malformed, or overlapping store layouts fail closed.
- Separate jj workspaces can edit concurrently with normal stale-workspace recovery. Avoid deliberately overlapping repository mutations across host and guest: BoxLite's virtiofs does not propagate advisory locks, and Pando's live suite qualifies only its tested concurrent-operation envelope.
- On Linux, Pando installs the host `jj` into jj-backed guests during runtime creation, so use `pando exec <name> -- jj ...` directly. The temporary staging copy is removed before creation commits and does not remain in `/workspace`.
- Official 0.4 runtime support is Linux x86_64/KVM only. Apple Silicon release binaries remain host-only pending live HVF qualification.
- Pando provisions `jj`, not project runtimes. Select an OCI image containing tools such as Bun, Node, or Cargo; networking is disabled, so dependencies must be inherited or available from an image-provided offline cache.
- Networking is disabled; do not plan commands that require fetching dependencies unless they are already present in the workspace/image.
- Guest root disk and workspace persist across `stop`; guest processes do not.
- Host↔guest BSD `flock` and POSIX record locks are not coherent through BoxLite 0.9.7 virtiofs. Prefer atomic lock files/directories and avoid assuming advisory-lock interoperability.
- Pando journals create/remove and reconciles interrupted lifecycle work on the next command. Retry the Pando command; do not manually delete its provider/state directories.

## Agent working pattern

```bash
workspace=$(pando create task-name --from '@-')
pando info task-name --json
# inspect/edit using host tools with cwd="$workspace"
pando exec task-name -- cargo test
pando exec task-name -- jj status
pando stop task-name
```

Use `pando shell` for a human interactive terminal, not for scripted agent work. Do not shell-join untrusted argv; pass each argument after `--`.

## State and inspection

State lives under `$PANDO_HOME` (default `~/.pando`):

```text
~/.pando/
├── config.toml
├── workspaces/<name>/
├── state/<name>/
└── runtime/boxlite/
```

Prefer `pando info <name> --json` and `pando list` over reading internal metadata. Linux x86_64 GitHub, Homebrew, install-script, and mise release artifacts include the optional runtime; host-only creation remains the default without runtime configuration.
