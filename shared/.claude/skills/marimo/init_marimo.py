#!/usr/bin/env python3
"""Generate a properly structured marimo notebook skeleton.

Usage:
    python init_marimo.py output.py [--deps dep1 dep2 ...] [--lazy] [--with-args]

Examples:
    python init_marimo.py experiment.py --deps pandas polars altair --lazy --with-args
    python init_marimo.py analysis.py --deps polars
"""

import argparse
import sys
from pathlib import Path


def build_notebook(deps: list[str], lazy: bool, with_args: bool) -> str:
    # PEP 723 header
    dep_lines = ''.join(f'#     "{d}",\n' for d in ["marimo"] + deps)
    header = f"# /// script\n# requires-python = \">=3.12\"\n# dependencies = [\n{dep_lines}# ]\n"
    if lazy:
        header += "#\n# [tool.marimo.runtime]\n# on_cell_change = \"lazy\"\n"
    header += "# ///"

    cells = []

    # Cell: imports
    cells.append('''
@app.cell
def _():
    import marimo as mo
    return (mo,)''')

    if with_args:
        cells.append('''
@app.cell
def _():
    import argparse
    return (argparse,)''')

    # Cell: title
    cells.append('''
@app.cell
def _(mo):
    mo.md("""# Experiment Title\\n\\nDescribe the hypothesis or goal here.""")
    return''')

    if with_args:
        # Cell: parameters (dual-mode)
        cells.append('''
@app.cell
def _(mo):
    param_widget = mo.ui.number(value=1.0, step=0.1, label="Parameter")
    param_widget
    return (param_widget,)''')

        cells.append('''
@app.cell
def _(argparse, param_widget):
    _parser = argparse.ArgumentParser()
    _parser.add_argument("--param", type=float, default=param_widget.value)
    _parser.add_argument("--output-dir", type=str, default="data/snapshots")
    _parser.add_argument("--experiment-id", type=str, default="default")
    args = _parser.parse_args()
    return (args,)''')

    # Cell: data loading with cache
    cells.append('''
@app.cell
def _(mo):
    with mo.persistent_cache("data_load"):
        # TODO: load your data here
        data = {}
    return (data,)''')

    # Cell: computation
    cells.append('''
@app.cell
def _(data):
    # TODO: experiment logic here
    results = data
    return (results,)''')

    # Cell: visualization
    cells.append('''
@app.cell
def _(mo, results):
    mo.md(f"""## Results\\n\\n```\\n{results}\\n```""")
    return''')

    if with_args:
        # Cell: snapshot
        cells.append('''
@app.cell
def _(results, args):
    from pathlib import Path
    import json
    _out = Path(args.output_dir) / f"{args.experiment_id}.json"
    _out.parent.mkdir(parents=True, exist_ok=True)
    _out.write_text(json.dumps(results, default=str, indent=2))
    return''')

    cells_str = "\n\n".join(cells)

    return f'''{header}

import marimo

__generated_with = "0.12.0"
app = marimo.App(width="medium")

{cells_str}


if __name__ == "__main__":
    app.run()
'''


def main():
    parser = argparse.ArgumentParser(description="Generate a marimo notebook skeleton")
    parser.add_argument("output", type=Path, help="Output .py file path")
    parser.add_argument("--deps", nargs="*", default=[], help="Additional dependencies")
    parser.add_argument("--lazy", action="store_true", help="Set runtime to lazy mode")
    parser.add_argument("--with-args", action="store_true", help="Include argparse dual-mode pattern and snapshot cell")
    args = parser.parse_args()

    if args.output.exists():
        print(f"Error: {args.output} already exists", file=sys.stderr)
        sys.exit(1)

    content = build_notebook(args.deps, args.lazy, args.with_args)
    args.output.write_text(content)
    print(f"Created {args.output}")
    print(f"Edit with: uvx marimo edit --sandbox {args.output}")


if __name__ == "__main__":
    main()
