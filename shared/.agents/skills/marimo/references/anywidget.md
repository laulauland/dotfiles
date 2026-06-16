# Custom Widgets with anywidget

Build custom interactive widgets using vanilla JavaScript and Python traitlets.

## Basic Pattern

```python
import anywidget
import traitlets

class CounterWidget(anywidget.AnyWidget):
    _esm = """
    function render({ model, el }) {
      let count = () => model.get("number");
      let btn = document.createElement("button");
      btn.innerHTML = `count is ${count()}`;
      btn.addEventListener("click", () => {
        model.set("number", count() + 1);
        model.save_changes();
      });
      model.on("change:number", () => {
        btn.innerHTML = `count is ${count()}`;
      });
      el.appendChild(btn);
    }
    export default { render };
    """
    _css = """button { font-size: 14px; }"""
    number = traitlets.Int(0).tag(sync=True)

widget = mo.ui.anywidget(CounterWidget())
widget

# Access value from another cell
print(widget.value["number"])
```

## Rules

- Use vanilla JavaScript in `_esm` — define a `render({ model, el })` function
- `model.get(name)` to read traits, `model.set(name, value)` + `model.save_changes()` to update
- `model.on("change:traitname", callback)` to listen for changes
- Always end with `export default { render };`
- Always wrap with `mo.ui.anywidget()` — access values via `widget.value` (returns a dict)
- Keep CSS minimal, support both light and dark mode via `@media (prefers-color-scheme: dark)`
- For complex widgets, point `_esm` and `_css` to external files
- Keep file paths relative to project directory; use `Path(__file__)` for resolution
