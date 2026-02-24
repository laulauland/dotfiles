---
name: marimo
description: "Create, edit, and structure marimo reactive notebooks (.py files). Triggers: any mention of \"marimo\", \"marimo notebook\", requests for reactive notebooks, experiment notebooks, or notebooks that should also run as scripts. Use when creating data experiments, analysis notebooks, or Python notebooks with inline dependencies. Also use when the user wants notebooks with embedded package requirements (PEP 723), dual notebook/script execution, parameterized experiments, persistent caching, or data snapshots. Assumes uv as the package manager. Do NOT use for Jupyter notebooks or plain Python scripts unrelated to marimo."
---

# Marimo Notebook Creation

Marimo notebooks are pure `.py` files that function simultaneously as reactive notebooks, CLI scripts, and web apps. They use a dataflow graph (not cell order) to determine execution.

## uv-First Workflow

Always use `--sandbox` mode to embed deps in the notebook file via PEP 723:

```bash
# Create/edit with isolated env (deps tracked automatically)
uvx marimo edit --sandbox notebook.py

# Run as script (uv resolves deps from header)
uv run notebook.py

# Run as read-only app
uvx marimo run --sandbox notebook.py
```

When the user imports a package in the editor, marimo auto-adds it to the PEP 723 header. Removing an import does NOT auto-remove the dep — use the package manager panel.

## PEP 723 Header Format

Every notebook file starts with this comment block. Include marimo config here too:

```python
# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "marimo",
#     "pandas==2.2.3",
#     "polars>=1.0",
#     "altair",
# ]
#
# [tool.marimo.runtime]
# on_cell_change = "lazy"
#
# [tool.uv.sources]
# my-package = { path = "../", editable = true }
# ///
```

Set `on_cell_change = "lazy"` for expensive experiment notebooks — marks dependents as stale instead of auto-running.

## Notebook Skeleton

Every marimo notebook follows this structure:

```python
# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "marimo",
# ]
# ///

import marimo

__generated_with = "0.12.0"
app = marimo.App(width="medium")


@app.cell
def _():
    import marimo as mo
    return (mo,)


@app.cell
def _(mo):
    mo.md("# My Notebook")
    return


# ... more cells ...


if __name__ == "__main__":
    app.run()
```

Rules:
- Each cell is a function decorated with `@app.cell`
- Cell args = variables it reads from other cells (reactive deps)
- Cell return tuple = variables it exposes to other cells
- `_` as function name = anonymous cell (most cells)
- Named functions = importable/testable cells
- `if __name__ == "__main__": app.run()` at the bottom always

## Dual-Mode Pattern (Notebook + Script)

Use `argparse` with UI widget defaults for parameters that should be configurable in both modes:

```python
@app.cell
def _(mo):
    # Interactive default in notebook mode
    lr_widget = mo.ui.number(value=1e-3, step=1e-4, label="Learning rate")
    lr_widget
    return (lr_widget,)


@app.cell
def _(argparse, lr_widget):
    parser = argparse.ArgumentParser()
    parser.add_argument("--lr", type=float, default=lr_widget.value)
    parser.add_argument("--output", type=str, default="results.json")
    args = parser.parse_args()
    return (args,)
```

Script: `uv run experiment.py --lr=0.01 --output=run_42.json`
Notebook: `uvx marimo edit --sandbox experiment.py` (uses widget values)
Pass args in notebook: `marimo edit experiment.py -- --lr=0.01`

## Cell Best Practices

1. **Minimal globals.** Prefix intermediates with `_` (cell-local) or wrap in functions.
2. **Never mutate across cells.** Create new objects instead:
   ```python
   # WRONG: cell 1 creates df, cell 2 does df.drop(...)
   # RIGHT: cell 2 does cleaned_df = df.drop(...)
   ```
3. **Idempotent cells.** Same inputs → same outputs. Required for caching correctness.
4. **Gate expensive cells** with `mo.stop`:
   ```python
   @app.cell
   def _(mo, run_button):
       mo.stop(not run_button.value, mo.md("Click Run to execute"))
       result = expensive_computation()
       return (result,)
   ```
5. **Extract to modules.** For complex shared logic, put it in `.py` modules and import. Enable module autoreload in marimo runtime config.
6. **Cell output rules.** The last expression in a cell becomes its visible output. Only ONE output per cell this way. If you need multiple outputs, either:
   - Use `mo.vstack([item1, item2, item3])` as the last expression
   - Use `mo.output.append(...)` for incremental output (e.g. progress updates in a loop)

   **Critical:** if you use `mo.output.append(...)` for multiple outputs, do NOT also have a bare last expression — it replaces everything appended. Either use `mo.output.append()` for ALL outputs including the last, or use `mo.vstack()` as the single last expression.
   ```python
   # WRONG: last expression replaces all appended output
   mo.output.append(mo.md("Step 1 done"))
   mo.output.append(mo.ui.table(results))
   mo.md("Finished")  # this REPLACES everything above

   # RIGHT: append everything
   mo.output.append(mo.md("Step 1 done"))
   mo.output.append(mo.ui.table(results))
   mo.output.append(mo.md("Finished"))

   # RIGHT: single composed output
   mo.vstack([mo.md("Step 1 done"), mo.ui.table(results), mo.md("Finished")])
   ```

## Data Snapshots

Two separate concerns — don't conflate them:

### 1. Session caching (skip recomputation on restart)

Use `mo.persistent_cache` — stores pickles in `__marimo__/cache/`. Opaque, not for sharing.

```python
@app.cell
def _(mo, raw_data):
    with mo.persistent_cache("cleaned"):
        cleaned = expensive_cleaning(raw_data)  # skipped on cache hit
    return (cleaned,)
```

Or as decorator:

```python
@app.cell
def _(mo):
    @mo.persistent_cache
    def compute_embeddings(texts: list[str], model: str) -> np.ndarray:
        return api.embed(texts, model)
    return (compute_embeddings,)
```

Cache invalidates when source code or upstream cell code changes. Add `**/__marimo__/cache/` to `.gitignore`.

See [references/caching.md](references/caching.md) for cache key semantics and gotchas.

### 2. Explicit snapshots (for cross-script analysis)

Write results to a known path in a portable format. This is what other scripts (or Claude Code) should parse:

```python
@app.cell
def _(results_df, args):
    output_path = Path(f"data/snapshots/{args.experiment_id}.parquet")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    results_df.write_parquet(output_path)
    return
```

Prefer parquet (polars/pandas) or JSON for structured data. These are the contract between experiment notebooks and analysis scripts.

## Reusing Code Across Notebooks

### Top-level functions (importable without running the notebook)

Use `app.setup` for shared imports and `@app.function` for exportable functions:

```python
with app.setup:
    import numpy as np

@app.function
def calculate_stats(data):
    return {"mean": np.mean(data), "std": np.std(data)}
```

From elsewhere: `from my_notebook import calculate_stats`

Constraints: functions can only reference setup cell symbols + other top-level functions. No regular cell variables.

### Named cell reuse

```python
# In experiment.py
@app.cell
def load_data(mo):
    df = expensive_load()
    return (df,)
```

```python
# In analysis.py
from experiment import load_data
output, defs = load_data.run()
df = defs["df"]
```

## Experiment Organization

Recommended layout for a project with multiple experiments:

```
project/
├── pyproject.toml              # optional, for project-mode
├── src/my_lib/                 # shared analysis code (plain Python)
├── experiments/
│   ├── 001_baseline.py         # sandboxed marimo notebooks
│   ├── 002_hypothesis_a.py
│   └── 003_hypothesis_b.py
├── analysis/
│   └── compare_runs.py         # marimo notebook or plain uv script
├── data/
│   ├── raw/                    # input data
│   └── snapshots/              # experiment outputs (parquet/JSON)
└── .gitignore                  # include **/__marimo__/cache/
```

Each experiment notebook is self-contained (sandboxed deps). Analysis scripts read from `data/snapshots/`.

## Validation

After creating or editing a marimo notebook, always run `marimo check --fix` on the file to fix common issues (unused variables in return tuples, missing returns, cell ordering):

```bash
marimo check --fix path/to/notebook.py
```

This is a required step — do not skip it.

## Generating a Notebook

Run the init script to generate a properly structured notebook:

```bash
python scripts/init_marimo.py <name> [--deps dep1 dep2] [--lazy] [--with-args]
```

See `scripts/init_marimo.py` for the generator. Always review and customize the output.
