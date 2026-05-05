---
name: penrose
description: Create diagrams using Penrose — a constraint-based system that separates content from visual representation using three DSLs (domain, substance, style). Use when the user asks for set diagrams, graph layouts, geometry figures, architecture diagrams, entity-relationship diagrams, state machines, dependency graphs, or any relational diagram where automatic layout from constraints is valuable.
---

# Penrose Diagrams

Penrose turns declarative descriptions into diagrams via three files and an optimization engine. You describe *what* exists (substance), *how* to draw it (style), and *what vocabulary* is valid (domain). The optimizer handles layout by solving constraints.

The core abstraction — types, relationships, constraint-based positioning — is general. Anything you can model as "objects with relationships that have spatial meaning" is a good fit.

## When to Use Penrose vs Alternatives

Penrose excels when:
- Layout has non-trivial spatial constraints (containment, separation, proximity, alignment) that are tedious to hand-place
- You need custom visual semantics — shapes, colors, and spatial relationships that encode domain meaning
- The diagram type doesn't have a boxed tool (Mermaid, D2) that handles it natively
- You want to separate the data (substance) from the rendering (style) so the same content can be visualized differently

Good fits: set theory (Euler/Venn), graph theory, geometry, linear algebra, chemistry, category theory, service architecture, entity-relationship, state machines, dependency graphs, org charts, network topologies.

Use Mermaid or the visual-explainer skill instead for standard flowcharts, sequence diagrams, Gantt charts, or UI mockups — those tools have built-in conventions that save setup time.

## Workflow

1. Write the three files (.domain, .substance, .style)
2. Render with `roger` CLI: `npx @penrose/roger trio file.substance file.style file.domain > output.svg`
3. Open the SVG to verify

For programmatic use (TypeScript), use `@penrose/core` — see the API section below.

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

## Shapes Reference

Every shape defaults `ensureOnCanvas: true`. Properties marked "sampled" are randomly initialized and optimized.

### Circle
`center` (sampled), `r` (sampled), `fillColor` (sampled), `strokeWidth` (0), `strokeColor` (none()), `strokeStyle` ("solid"), `strokeDasharray` ("")

### Ellipse
Same as Circle but `rx`, `ry` instead of `r`.

### Rectangle
`center` (sampled), `width` (sampled), `height` (sampled), `fillColor` (sampled), `cornerRadius` (0), `rotation` (0)

### Line
`start` (sampled), `end` (sampled), `strokeColor` (black), `strokeWidth` (1), `startArrowhead` / `endArrowhead` ("none" — options: "arrowhead", "arrowhead-2"), `startArrowheadSize` / `endArrowheadSize` (1), `flipStartArrowhead` (false)

### Text
`string` ("defaultText"), `center` (sampled), `fillColor` (black), `fontSize` ("12px"), `fontFamily` ("sans-serif"), `fontWeight` (""), `fontStyle` (""), `textAnchor` ("middle"). Width/height auto-computed from bounding box.

### Equation
Like Text but renders TeX via MathJax. `fontSize` defaults "16px". `string` is math-mode TeX.

### Path
`d` (PathDataV, []), `strokeColor` (black), `strokeWidth` (1), `fillColor` (none()), arrowhead properties same as Line. Build `d` with: `pathFromPoints("open"/"closed", pts)`, `arc(...)`, `interpolateQuadraticFromPoints(...)`, `interpolatingSpline(type, pts, tension)`.

### Polygon
`points` (PtListV, triangle default), `scale` (1), fill/stroke properties.

### Polyline
Like Polygon but open path.

### Group
`shapes: [x.icon, x.text]` — all member shapes must be pre-declared. `clipPath: clip(x.boundary)` for clipping. Shapes cannot belong to multiple groups.

### Image
`href` (SVG files only), `center`, `width`, `height`, `preserveAspectRatio` ("").

## Values and Expressions

- Scalars: `42`, `3.14`, `?` (optimizer-controlled), `?[3.14]` (hint — literal only)
- Vectors: `(1, 2)`, access with `v[0]`, `v[1]`
- Matrices: `((1,0),(0,1))` — cannot index rows directly
- Colors: `rgba(0.5, 0.2, 0.8, 1.0)`, `hsva(240, 80, 100, 1.0)`, `#ff8800`, `#ff8800cc`, `none()`
- Strings: double-quoted, concat with `+`
- `nameof x` — substance variable name as string
- `random(min, max)` — fixed to variation seed, NOT optimizable
- Matrix composition: `translate(x,y) then rotate(θ) then scale(a,b)`

## Constraints and Objectives

`ensure` = hard constraint. `encourage` = soft objective. Comparison sugar: `a == b`, `a < b`, `a > b`.

Key constraint functions:
- `contains(outer, inner, padding)` — outer contains inner
- `disjoint(s1, s2, padding)` — shapes stay apart
- `overlapping(s1, s2, overlap)` — shapes overlap by at least `overlap`
- `touching(s1, s2, padding)` — shapes nearly contact
- `equal(x, y)`, `lessThan(x, y)`, `greaterThan(x, y)`
- `perpendicular(q, p, r)`, `collinear(c1, c2, c3)`

Key objective functions:
- `near(s1, s2)`, `nearPt(s, pt)` — encourage closeness
- `sameCenter(s1, s2)` — align centers
- `below(s1, s2)`, `above(s1, s2)`, `leftwards(s1, s2)`, `rightwards(s1, s2)`
- `minimal(x)`, `maximal(x)` — push value toward extremes
- `repelPt(s, pt)` — push apart

Geometric computation: `norm`, `normsq`, `dot`, `normalize`, `rot90`, `rotateBy`, `midpoint`, `vdist`, `angleOf`, `angleBetween`, `lineLineIntersection`, `makePath`, `signedDistance`, `rayIntersect`, `sin`, `cos`, `tan`, `atan2`, `MathPI`, `MathE`.

## Layout Stages

Split optimization into sequential phases — lay out geometry first, then place labels:

```
layout = [geometry, labels]

forall Point p {
  p.dot = Circle {
    center: (? in geometry, ? in geometry)
    r: 4
  }
  p.text = Text { string: p.label }
  encourage shapeDistance(p.dot, p.text) == 5 in labels
}
```

Variables frozen in earlier stages stay fixed in later ones. Use `in stageName` to restrict a variable or constraint to a stage. `except stageName` excludes from a stage.

## Collectors

Aggregate matches across substance objects:

```
collect Element e into elements
where In(e, s)
foreach Set s {
  listof e.icon.center from elements    -- list of all centers
  numberof elements                      -- count
}
```

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

## Example: Euler Diagram

domain:
```
type Set
predicate Subset(Set s1, Set s2)
predicate Disjoint(Set s1, Set s2)
```

substance:
```
Set A, B, C
Subset(A, C)
Subset(B, C)
Disjoint(A, B)
AutoLabel All
```

style:
```
canvas { width = 800, height = 700 }

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

forall Set x; Set y
where Disjoint(x, y) {
  ensure disjoint(x.icon, y.icon)
}
```

## Example: Directed Graph with Layout Stages

domain:
```
type Vertex
predicate Edge(Vertex u, Vertex v)
```

substance:
```
Vertex A, B, C, D
Edge(A, B)
Edge(A, C)
Edge(B, D)
Edge(C, D)
AutoLabel All
```

style:
```
canvas { width = 400, height = 400 }
layout = [nodes, labels]

num { radius = 8, edgeDist = 120, labelDist = 12 }

forall Vertex v {
  v.dot = Circle {
    center: (? in nodes, ? in nodes)
    r: num.radius
    fillColor: #1e293b
  }
  v.text = Text {
    string: v.label
    fillColor: #1e293b
    fontSize: "14px"
  }
  encourage shapeDistance(v.dot, v.text) == num.labelDist in labels
}

forall Vertex u; Vertex v
where Edge(u, v) as e {
  e.line = Line {
    start: u.dot.center
    end: v.dot.center
    strokeColor: #64748b
    endArrowhead: "arrowhead"
    endArrowheadSize: 0.5
  }
  layer e.line below u.dot
  layer e.line below v.dot
  encourage vdist(u.dot.center, v.dot.center) < num.edgeDist in nodes
}

forall Vertex u; Vertex v {
  ensure disjoint(u.dot, v.dot, 10) in nodes
}
```

## Example: Service Architecture

domain:
```
type Service
type Database
type Queue

predicate DependsOn(Service, Service)
predicate Reads(Service, Database)
predicate Writes(Service, Database)
predicate Publishes(Service, Queue)
predicate Consumes(Service, Queue)
```

substance:
```
Service API, Auth, Worker, Notifier
Database Users, Events
Queue Jobs, Emails

DependsOn(API, Auth)
Reads(API, Users)
Writes(API, Events)
Publishes(API, Jobs)
Consumes(Worker, Jobs)
Writes(Worker, Events)
Publishes(Worker, Emails)
Consumes(Notifier, Emails)

AutoLabel All
```

style:
```
canvas { width = 900, height = 600 }
layout = [layout, labels]

color {
  service  = #3b82f6
  database = #10b981
  queue    = #f59e0b
  edge     = #64748b
  text     = #1e293b
}

forall Service s {
  s.icon = Rectangle {
    center: (? in layout, ? in layout)
    width: 100
    height: 50
    fillColor: color.service
    cornerRadius: 8
    strokeWidth: 0
  }
  s.text = Text {
    string: s.label
    fillColor: #ffffff
    fontSize: "14px"
    fontWeight: "bold"
  }
  ensure sameCenter(s.icon, s.text)
  layer s.text above s.icon
}

forall Database d {
  d.icon = Rectangle {
    center: (? in layout, ? in layout)
    width: 90
    height: 45
    fillColor: color.database
    cornerRadius: 4
    strokeWidth: 0
  }
  d.text = Text {
    string: s.label
    fillColor: #ffffff
    fontSize: "13px"
  }
  ensure sameCenter(d.icon, d.text)
  layer d.text above d.icon
}

forall Queue q {
  q.icon = Rectangle {
    center: (? in layout, ? in layout)
    width: 90
    height: 40
    fillColor: color.queue
    cornerRadius: 20
    strokeWidth: 0
  }
  q.text = Text {
    string: q.label
    fillColor: #ffffff
    fontSize: "13px"
  }
  ensure sameCenter(q.icon, q.text)
  layer q.text above q.icon
}

forall Service s1; Service s2
where DependsOn(s1, s2) as dep {
  dep.line = Line {
    start: s1.icon.center
    end: s2.icon.center
    strokeColor: color.edge
    strokeWidth: 2
    endArrowhead: "arrowhead"
  }
  layer dep.line below s1.icon
}

forall Service s; Database d
where Reads(s, d) as r {
  r.line = Line {
    start: s.icon.center
    end: d.icon.center
    strokeColor: color.database
    strokeWidth: 1.5
    strokeDasharray: "6 3"
    endArrowhead: "arrowhead"
  }
  layer r.line below s.icon
}

forall Service s; Database d
where Writes(s, d) as w {
  w.line = Line {
    start: s.icon.center
    end: d.icon.center
    strokeColor: color.database
    strokeWidth: 2
    endArrowhead: "arrowhead"
  }
  layer w.line below s.icon
}

forall Service s; Queue q
where Publishes(s, q) as p {
  p.line = Line {
    start: s.icon.center
    end: q.icon.center
    strokeColor: color.queue
    strokeWidth: 2
    endArrowhead: "arrowhead"
  }
  layer p.line below s.icon
}

forall Service s; Queue q
where Consumes(s, q) as c {
  c.line = Line {
    start: q.icon.center
    end: s.icon.center
    strokeColor: color.queue
    strokeWidth: 1.5
    strokeDasharray: "6 3"
    endArrowhead: "arrowhead"
  }
  layer c.line below s.icon
}
```

## Example: State Machine

domain:
```
type State
predicate Transition(State source, State target)
predicate Initial(State)
predicate Final(State)
```

substance:
```
State Idle, Loading, Success, Error, Retrying

Initial(Idle)
Final(Success)

Transition(Idle, Loading)
Transition(Loading, Success)
Transition(Loading, Error)
Transition(Error, Retrying)
Transition(Retrying, Loading)

AutoLabel All
```

style:
```
canvas { width = 600, height = 400 }
layout = [nodes, labels]

forall State s {
  s.dot = Circle {
    center: (? in nodes, ? in nodes)
    r: 30
    fillColor: #f1f5f9
    strokeColor: #334155
    strokeWidth: 2
  }
  s.text = Text {
    string: s.label
    fillColor: #334155
    fontSize: "12px"
    fontWeight: "bold"
  }
  ensure sameCenter(s.dot, s.text)
  layer s.text above s.dot
}

forall State s
where Initial(s) {
  override s.dot.strokeWidth = 3
  override s.dot.strokeColor = #2563eb
}

forall State s
where Final(s) {
  override s.dot.fillColor = #dcfce7
  override s.dot.strokeColor = #16a34a
}

forall State s1; State s2
where Transition(s1, s2) as t {
  t.arrow = Line {
    start: s1.dot.center
    end: s2.dot.center
    strokeColor: #64748b
    endArrowhead: "arrowhead"
    endArrowheadSize: 0.4
  }
  layer t.arrow below s1.dot
  layer t.arrow below s2.dot
  encourage vdist(s1.dot.center, s2.dot.center) < 160 in nodes
}

forall State s1; State s2 {
  ensure disjoint(s1.dot, s2.dot, 15) in nodes
}
```

## Example: Entity-Relationship

domain:
```
type Entity
type Attribute

predicate HasAttribute(Entity, Attribute)
predicate OneToMany(Entity source, Entity target)
predicate ManyToMany(Entity, Entity)
```

substance:
```
Entity User, Post, Comment, Tag

Attribute UserName, Email
Attribute Title, Body, PublishedAt
Attribute Content, CreatedAt
Attribute TagName

HasAttribute(User, UserName)
HasAttribute(User, Email)
HasAttribute(Post, Title)
HasAttribute(Post, Body)
HasAttribute(Post, PublishedAt)
HasAttribute(Comment, Content)
HasAttribute(Comment, CreatedAt)
HasAttribute(Tag, TagName)

OneToMany(User, Post)
OneToMany(User, Comment)
OneToMany(Post, Comment)
ManyToMany(Post, Tag)

AutoLabel All
```

style:
```
canvas { width = 800, height = 600 }
layout = [entities, attrs, labels]

color {
  entity = #1e40af
  attr   = #e2e8f0
  edge   = #64748b
}

forall Entity e {
  e.box = Rectangle {
    center: (? in entities, ? in entities)
    width: 120
    height: 40
    fillColor: color.entity
    cornerRadius: 4
    strokeWidth: 0
  }
  e.text = Text {
    string: e.label
    fillColor: #ffffff
    fontSize: "14px"
    fontWeight: "bold"
  }
  ensure sameCenter(e.box, e.text)
  layer e.text above e.box
}

forall Attribute a {
  a.dot = Ellipse {
    center: (? in attrs, ? in attrs)
    rx: 50
    ry: 18
    fillColor: color.attr
    strokeColor: #94a3b8
    strokeWidth: 1
  }
  a.text = Text {
    string: a.label
    fillColor: #334155
    fontSize: "11px"
  }
  ensure sameCenter(a.dot, a.text)
  layer a.text above a.dot
}

forall Entity e; Attribute a
where HasAttribute(e, a) as h {
  h.line = Line {
    start: e.box.center
    end: a.dot.center
    strokeColor: color.edge
    strokeWidth: 1
  }
  layer h.line below e.box
  layer h.line below a.dot
  encourage vdist(e.box.center, a.dot.center) < 100 in attrs
}

forall Entity e1; Entity e2
where OneToMany(e1, e2) as rel {
  rel.line = Line {
    start: e1.box.center
    end: e2.box.center
    strokeColor: color.entity
    strokeWidth: 2
    endArrowhead: "arrowhead"
  }
  layer rel.line below e1.box
  encourage vdist(e1.box.center, e2.box.center) < 200 in entities
}

forall Entity e1; Entity e2
where ManyToMany(e1, e2) as rel {
  rel.line = Line {
    start: e1.box.center
    end: e2.box.center
    strokeColor: color.entity
    strokeWidth: 2
    strokeDasharray: "8 4"
  }
  layer rel.line below e1.box
  encourage vdist(e1.box.center, e2.box.center) < 200 in entities
}

forall Entity e1; Entity e2 {
  ensure disjoint(e1.box, e2.box, 20) in entities
}
```
