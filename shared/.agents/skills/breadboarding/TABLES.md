# Breadboard Tables

## The Output: Affordance Tables

The tables are the truth. Every breadboard produces these:

### Places Table

| # | Place | Description |
|---|-------|-------------|
| P1 | Search Page | Main search interface |
| P2 | Detail Page | Individual result view |

### UI Affordances Table

| # | Place | Component | Affordance | Control | Wires Out | Returns To |
|---|-------|-----------|------------|---------|-----------|------------|
| U1 | P1 | search-detail | search input | type | → N1 | — |
| U2 | P1 | search-detail | loading spinner | render | — | — |
| U3 | P1 | search-detail | results list | render | — | — |
| U4 | P1 | search-detail | result row | click | → P2 | — |

### Code Affordances Table

| # | Place | Component | Affordance | Control | Wires Out | Returns To |
|---|-------|-----------|------------|---------|-----------|------------|
| N1 | P1 | search-detail | `activeQuery.next()` | call | → N2 | — |
| N2 | P1 | search-detail | `activeQuery` subscription | observe | → N3 | — |
| N3 | P1 | search-detail | `performSearch()` | call | → N4, → N5, → N6 | — |
| N4 | P1 | search.service | `searchOneCategory()` | call | → N7 | → N3 |
| N5 | P1 | search-detail | `loading` | write | store | → U2 |
| N6 | P1 | search-detail | `results` | write | store | → U3 |
| N7 | P1 | typesense.service | `rawSearch()` | call | — | → N4 |

### Data Stores Table

| # | Place | Store | Description |
|---|-------|-------|-------------|
| S1 | P1 | `results` | Array of search results |
| S2 | P1 | `loading` | Boolean loading state |

### Column Definitions

| Column | Description |
|--------|-------------|
| **#** | Unique ID (P1, P2... for Places; U1, U2... for UI; N1, N2... for Code; S1, S2... for Stores) |
| **Place** | Which Place this affordance belongs to (containment) |
| **Component** | Which component/service owns this |
| **Affordance** | The specific thing you can act upon |
| **Control** | The triggering event: click, type, call, observe, write, render |
| **Wires Out** | What this triggers: `→ N4`, `→ P2` (control flow, including navigation) |
| **Returns To** | Where output flows: `→ N3` or `→ U2, U3` (data flow) |

---
