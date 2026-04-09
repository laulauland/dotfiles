# SQL in marimo

A SQL cell is a function call to `mo.sql()`. By default marimo uses DuckDB in-memory and can refer to dataframe variables in scope.

```python
@app.cell(hide_code=True)
def _(df, mo):
    grouped = mo.sql(
        f"""
        SELECT category, AVG(value) as mean
        FROM df
        GROUP BY category
        ORDER BY mean;
        """,
        output=False,
    )
    return (grouped,)
```

`mo.sql()` returns a polars dataframe by default (configurable to pandas).

## Signature

```python
mo.sql(query: str, *, output: bool = True, engine: Optional[DBAPIConnection] = None) -> Any
```

## Engines

### DuckDB

```python
import duckdb
conn = duckdb.connect("file.db", read_only=True)
```

### SQLAlchemy

```python
import sqlalchemy
engine = sqlalchemy.create_engine("sqlite:///:memory:")
```

### PyIceberg

```python
from pyiceberg.catalog.rest import RestCatalog
catalog = RestCatalog(
    name="catalog",
    warehouse="1234567890",
    uri="https://example.com",
    token="my-token",
)
```

Different engines support different SQL dialects.
