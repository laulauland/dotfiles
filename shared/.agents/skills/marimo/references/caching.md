# Caching Reference

## Cache Types

| Type | Storage | Survives restart | Use case |
|------|---------|-----------------|----------|
| `mo.cache` | Memory | No | Intermediate computations within a session |
| `mo.persistent_cache` | Disk (`__marimo__/cache/`) | Yes | Expensive computations you want to skip on restart |
| `mo.lru_cache` | Memory (bounded) | No | Functions called many times with varying args |

All three work as both decorators and context managers.

## Cache Key Construction

The cache key hashes:
1. Source code of the cached block/function
2. Source code of all ancestor cells
3. Contents of input variables (when hashable)
4. Falls back to execution path if variable contents aren't hashable

This means cache auto-invalidates when you change code or upstream code changes.

## `pin_modules=True`

```python
@mo.persistent_cache(pin_modules=True)
def compute(data):
    ...
```

Invalidates cache when imported module versions change (checks `__version__` attribute).

## Context Manager Form

```python
with mo.persistent_cache("my_name"):
    x = expensive_fn(data)
    y = another_fn(x)
    # print() and side effects are also skipped on cache hit
```

All variables assigned inside the block are cached together. Block name must be unique within the notebook.

## Decorator Form

```python
@mo.persistent_cache
def compute(data: str, n: int) -> np.ndarray:
    return slow_api_call(data, n)

# First call with these args: runs and caches
# Second call with same args: returns cached result
result = compute("hello", 42)
```

## Gotchas

- **Return values must be picklable.** Polars DataFrames work in recent versions. Custom objects need `__getstate__`/`__setstate__` or pickle support.
- **Mutations break caching.** If you mutate a cached variable in a downstream cell, the cache won't know. Always create new objects.
- **Non-deterministic inputs.** If an upstream cell uses `random()` or `datetime.now()` without seeding, cache hits may serve stale data. Seed RNGs explicitly.
- **Async support.** Use `@mo.persistent_cache` on `async def` functions — works the same way.
- **Disk usage.** Caches accumulate in `__marimo__/cache/`. No auto-cleanup yet. Delete manually or add to `.gitignore`.
- **External module changes with decorators that don't use `functools.wraps`** — cache key may not detect the change. Use `pin_modules=True` as a safeguard.
