# Breadboarding Concepts

## Core Concepts

### Places

A Place is a **bounded context of interaction**. While you're in a Place:
- You have a specific set of affordances available to you
- You **cannot** interact with affordances outside that boundary
- You must take an action to leave

**Place is perceptual, not technical.** It's not about URLs or components — it's about what the user experiences as their current context. A Place is "where you are" in terms of what you can do right now.

#### The Blocking Test

The simplest test for whether something is a different Place: **Can you interact with what's behind?**

| Answer | Meaning |
|--------|---------|
| **No** | You're in a different Place |
| **Yes** | Same Place, with local state changes |

#### Examples

| UI Element | Blocking? | Place? | Why |
|------------|-----------|--------|-----|
| Modal | Yes | Yes | Can't interact with page behind |
| Confirmation popover | Yes | Yes | Must respond before returning (limit case of modal) |
| Edit mode (whole screen transforms) | Yes | Yes | All affordances changed |
| Checkbox reveals extra fields | No | No | Surroundings unchanged |
| Dropdown menu | No | No | Can click away, non-blocking |
| Tooltip | No | No | Informational, non-blocking |

#### Local State vs Place Navigation

When a control changes state, ask: did *everything* change, or just a subset while the surroundings stayed the same?

| Type | What happens | How to model |
|------|--------------|--------------|
| **Local state** | Subset of UI changes, surroundings unchanged | Same Place, conditional N → dependent Us |
| **Place navigation** | Entire screen transforms, or blocking overlay | Different Places |

#### Mode-Based Places

When a mode (like "edit mode") transforms the entire screen — different buttons, different affordances everywhere — model as separate Places:

```
PLACE: CMS Page (Read Mode)
PLACE: CMS Page (Edit Mode)
```

The state flag (e.g., `editMode$`) that switches between them is a **navigation mechanism**, not a data store. Don't include it as an S in either Place.

#### Three Questions for Any Control

For any UI affordance, ask:
1. Where did I come from to see this?
2. Where am I now?
3. Where do I go if I act on it?

If the answer to #3 is "everything changes" or "I can't interact with what's behind until I respond," that's navigation to a different Place.

#### Labeling Conventions

| Pattern | Use |
|---------|-----|
| `PLACE: Page Name` | Standard page/route |
| `PLACE: Page Name (Mode)` | Mode-based variant of a page |
| `PLACE: Modal Name` | Modal dialog |
| `PLACE: Backend` | API/database boundary |

When spanning multiple systems, label with the system: `PLACE: Checkout Page (frontend)`, `PLACE: Payment API (backend)`.

### Place IDs

Places are first-class elements in the data model. Each Place gets an ID:

| # | Place | Description |
|---|-------|-------------|
| P1 | CMS Page (Read Mode) | View-only state |
| P2 | CMS Page (Edit Mode) | Editing state with page-level controls |
| P2.1 | widget-grid (letters) | Subplace: letter editing widget within P2 |
| P3 | Letter Form Modal | Form for adding/editing letters |
| P4 | Backend | API resolvers and database |

Place IDs enable:
- **Explicit navigation wiring** — wire `→ P2` instead of to an affordance inside
- **Containment tracking** — each affordance declares which Place it belongs to
- **Consistent Mermaid subgraphs** — subgraph ID matches Place ID

### Place References

When a nested place has lots of internal affordances and would clutter the parent, you can **detach** it:

1. Put a **reference node** in the parent place using underscore prefix: `_letter-browser`
2. Define the full place separately with all its internals
3. Wire from the reference to the place: `_letter-browser --> letter-browser`

The reference is a **UI affordance** — it represents "this widget/component renders here" in the parent context.

```mermaid
flowchart TB
subgraph P1["P1: CMS Page (Read Mode)"]
    U1["U1: Edit button"]
    U_LB["_letter-browser"]
end

subgraph letterBrowser["letter-browser"]
    U10["U10: Search input"]
    U11["U11: Letter list"]
    N40["N40: performSearch()"]
end

U_LB --> letterBrowser
```

In affordance tables, list the reference as a UI affordance:

| # | Affordance | Control | Wires Out |
|---|------------|---------|-----------|
| U1 | Edit button | click | → N1 |
| _letter-browser | Widget reference | — | → P3 |

Style place references with a dashed border to distinguish them:
```
classDef placeRef fill:#ffb6c1,stroke:#d87093,stroke-width:2px,stroke-dasharray:5 5
class U_LB placeRef
```

### Modes as Places

When a component has distinct modes (read vs edit, viewing vs editing, collapsed vs expanded), model them as **separate places** — they're different perceptual states for the user.

If one mode includes everything from another plus more, show this with a **place reference** inside the extended place:

```
P3: letter-browser (Read)    — base state
P4: letter-browser (Edit)    — contains _letter-browser (Read) + new affordances
```

The reference shows composition: "everything in P3 appears here, plus these additions."

```mermaid
flowchart TB
subgraph P3["P3: letter-browser (Read)"]
    U10["U10: Search input"]
    U11["U11: Letter list"]
end

subgraph P4["P4: letter-browser (Edit)"]
    U_P3["_letter-browser (Read)"]
    U3["U3: Add button"]
    U4["U4: Edit button"]
end

U_P3 --> P3
```

In affordance tables for P4, the reference shows inheritance:

| # | Affordance | Control | Wires Out | Notes |
|---|------------|---------|-----------|-------|
| _letter-browser (Read) | Inherits all of P3 | — | → P3 | |
| U3 | Add button | click | → N3 | NEW |
| U4 | Edit button | click | → N4 | NEW |

### Subplaces

A **subplace** is a defined subset of a Place — a contained area that groups related affordances. Use subplaces when:
- A Place contains multiple distinct widgets or sections
- You're detailing one part of a larger Place
- You want to show what's in scope vs out of scope

**Notation:** Use hierarchical IDs — `P2.1`, `P2.2`, etc. for subplaces of P2.

```
| # | Place | Description |
|---|-------|-------------|
| P2 | Dashboard | Main dashboard page |
| P2.1 | Sales widget | Subplace: sales metrics |
| P2.2 | Activity feed | Subplace: recent activity |
```

In affordance tables, use the subplace ID to show containment:

```
| U3 | P2.1 | sales-widget | "Refresh" button | click | → N4 | — |
| U7 | P2.2 | activity-feed | activity list | render | — | — |
```

**In Mermaid:** Nest the subplace subgraph inside the parent. Use the same background color (no distinct fill) — the subplace is part of the parent, not a separate Place:

```mermaid
flowchart TB
subgraph P2["P2: Dashboard"]
    subgraph P2_1["P2.1: Sales widget"]
        U3["U3: Refresh button"]
    end
    subgraph P2_2["P2.2: Activity feed"]
        U7["U7: activity list"]
    end
    otherContent[["... other dashboard content ..."]]
end
```

**Placeholder for out-of-scope content:** When detailing one subplace, add a placeholder sibling to show there's more on the page:

```
otherContent[["... other page content ..."]]
```

This tells readers: "we're zooming in on P2.1, but P2 contains more that we're not detailing."

### Containment vs Wiring

These are two different relationships in the data model:

| Relationship | Meaning | Where Captured |
|--------------|---------|----------------|
| **Containment** | Affordance belongs to / lives in a Place | **Place column** (set membership) |
| **Wiring** | Affordance triggers / calls something | **Wires Out column** (control flow) |

**Containment** is set membership: `U1 ∈ P1` means U1 is a member of Place P1. Every affordance belongs to exactly one Place.

**Wiring** is control flow: `U1 → N1` means U1 triggers N1. An affordance can wire to anything — other affordances or Places.

The Place column answers: "Where does this affordance live?"
The Wires Out column answers: "What does this affordance trigger?"

### Navigation Wiring

When an affordance causes navigation (user "goes" somewhere), wire to the **Place itself**, not to an affordance inside:

```
✅ N1 Wires Out: → P2          (navigate to Edit Mode)
❌ N1 Wires Out: → U3          (wiring to affordance inside P2)
```

This makes navigation explicit in the tables. The Place is the destination; specific affordances inside become available once you arrive.

In Mermaid, this becomes:
```
N1 --> P2
```

The subgraph ID matches the Place ID, so the wire connects to the Place boundary.

### Affordances
Things you can act upon:
- **UI affordances (U)**: inputs, buttons, displayed elements, scroll regions
- **Code affordances (N)**: methods, subscriptions, data stores, framework mechanisms

### Wiring
How affordances connect to each other:

**Wires Out** — What an affordance triggers or calls (control flow):
- Call wires: one affordance calls another
- Write wires: code writes to a data store
- Navigation wires: routing to a different place

**Returns To** — Where an affordance's output flows (data flow):
- Return wires: function returns value to its caller
- Read wires: data store is read by another affordance

This separation makes data flow explicit. Wires Out show control flow (what triggers what). Returns To show data flow (where output goes).

---

## Key Principles

### Never use memory — always check the data

When tracing a flow backwards, don't follow the path you remember. Scan the Wires Out column for ALL affordances that wire to your target.

When filling in the tables, read each row systematically. Don't rely on what you think you know.

The tables are the source of truth. Your memory is unreliable.

### Every affordance name must exist (when mapping)

When mapping existing code, never invent abstractions. Every name must point to something real in the codebase.

### Mechanisms aren't affordances

An affordance is something you can **act upon** that has meaningful identity in the system. Several things look like affordances but are actually just implementation mechanisms:

| Type | Example | Why it's not an affordance |
|------|---------|---------------------------|
| Visual containers | `modal-frame wrapper` | You can't act on a wrapper — it's just a Place boundary |
| Internal transforms | `letterDataTransform()` | Implementation detail of the caller — not separately actionable |
| Navigation mechanisms | `modalService.open()` | Just the "how" of getting to a Place — wire to the destination directly |

**These aren't always obvious on first draft.** When reviewing your affordance tables, double-check each Code affordance and ask:

> "Is this actually an affordance, or is it just detailing the mechanism for how something happens?"

If it's just the "how" — skip it and wire directly to the destination or outcome.

**Examples:**

```
❌ N8 --> N22 --> P3     (N22 is modalService.open — just mechanism)
✅ N8 --> P3             (handler navigates to modal)

❌ N6 --> N20 --> S2     (N20 is data transform — internal to N6)
✅ N6 --> S2             (callback writes to store)

❌ U7: modal-frame       (wrapper — just the boundary of P3)
✅ U8: Save button       (actionable)
```

The handler navigates to P3. The callback writes to the store. The modal IS P3. The mechanisms are implicit.

### Two flows: Navigation and Data

A breadboard captures two distinct flows:

| Flow | What it tracks | Wiring |
|------|----------------|--------|
| **Navigation** | Movement from Place to Place | Wires Out → Places |
| **Data** | How state populates displays | Returns To → Us |

These are orthogonal. You can have navigation without data changes, and data changes without navigation.

**When reviewing a breadboard, trace both flows:**

1. **Navigation flow:** Can you follow the user's journey from Place to Place?
2. **Data flow:** For every U that displays data, can you trace where that data comes from?

### Every U that displays data needs a source

A UI affordance that displays data must have something feeding it — either a data store (S) or a code affordance (N) that returns data.

```
❌ U6: letter list (no incoming wire — where does the data come from?)
✅ S1 -.-> U6 (store feeds the display)
✅ N4 -.-> U6 (query result feeds the display)
```

If a display U has no data source wiring into it, either:
1. The source is missing from the breadboard
2. The U isn't real

This is easy to miss when focused on navigation. Always ask: "This U shows data — where does that data come from?"

### Every N must connect

If a Code affordance has no Wires Out AND no Returns To, something is wrong:
- Handlers → should have Wires Out (what they call or write)
- Queries → should have Returns To (who receives their return value)
- Data stores → should have Returns To (which affordances read them)

### Side effects need stores

An N that appears to wire nowhere is suspicious. If it has **side effects outside the system boundary** (browser URL, localStorage, external API, analytics), add a **store node** to represent that external state:

```
❌ N41: updateUrl()           (wires to... nothing?)
✅ N41: updateUrl() → S15     (wires to Browser URL store)
```

This makes the data flow explicit. The store can also have return wires showing how external state flows back in:

```mermaid
flowchart TB
N42["N42: performSearch()"] --> N41["N41: updateUrl()"]
N41 --> S15["S15: Browser URL (?q=)"]
S15 -.->|back button / init| N40["N40: activeQuery$"]
```

Common external stores to model:
- `Browser URL` — query params, hash fragments
- `localStorage` / `sessionStorage` — persisted client state
- `Clipboard` — copy/paste operations
- `Browser History` — navigation state

### Separate control flow from data flow

Wires Out = control flow (what triggers what)
Returns To = data flow (where output goes)

This separation makes the system's behavior explicit.

### Show navigation inline, not as loops

Routing is a generic mechanism every page uses. Instead of drawing all navigation through a central Router affordance, show `Router navigate()` inline where it happens and wire directly to the destination place.

### Place stores where they enable behavior, not where they're written

A data store belongs in the Place where its data is *consumed* to enable some effect — not where it's produced. Writes from other Places are "reaching into" that Place's state.

To determine where a store belongs:
1. **Trace read/write relationships** — Who writes? Who reads?
2. **The readers determine placement** — that's where behavior is enabled
3. **If only one Place reads**, the store goes inside that Place

Example: A `changedPosts` array is written by a Modal (when user confirms changes) but read by a PAGE_SAVE handler (when user clicks Save). The store belongs with the PAGE_SAVE handler — that's where it enables the persistence operation.

### Only extract to shared areas when truly shared

Before putting a store in a separate DATA STORES section, verify it's actually read by multiple Places. If it only enables behavior in one Place, it belongs inside that Place.

### Nest stores in the subcomponent that reads them

Within a Place, put stores in the subcomponent where they enable behavior. If a store is read by a specific handler, put it in that handler's component — not floating at the Place level.

### Backend is a Place

The database and resolvers aren't floating infrastructure — they're a Place with their own affordances. Database tables (S) belong inside the Backend Place alongside the resolvers (N) that read and write them.

---

## Catalog of Parts and Relationships

This section provides a complete reference of everything that can appear in a breadboard.

### Elements

| Element | ID Pattern | What It Is | What Qualifies |
|---------|------------|------------|----------------|
| **Place** | P1, P2, P3... | A bounded context of interaction | Blocking test: can't interact with what's behind |
| **Subplace** | P2.1, P2.2... | A defined subset within a Place | Groups related affordances within a larger Place |
| **Place Reference** | _PlaceName | UI affordance pointing to a detached place | Complex nested place defined separately |
| **UI Affordance** | U1, U2, U3... | Something the user can see or interact with | Inputs, buttons, displays, scroll regions |
| **Code Affordance** | N1, N2, N3... | Something in code you can act upon | Methods, subscriptions, handlers, framework mechanisms |
| **Data Store** | S1, S2, S3... | State that persists and is read/written | Properties, arrays, observables that hold data |
| **Chunk** | — | A collapsed subsystem | One wire in, one wire out, many internals |
| **Placeholder** | — | Out-of-scope content marker | Shows context without detailing |

### Relationships

| Relationship | Syntax | Meaning | Example |
|--------------|--------|---------|---------|
| **Containment** | Place column | Affordance belongs to Place | `U3` in Place `P2.1` |
| **Wires Out** | `→ X` | Control flow: triggers/calls | `→ N4`, `→ P2` |
| **Returns To** | `→ X` (in Returns To column) | Data flow: output goes to | `→ U6`, `→ N3` |
| **Abbreviated flow** | `\|label\|` | Intermediate steps omitted | `S4 -.-> \|view query\| U6` |
| **Parent-child** | Hierarchical ID | Subplace belongs to Place | P2.1 is child of P2 |

### Containment vs Wiring

| Relationship | Meaning | Where Captured |
|--------------|---------|----------------|
| **Containment** | Affordance belongs to / lives in a Place | Place column (set membership) |
| **Wiring** | Affordance triggers / calls something | Wires Out column (control flow) |

Containment is set membership: `U1 ∈ P1` means U1 is a member of Place P1.
Wiring is control flow: `U1 → N1` means U1 triggers N1.

### What Qualifies as Each Element

**Place (P):**
- Passes the blocking test — can't interact with what's behind
- Examples: modal, edit mode (whole screen transforms), route/page
- Not: dropdown, tooltip, checkbox revealing fields

**Place Reference (_PlaceName):**
- A UI affordance that represents a detached place
- Use when a nested place has many affordances and would clutter the parent
- Examples: `_letter-browser`, `_user-profile-widget`
- Wires to the full place definition: `_letter-browser --> P3`

**UI Affordance (U):**
- User can see it or interact with it
- Examples: button, input, list, spinner, displayed text
- Not: wrapper elements, layout containers

**Code Affordance (N):**
- Has meaningful identity — you can point to it in code
- Examples: `handleSubmit()`, `query$ subscription`, `detectChanges()`
- Not: internal transforms, navigation mechanisms (see below)

**Data Store (S):**
- State that is written and read
- Examples: `results` array, `loading` boolean, `changedPosts` list
- External stores: `Browser URL`, `localStorage`, `Clipboard` — represent state outside the app boundary
- Not: config that's set once and never changes (consider as config affordance)

### Verification Checks

| Check | Question | If No... |
|-------|----------|----------|
| **Every U that displays data** | Does it have an incoming wire (via Wires Out or Returns To)? | Add the data source |
| **Every N** | Does it have Wires Out or Returns To (or both)? | Investigate — may be dead code or missing wiring |
| **Every S** | Does something read from it (Returns To)? | Investigate — may be unused |
| **Navigation mechanisms** | Is this N just the "how" of getting somewhere? | Wire directly to Place instead |
| **N with side effects** | Does this N affect external state (URL, storage, clipboard)? | Add a store for the external state |

---
