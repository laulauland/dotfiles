---
name: typescript
description: TypeScript coding conventions and best practices. Use when working with TypeScript files, defining types, or setting up TypeScript projects.
---

# TypeScript Guidelines

## Type System Usage

- Use TypeScript for all code
- Prefer interfaces over types for object definitions
- Avoid enums; use const objects with 'as const' assertion

```typescript
// Prefer:
const UserRole = {
  ADMIN: 'ADMIN',
  USER: 'USER',
} as const;
type UserRole = typeof UserRole[keyof typeof UserRole];

// Avoid:
enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
}
```

## Type Safety Rules

- Define strict types for all message passing between components
- Use explicit return types for all functions
- Use functional components with TypeScript interfaces

```typescript
interface Props {
  user: UserProfile;
  onUpdate: (user: UserProfile) => void;
}

function UserComponent ({ user, onUpdate }: Props): JSX.Element {
  // ...
};
```

## Schema Libraries for Data Modeling

When a project uses a schema library (Zod, Effect Schema, Valibot, etc.), prefer using it for data modeling over plain TypeScript types:

```typescript
// If project uses Zod, prefer:
const User = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(['admin', 'user']),
});
type User = z.infer<typeof User>;

// Over plain TypeScript:
interface User {
  id: string;
  email: string;
  role: 'admin' | 'user';
}
```

Benefits:
- Runtime validation at system boundaries
- Single source of truth (schema derives type)
- Automatic parsing and transformation
- Better error messages

## Import and Error Handling

- Avoid try/catch blocks unless error translation is needed at that level
- If needed, prefer using `tryCatch`/`tryCatchAsync` utility functions that return errors or data

```typescript
import { UserService } from '@/services/user';
import { Logger } from '@/utils/logger';
```

