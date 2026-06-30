# Examples

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
