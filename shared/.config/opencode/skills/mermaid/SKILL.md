---
name: mermaid
description: Mermaid diagram generation guidelines. Use when creating flowcharts, sequence diagrams, class diagrams, or other visual documentation.
---

# Mermaid Graph Generation

## Basic Syntax

Use triple backticks with 'mermaid' language specifier:

```mermaid
graph TD
  A[Start] --> B{Decision}
  B -->|Yes| C[Process]
  B -->|No| D[End]
```

## Principles

- Prefer clear, concise diagrams that explain the core concept
- Use different node shapes and colors to distinguish different types of elements
- Ensure readability by using meaningful node labels
- Use subgraphs or clusters to show hierarchical or grouped relationships

## Node Shapes

| Syntax | Shape |
|--------|-------|
| `[text]` | Rectangle |
| `(text)` | Rounded rectangle |
| `{text}` | Diamond (decision) |
| `([text])` | Stadium |
| `[[text]]` | Subroutine |
| `[(text)]` | Cylinder (database) |
| `((text))` | Circle |

## Supported Diagram Types

### Flowchart

```mermaid
graph LR
  A[Input] --> B[Process] --> C[Output]
```

### Sequence Diagram

```mermaid
sequenceDiagram
  participant A as Client
  participant B as Server
  A->>B: Request
  B-->>A: Response
```

### Class Diagram

```mermaid
classDiagram
  class User {
    +String name
    +login()
  }
```

### State Diagram

```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Processing
  Processing --> Done
  Done --> [*]
```

## Styling

```mermaid
graph TD
  A[Node]:::highlight --> B[Node]
  classDef highlight fill:#f9f,stroke:#333,stroke-width:2px
```

## Subgraphs

```mermaid
graph TD
  subgraph Frontend
    A[React] --> B[Components]
  end
  subgraph Backend
    C[API] --> D[Database]
  end
  B --> C
```

