# Deployment

## Running as Web App

```bash
# Single notebook
uvx marimo run --sandbox notebook.py

# Folder of notebooks
uvx marimo run --sandbox folder/
```

The `--sandbox` flag ensures each notebook uses its own isolated environment with PEP 723 dependencies.

## Thumbnails

Generate OpenGraph thumbnails for notebook overview pages:

```bash
# Single notebook
uvx marimo export thumbnail notebook.py

# Folder
uvx marimo export thumbnail folder/
```

Thumbnails are stored at `__marimo__/assets/<notebook_stem>/opengraph.png`. You can also place screenshots there manually.

## OpenGraph Metadata

Add metadata via PEP 723 for display in notebook overview pages:

```python
# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "marimo",
#     "polars==1.37.1",
# ]
# [tool.marimo.opengraph]
# title = "My dashboard"
# description = "Tracking my portfolio over time"
# ///
```
