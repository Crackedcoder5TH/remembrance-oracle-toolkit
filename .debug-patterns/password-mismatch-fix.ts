// FIX: Standardize all password operations on a single module (password.ts / scrypt)
//
// WRONG — login imports HMAC verifyPassword from client-database:
//   import { verifyPassword } from "@/app/lib/client-database";
//
// RIGHT — login imports scrypt verifyPassword from password module:
//   import { verifyPassword } from "@/app/lib/password";
//
// All routes that hash or verify passwords must use password.ts:
//   - /api/portal/login/route.ts   → verifyPassword from password.ts
//   - /api/portal/register/route.ts → hashPassword from password.ts
//   - /api/client/login/route.ts   → verifyPassword from password.ts
//   - /api/admin/seed-client/route.ts → hashPassword from password.ts (await!)
//   - app/lib/demo-client.ts       → pre-computed scrypt hash (not HMAC)
//
// The sync HMAC functions in client-database.ts (hashPassword, verifyPassword)
// should NOT be used for user authentication. All auth flows must use the async
// scrypt versions from password.ts.
