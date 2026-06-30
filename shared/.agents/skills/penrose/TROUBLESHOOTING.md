# Troubleshooting

## Gotchas

1. **Tokenizer bug** — `2+1` parses as two tokens. Always write `2 + 1` with spaces.
2. **Canvas is mandatory** — every style file needs `canvas { width = ..., height = ... }`.
3. **Namespace values are immutable** after declaration.
4. **Group shapes must be pre-declared** — no inline shape declarations inside `Group { shapes: [...] }`.
5. **`random()` is not optimizable** — it's fixed to the variation seed. Only `?` values are optimized.
6. **`?[hint]` must be a literal** — `?[1 + 1]` is invalid, use `?[2]`.
7. **Variation string seeds layout** — same variation always produces the same diagram.
8. **Symmetric predicates** must be binary with identical arg types.
9. **Passthrough SVG properties** must be strings or numbers, not booleans.

