# API

## CLI: roger

```bash
npx @penrose/roger trio diagram.substance diagram.style diagram.domain > output.svg
npx @penrose/roger trio config.trio.json > output.svg
npx @penrose/roger watch              -- watch for changes
```

trio.json format (style accepts an array for composition):
```json
{
  "substance": "./tree.substance",
  "style": ["./euler.style"],
  "domain": "./setTheory.domain",
  "variation": "PlumvilleCapybara104"
}
```

## Programmatic API (@penrose/core)

```typescript
import { compile, optimize, toSVG, showError } from "@penrose/core";

const trio = {
  substance: "Set A, B\nSubset(A, B)\nAutoLabel All",
  style: "canvas { width = 400\nheight = 400 }\n...",
  domain: "type Set\npredicate Subset(Set s1, Set s2)",
  variation: "seed42",
};

const compiled = await compile(trio);
if (compiled.isErr()) throw new Error(showError(compiled.error));

const optimized = optimize(compiled.value);
if (optimized.isErr()) throw new Error(showError(optimized.error));

const svg = await toSVG(optimized.value, async () => undefined);
```

React: `import { Embed } from "@penrose/components"` — takes `domain`, `substance`, `style`, `variation` props.

