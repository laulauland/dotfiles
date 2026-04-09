# Testing with pytest

marimo notebooks are testable with pytest. Cells named `test_*` or containing test classes are auto-discovered.

## In-Notebook Tests

```python
@app.cell
def _():
    def inc(x):
        return x + 1
    return (inc,)

@app.cell
def test_sanity(inc):
    assert inc(3) == 4

@app.cell
def _(inc, pytest):
    @pytest.mark.parametrize(("x", "y"), [(3, 4), (4, 5)])
    def test_parameterized(x, y):
        assert inc(x) == y
    return
```

## Command-Line

```bash
pytest notebook.py
```

## Rules

- Only cells containing exclusively test functions/classes are executed by the test runner
- Helper functions, constants, variables, and imports must be in separate cells
- Test code includes: functions named `test_*`, classes named `Test*`, `@pytest.fixture` decorated functions

## Fixtures

Fixtures defined in `app.setup` can be used across cells:

```python
with app.setup:
    from fixtures import db_connection, sample_data

@app.cell
def _(sample_data):
    def test_data_loaded(sample_data):
        assert len(sample_data) > 0
```

Fixtures defined in one cell cannot be used in another cell (unless in setup). `conftest.py` fixtures are discovered automatically.

Fixtures can also be defined in the same cell as the tests that use them:

```python
@app.cell
def _(pytest):
    @pytest.fixture
    def temp_file():
        import tempfile
        with tempfile.NamedTemporaryFile() as f:
            yield f

    def test_writes_to_file(temp_file):
        temp_file.write(b"hello")
        temp_file.seek(0)
        assert temp_file.read() == b"hello"
```
