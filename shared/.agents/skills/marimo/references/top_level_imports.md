# Top-Level Imports and Exports

Make notebook functions importable without running the full notebook.

## `app.setup` and `@app.function`

```python
import marimo

app = marimo.App(width="medium")

with app.setup:
    import numpy as np

@app.function
def calculate_statistics(data):
    """Calculate basic statistics for a dataset."""
    return {
        "mean": np.mean(data),
        "median": np.median(data),
        "std": np.std(data),
    }

@app.cell
def _():
    import marimo as mo
    return

if __name__ == "__main__":
    app.run()
```

## Importing from Another Script

```python
from my_notebook import calculate_statistics

data = [1, 2, 3, 4, 5]
stats = calculate_statistics(data)
```

## Constraints

- The cell must define just a single function or class
- The function/class can only refer to symbols defined in the setup cell or to other top-level symbols
- Maximum one `app.setup` cell per notebook
