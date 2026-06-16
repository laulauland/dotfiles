# State Management

## Reactivity IS State Management

When a cell assigns a variable, all cells that read it re-run automatically. Widget values (`widget.value`) work the same way. No store, no session_state, no hooks needed.

## Don't Mutate Objects Across Cells

```python
# WRONG
items = [1, 2, 3]  # cell 1
items.append(4)     # cell 2 — marimo won't detect this

# RIGHT
items = [1, 2, 3]           # cell 1
extended_items = items + [4] # cell 2
```

## You Probably Don't Need `mo.state()`

In 99% of cases, built-in reactivity is enough:
- Reading widget values → use `widget.value` in another cell
- Combining multiple inputs → use `.batch().form()`
- Conditional data → use `if`/`else` in one cell

## When You Do Need `mo.state()`

Use `mo.state()` only for:
1. Accumulated state from callbacks (e.g., a todo list where button clicks add items)
2. Bidirectional UI sync (e.g., slider and number input showing the same value)

```python
# Todo list with accumulated state
@app.cell
def _(mo):
    get_items, set_items = mo.state([])
    return (get_items, set_items)

@app.cell
def _(mo, set_items):
    task = mo.ui.text(label="New task")
    add = mo.ui.button(
        label="Add",
        on_click=lambda _: set_items(lambda d: d + [task.value]),
    )
    mo.hstack([task, add])
    return

@app.cell
def _(mo, get_items):
    mo.md("\n".join(f"- {t}" for t in get_items()))
    return
```

```python
# Syncing two UI elements
@app.cell
def _(mo):
    get_n, set_n = mo.state(50)
    return (get_n, set_n)

@app.cell
def _(mo, get_n, set_n):
    slider = mo.ui.slider(0, 100, value=get_n(), on_change=set_n)
    number = mo.ui.number(0, 100, value=get_n(), on_change=set_n)
    mo.hstack([slider, number])
    return
```

## Warnings

- The cell calling `set_val()` does NOT re-run (unless `allow_self_loops=True`)
- Don't store UI elements inside state
- Don't use `on_change` when reading `.value` from another cell works
- Write idempotent cells — identical inputs produce identical outputs
