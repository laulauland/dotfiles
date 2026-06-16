# Exports

marimo notebooks can be exported to multiple formats.

## Available Formats

```
uvx marimo export --help

Commands:
  html       Export as HTML file
  html-wasm  Export as WASM-powered marimo notebook
  ipynb      Export as Jupyter notebook
  md         Export as code-fenced markdown
  pdf        Export as PDF
  script     Export as flat Python script
  session    Execute and export session snapshots
  thumbnail  Generate OpenGraph thumbnails
```

## PDF Export

```bash
uvx marimo export pdf notebook.py -o notebook.pdf
```

Requires: `uv pip install nbformat nbconvert && playwright install chromium`

Flags:
- `--no-include-inputs` — hide code cells, show only outputs
- `--no-include-outputs` — include only code, skip outputs
- `--as=slides` — export as slide deck PDF (uses reveal.js boundaries)
- `--raster-scale 4.0` — output sharpness (1.0–4.0, default 4.0)
- `--raster-server=live` — use when widgets need a running Python kernel

## Script Export

```bash
uvx marimo export script notebook.py -o notebook.script.py
```

## Common Flags

- `-o`, `--output` — output file path
- `--watch` — re-export on file changes
- `--sandbox` — run in isolated uv environment
- `-f`, `--force` — overwrite existing output
- `--` — pass CLI arguments to notebook: `uvx marimo export html notebook.py -o out.html -- --arg value`
- `-y` — auto-yes to prompts: `uvx marimo -y CMD ...`
