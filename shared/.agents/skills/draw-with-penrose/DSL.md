# DSL

## The Three-File System

### Domain (.domain) — Vocabulary

Defines types, predicates, functions, and constructors. No rendering.

```
type Set
type Point
type Vector
type Atom
type Hydrogen <: Atom                          -- subtype

predicate Subset(Set s1, Set s2)
predicate Disjoint(Set, Set)                   -- unnamed args ok
symmetric predicate Bond(Atom, Atom)           -- Bond(a,b) == Bond(b,a)

function addVector(Vector v1, Vector v2) -> Vector
constructor Hydrogen(Atom a)                   -- return type inferred from name
```

Reserved types `String` and `Number` cannot be redeclared or subtyped. Comments use `--`.

### Substance (.substance) — Content

Declares specific objects and relationships. No visuals.

```
Set A, B, C
Subset(A, C)
Subset(B, C)
Disjoint(A, B)

Vector u := addVector(v, w)     -- function application with assignment
Let p := midpoint(A, B)         -- Let keyword form

AutoLabel All                   -- use variable names as labels
Label A $\mathcal{A}$           -- TeX label
NoLabel B                       -- suppress label
```

Indexed statements expand into multiples:
```
Vector v_i for i in [0, 3]
Orthogonal(v_i, v_j) for i in [0, 1], j in [2, 3] where i != j
```
Always space around operators in index filters: `i + 1`, not `i+1` (tokenizer bug).

### Style (.style) — Representation

Maps substance to visuals. Three block types: canvas (mandatory), namespaces, selectors.

```
canvas {
  width = 800
  height = 700
}

color {
  primary = #2563eb
  dark    = #1e293b
}

forall Set x {
  shape x.icon = Circle { }
  shape x.text = Equation {
    string: x.label
    fontSize: "32px"
  }
  ensure contains(x.icon, x.text)
  encourage norm(x.text.center - x.icon.center) == 0
  layer x.text above x.icon
}

forall Set x; Set y
where Subset(x, y) {
  ensure contains(y.icon, x.icon, 5)
  ensure disjoint(y.text, x.icon, 10)
  layer x.icon above y.icon
}
```

Selector patterns:
- `forall Type x` — matches every object of that type
- `where Pred(x, y)` — filter by predicate
- `where Pred(x, y) as r` — alias the predicate match
- `` forall Set `A` `` — backtick matches exactly one substance object
- `where s has label` — guard against missing label
- `repeatable` — allow same substance object in multiple variable slots

Assignments:
- `shape x.icon = Circle { }` — bound (persists across selectors)
- `localVar = 42` — local to this block
- `override x.icon.fillColor = rgba(1,0,0,1)` — modify previously set field
- `delete x.icon` — remove previously declared shape

