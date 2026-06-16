---
name: console-debugging
description: "Console.log debugging patterns for React/TypeScript. Use when tracking down bugs involving data transformations, conditional logic, state management, or when you need to trace data flow through pipelines."
---

# Console.log Debugging Skill

Effective console.log debugging patterns for React/TypeScript applications. Use when tracking down bugs involving data transformations, conditional logic, or state management.

## Core Principle: Funnel from Broad to Targeted

```
Log everything → Too noisy, can't see signal
Filter to test case → Now logs are relevant  
Count in vs out → Quantify the bug
Trace through branches → See exactly which logic is wrong
Root cause → Fix with confidence
```

## Pattern 1: Test Case Filter

**Problem**: Logging every occurrence floods the console with 50+ irrelevant entries.

**Solution**: Filter all logs to ONE specific test case you can reproduce.

```typescript
// BAD: Logs for every item
console.log("[GraphEdge] rendered:", item.id);

// GOOD: Filter to the specific case you're debugging
const isDebugCase = item.id.startsWith("pwny");
if (isDebugCase) {
  console.log("[GraphEdge] rendered:", item.id);
}

// BETTER: Create a debug set once, check membership
const debugIds = new Set(["pwny", "komv", "ymzk"]);
const isDebug = debugIds.has(item.id.slice(0, 4));
```

## Pattern 2: Count Expected vs Actual

**Problem**: You know something's wrong but not where data is being lost.

**Solution**: Log counts at pipeline boundaries.

```typescript
// Before transformation
console.log("[transform] input count:", items.length);  // 5

// After transformation  
console.log("[transform] output count:", result.length);  // 1 ← BUG: 4 items lost!

// In loops/filters, count removals
let skipped = 0;
for (const item of items) {
  if (shouldSkip(item)) {
    skipped++;
    continue;
  }
  // process...
}
console.log("[transform] skipped:", skipped, "processed:", result.length);
```

## Pattern 3: Branch Tracing with Labels

**Problem**: Items are being filtered/transformed wrong, but you can't see which code path they take.

**Solution**: Log at EVERY branch exit with a descriptive label.

```typescript
for (const item of items) {
  const isDebug = debugIds.has(item.id);
  
  if (conditionA) {
    if (isDebug) console.log("[item] PATH A (conditionA true):", item.id);
    // handle A
  } else if (conditionB) {
    if (isDebug) console.log("[item] PATH B (conditionB true):", item.id);
    // handle B
  } else if (shouldSkip) {
    if (isDebug) console.log("[item] SKIPPED (shouldSkip):", item.id);
    continue;
  } else {
    if (isDebug) console.log("[item] PATH DEFAULT:", item.id);
    // default handling
  }
  
  if (isDebug) console.log("[item] ADDED:", item.id);
  result.push(item);
}
```

**Output reveals the bug**:
```
[item] ADDED: "2c778760"
[item] PATH A (conditionA true): "88dafdf7"  ← Why is this going to A??
[item] SKIPPED (shouldSkip): "4f6c4330"
```

## Pattern 4: Log the Deciding Factors

**Problem**: You see which branch fired but not WHY.

**Solution**: Log the values that determined the branch.

```typescript
// BAD: Just says it was skipped
if (isDebug) console.log("[item] SKIPPED");

// GOOD: Shows WHY it was skipped
if (isDebug) console.log("[item] SKIPPED:", {
  reason: "source is hidden",
  sourceId: item.sourceId,
  isInHiddenSet: hiddenSet.has(item.sourceId),
  isInExpandedStack: expandedStack.has(item.sourceId),  // ← This might override!
});
```

## Pattern 5: Verify State at Multiple Points

For React state bugs, log state at key lifecycle points:

```typescript
// In the state setter
function toggleExpanded(id: string) {
  console.log("[toggleExpanded] called with:", id);
  setExpanded(prev => {
    const next = new Set(prev);
    next.add(id);
    console.log("[toggleExpanded] new state:", [...next]);
    return next;
  });
}

// In the consuming memo/effect
const result = useMemo(() => {
  console.log("[useMemo] expandedSet:", [...expanded]);
  // ... transformation
  console.log("[useMemo] result count:", result.length);
  return result;
}, [expanded, otherDeps]);
```

## Log Format Standard

```typescript
console.log(`[${componentOrFunction}] ${ACTION}: ${identifier}`, { details });
```

- **Prefix**: `[ComponentName]` or `[functionName]` in brackets
- **Action**: UPPERCASE verb - ADDED, SKIPPED, FILTERED, TRANSFORMED, RENDERED
- **Identifier**: The item ID for filtering/correlation
- **Details object**: Additional context (use object so console shows expandable)

Examples:
```typescript
console.log("[EdgeFilter] SKIPPED: edge-123", { reason: "hidden", sourceId: "abc" });
console.log("[useMemo] RECOMPUTED:", { inputCount: 5, outputCount: 1, deps: [...deps] });
console.log("[GraphEdge] RENDERED: pwny", { isCollapsed: true, stackId: "xyz" });
```

## Debugging Priority/Ordering Bugs

These bugs occur when multiple conditions COULD match but fire in wrong order.

**Symptom**: An item matches condition A but SHOULD have matched condition B first.

**Detection pattern**:
```typescript
const matchesA = conditionA(item);
const matchesB = conditionB(item);

if (isDebug && matchesA && matchesB) {
  console.log("[item] MATCHES BOTH A and B:", item.id, { 
    willTakePath: "A",  // Current behavior
    shouldTakePath: "B?"  // Question for yourself
  });
}

if (matchesA) {
  // This fires, but should B have priority?
}
```

**Fix pattern**: Check the higher-priority condition FIRST:
```typescript
// BEFORE: A checked first
if (matchesA) { ... }
else if (matchesB) { ... }

// AFTER: B has priority
if (matchesB) { ... }  // ← Check this first now
else if (matchesA) { ... }
```

## Anti-Patterns to Avoid

### 1. Truncating IDs in Logs
```typescript
// BAD: Causes confusion about ID mismatches
console.log("id:", item.id.slice(0, 8));

// GOOD: Log full IDs
console.log("id:", item.id);
```

### 2. Logging in Render Instead of Data Pipeline
For "wrong data displayed" bugs, log the data transformation, not the display:
```typescript
// Less useful: logging in JSX
return <div>{items.map(i => { console.log(i); return <Item {...i} /> })}</div>

// More useful: logging in the useMemo/transformation
const processedItems = useMemo(() => {
  console.log("[processItems] input:", items.length);
  const result = items.filter(...).map(...);
  console.log("[processItems] output:", result.length);
  return result;
}, [items]);
```

### 3. Refactoring Before Confirming Hypothesis
```typescript
// BAD: Assume hover state is broken, refactor it
// (Wastes time if the bug is elsewhere)

// GOOD: Add logs first, confirm hypothesis, then fix
console.log("[hover] state:", hoverState);
console.log("[hover] expected:", expectedState);
// NOW you know if hover is the problem
```

## Quick Reference Checklist

When debugging with console.log:

- [ ] Can I reproduce with a specific test case? → Filter logs to that case
- [ ] Do I know where data is lost? → Count inputs and outputs
- [ ] Do I know which code path items take? → Add branch labels
- [ ] Do I know WHY that path was taken? → Log deciding factors
- [ ] Could multiple conditions match? → Check for priority bugs
- [ ] Am I logging full IDs? → Don't truncate
- [ ] Am I logging data flow, not just renders? → Log in transformations
