# UI Components

marimo has a rich set of UI components. All are accessed via `mo.ui.*`.

## Available Components

- `mo.ui.altair_chart(chart)` — reactive Altair chart
- `mo.ui.button(value=None, kind='primary')` — clickable button
- `mo.ui.run_button(label=None)` — button that triggers cell execution
- `mo.ui.checkbox(label='', value=False)` — checkbox
- `mo.ui.chat(placeholder='')` — chat interface
- `mo.ui.date(value=None, label=None)` — date picker
- `mo.ui.dropdown(options, value=None, label=None)` — dropdown menu
- `mo.ui.file(label='', multiple=False)` — file upload
- `mo.ui.number(value=None, label=None)` — number input
- `mo.ui.radio(options, value=None, label=None)` — radio buttons
- `mo.ui.refresh(options, default_interval)` — refresh control
- `mo.ui.slider(start, stop, value=None, label=None, step=None)` — slider
- `mo.ui.range_slider(start, stop, value=None, label=None, step=None)` — range slider
- `mo.ui.table(data, sortable=True, filterable=True)` — interactive table
- `mo.ui.text(value='', label=None)` — text input
- `mo.ui.text_area(value='', label=None)` — multi-line text input
- `mo.ui.data_explorer(df)` — interactive dataframe explorer
- `mo.ui.dataframe(df)` — dataframe with search/filter/sort
- `mo.ui.plotly(figure)` — reactive Plotly chart
- `mo.ui.tabs(elements: dict)` — tabbed interface
- `mo.ui.array(elements: list)` — array of UI elements
- `mo.ui.form(element, label='')` — wrap element in a submit form

## Forms with batch

`.batch()` binds named UI elements into a markdown template. `.form()` adds a submit button so values are only sent on submit:

```python
form = (
    mo.md("""
        **Choose an option**
        {choice}

        **Enter some text**
        {text}
    """)
    .batch(
        choice=mo.ui.dropdown(options=["A", "B", "C"]),
        text=mo.ui.text(),
    )
    .form(
        submit_button_label="Submit",
        show_clear_button=True,
        clear_on_submit=False,
    )
)
form
```

## Form Validation

```python
dropdown = mo.ui.dropdown(
    options=columns,
    label="Select column",
    allow_select_none=True,
    value=None,
    searchable=True,
).form(
    submit_button_label="Apply",
    validate=lambda v: "Please select a column" if v is None else None,
)
```

The `validate` function returns an error message string to block submission, or `None` to allow it.

## Custom Display

Any class can implement `_display_()` to control its rendering in marimo:

```python
class Dice:
    def _display_(self):
        import random
        return f"You rolled {random.randint(1, 6)}"
```
