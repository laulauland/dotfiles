# Frontend

The same standards apply to UI code: parse at the boundary, model states precisely, keep failures typed, design deep components, and keep the functional core pure. This file adds the frontend-specific seams — the network edge, the server/client hop, component interfaces, and UI state — and defers the general rules to the files that own them.

Load this file when the change touches React/frontend TypeScript: components, hooks, client/server data flow, loaders/actions, forms, client state, or rendering. Browser-platform integrations (storage, history, web APIs, third-party widgets) are External Adapter Modules under [`DESIGNING_MODULES.md`](DESIGNING_MODULES.md) and [`BOUNDARIES_AND_PARSING.md`](BOUNDARIES_AND_PARSING.md); platform-runtime placement on Workers/Pages lives in [`CLOUDFLARE_ARCHITECTURE.md`](CLOUDFLARE_ARCHITECTURE.md).

## Non-negotiables

- API, RPC, loader, and `fetch` responses are parsed before they reach component state. `await response.json()` is `unknown`; never `as SomeType`. See [`BOUNDARIES_AND_PARSING.md`](BOUNDARIES_AND_PARSING.md).
- UI state with mutually exclusive modes is a discriminated union, not independent booleans. No `isLoading`/`error`/`data` triple that can represent impossible combinations.
- Expected data-layer failures are typed values rendered as states. Components do not throw expected failures for control flow; thrown errors are reserved for defects and error-boundary territory.
- Values crossing the server/client boundary (RSC props, serialized loader data, `postMessage`, worker hops) are serializable DTOs. Class instances, domain value classes, `Map`/`Set`, functions, and custom errors do not cross unless the transport preserves them — project to a DTO and parse on receipt.
- Secrets, tokens, and raw error objects do not enter client logs, analytics, or error-boundary surfaces. See [`OBSERVABILITY.md`](OBSERVABILITY.md).
- Effects own their cleanup. Subscriptions, timers, listeners, and in-flight requests are torn down on unmount and on dependency change.

## Components as deep modules

A component's props are its interface; apply the depth rules from [`DESIGNING_MODULES.md`](DESIGNING_MODULES.md).

- Keep the props interface small and cohesive; hide layout, internal state, and effects behind it.
- Do not pass raw DTOs or giant prop bags. Pass the refined domain values and the few callbacks the component needs.
- A component earns its keep with the deletion test: if removing it just spreads its markup and state into the parent, it was pass-through; if removing it spreads real complexity, it was deep.
- Lift state to the nearest common owner, not to the top by default. Co-locate data requirements with the component that uses them.

Avoid prop confetti and pass-through wrappers that only rename children:

```tsx
// shallow: forwards everything, owns nothing
function UserCardWrapper(props: UserCardProps) {
  return <UserCard {...props} />;
}
```

## State modeling

Model UI state with the same precision as domain state ([`DOMAIN_MODELING.md`](DOMAIN_MODELING.md)). Make illegal combinations unrepresentable.

Avoid boolean soup:

```ts
type State = {
  readonly isLoading: boolean;
  readonly error: string | undefined;
  readonly user: User | undefined;
};
```

Prefer an explicit state machine:

```ts
type State =
  | { readonly tag: "idle" }
  | { readonly tag: "loading" }
  | { readonly tag: "loaded"; readonly user: User }
  | { readonly tag: "failed"; readonly error: UserLoadError };
```

Derive, do not duplicate: compute from source state during render or with a memoized selector instead of mirroring server state into redundant `useState`. Server cache state (a query library's data) and local UI state are different concerns; do not copy one into the other.

## Functional core in the UI

Keep rendering and derivation pure; push effects to the edges ([`DESIGNING_MODULES.md`](DESIGNING_MODULES.md), functional core / imperative shell).

- Pure: render output, derived values, reducers, selectors, formatting. No I/O, no ambient time/randomness read during render.
- Imperative shell: effects, fetches, subscriptions, storage, navigation, timers, and the parsing of everything they return.
- Inject time, randomness, and IDs that affect rendered behavior rather than reading them ambiently mid-render.

## Data fetching

Fetching is a boundary; route it through a typed client, loader, or query function that parses, and let components consume refined values.

```ts
async function loadUser(userId: UserId, signal: AbortSignal): Promise<Result<User, UserLoadError>> {
  const response = await fetch(`/api/users/${userId}`, { signal });
  const raw: unknown = await response.json();
  return parseUser(raw);
}
```

- Pass an `AbortSignal` tied to component lifetime and cancel on unmount or dependency change ([`ASYNC_AND_WORKFLOWS.md`](ASYNC_AND_WORKFLOWS.md)).
- Use the repository's established data layer (framework loaders/actions, or a query library) rather than ad hoc `fetch` in effects, after a convention audit.
- Map typed load failures to rendered `failed` states, not thrown exceptions.

## Forms

Treat form submission as a boundary parse. Read the raw form values as `unknown`/`FormData`, parse into a refined input, and only then call the service or mutation. Field-level validation messages are a projection of the parse failure, not a second validation pass. Mutating submissions reject unknown fields by default ([`BOUNDARIES_AND_PARSING.md`](BOUNDARIES_AND_PARSING.md)).

## Rejected framings

- **"It's just UI state, booleans are fine."** Independent booleans encode impossible states. Use a discriminated union.
- **"`response.json()` is already typed."** Its static type is `any`/`unknown`; the runtime payload is untrusted. Parse it.
- **"Lift all state to a global store."** Lift to the nearest common owner; global state is a seam decision, not a default.
- **"A wrapper component is composition."** A component that only forwards props owns no behavior — it is pass-through, not depth.
- **"Throw and let the error boundary catch it."** Error boundaries are for defects. Expected load/submit failures are typed states you render.
