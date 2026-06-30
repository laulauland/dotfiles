# Reference

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

