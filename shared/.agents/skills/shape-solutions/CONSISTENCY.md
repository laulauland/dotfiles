# Multi-Level Consistency

## Multi-Level Consistency (Critical)

Shaping produces documents at different levels of abstraction. **Truth must stay consistent across all levels.**

### The Document Hierarchy (high to low)

1. **Shaping doc** — ground truth for R's, shapes, parts, fit checks
2. **Slices doc** — ground truth for slice definitions, breadboards
3. **Individual slice plans** (V1-plan, etc.) — ground truth for implementation details

### The Principle

Each level summarizes or provides a view into the level(s) below it. Lower levels contain more detail; higher levels are designed views that help acquire context quickly.

**Changes ripple in both directions:**

- **Change at high level → trickles down:** If you change the shaping doc's parts table, update the slices doc too.
- **Change at low level → trickles up:** If a slice plan reveals a new mechanism or changes the scope of a slice, the Slices doc and shaping doc must reflect that.

### The Practice

Whenever making a change:

1. **Identify which level you're touching**
2. **Ask: "Does this affect documents above or below?"**
3. **Update all affected levels in the same operation**
4. **Never let documents drift out of sync**

The system only works if the levels are consistent with each other.

---
