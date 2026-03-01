# Implementation Plan: Google Sign-In + Auto-Admin Role Assignment

## Oracle Insights
- **Decision: GENERATE** — No existing Google OAuth or role-assignment patterns in the oracle. The closest match was `validate-email` (EVOLVE, 0.584) which we can reuse for email validation during admin checks.
- After implementation, we'll register these as new patterns for future reuse.

---

## Current State
- **Auth**: API key-based login -> HMAC-signed session cookie (`__admin_session`)
- **Framework**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS
- **DB**: SQLite via `better-sqlite3` (leads table only, no users table)
- **Middleware**: Edge runtime, checks session cookie for `/admin/*` routes

---

## Architecture Decision: NextAuth.js (Auth.js v5)

Using `next-auth` v5 — the standard for Next.js Google OAuth:
- Handles OAuth flow, token refresh, CSRF protection out of the box
- Works with App Router and Edge middleware
- No need to manually handle Google's OAuth endpoints
- Session stored in a signed JWT (fits existing cookie-based approach)

---

## Implementation Steps

### Step 1: Install Dependencies
```bash
npm install next-auth@beta
```
(v5/beta is the App Router-native version)

### Step 2: Add Environment Variables
New env vars in `.env.local` and `.env.example`:
```
GOOGLE_CLIENT_ID=           # From Google Cloud Console
GOOGLE_CLIENT_SECRET=       # From Google Cloud Console
NEXTAUTH_SECRET=            # Random secret for JWT signing
NEXTAUTH_URL=               # Your site URL
ADMIN_EMAILS=               # Comma-separated Google emails that get admin access
```

### Step 3: Create Auth Configuration (`app/lib/auth-config.ts`)
- Configure Google provider
- Define session callback to inject `role` into the JWT/session
- Check user's email against `ADMIN_EMAILS` env var
- Return `role: "admin"` or `role: "user"` accordingly

### Step 4: Create Auth Route Handler (`app/api/auth/[...nextauth]/route.ts`)
- Standard NextAuth catch-all route
- Exports GET and POST handlers

### Step 5: Create Admin Emails Config (`app/lib/admin-emails.ts`)
- Reads `ADMIN_EMAILS` from env (comma-separated)
- Exports `isAdminEmail(email: string): boolean`
- Server-side only — never exposed to the client

### Step 6: Update Admin Session (`app/lib/admin-session.ts`)
- Add `createGoogleSessionToken(email, role)` — embeds email + role in the signed payload
- Update `verifySessionToken` to return the payload (email, role, exp) instead of just boolean
- Keep backward compatibility with existing API key sessions

### Step 7: Create Google Auth Callback Route (`app/api/admin/google-callback/route.ts`)
- After Google OAuth, checks if email is in admin list
- Creates signed session cookie with role embedded
- Redirects to `/admin` or shows "not authorized" message

### Step 8: Update Login Page (`app/admin/login/page.tsx`)
- Add large "Sign in with Google" button as the **primary** action (top of form)
- Keep API key input as a small "Or use API key" fallback below
- Use `signIn("google")` from next-auth/react
- Google button gets cathedral styling (teal theme)

### Step 9: Update Middleware (`middleware.ts`)
- Update `isSessionLikelyValid` to handle new payload format (with email/role)
- Allow `/api/auth/*` routes through (NextAuth needs these)
- Keep existing admin route protection logic
- Update CSP to allow `accounts.google.com` and `*.googleusercontent.com`

### Step 10: Update `verifyAdmin` (`app/lib/admin-auth.ts`)
- Add Method 0: Google session with admin role (checked first)
- Extract role from session payload
- If role === "admin", allow access
- If role === "user", return 403 "Not an admin"
- Keep existing Method 1 (session cookie) and Method 2 (bearer token) as fallbacks

### Step 11: Update `.env.example`
- Add all new Google/NextAuth env vars with comments

### Step 12: Update CSP in `next.config.mjs`
- Add Google domains to `connect-src`, `script-src`, `img-src`
- Required for Google's OAuth redirect flow

---

## File Changes Summary

| File | Action | What |
|------|--------|------|
| `package.json` | Edit | Add `next-auth` dependency |
| `.env.example` | Edit | Add Google OAuth + admin email vars |
| `app/lib/auth-config.ts` | **New** | NextAuth config with Google provider + role injection |
| `app/api/auth/[...nextauth]/route.ts` | **New** | NextAuth API route handler |
| `app/lib/admin-emails.ts` | **New** | Admin email list check (server-side) |
| `app/lib/admin-session.ts` | Edit | Add role-aware session tokens |
| `app/lib/admin-auth.ts` | Edit | Add Google session verification |
| `app/admin/login/page.tsx` | Edit | Add Google button as primary sign-in |
| `middleware.ts` | Edit | Allow auth routes, update session check, update CSP |
| `next.config.mjs` | Edit | Update CSP headers for Google domains |

---

## Security Considerations
- Admin emails stored server-side only (env var), never sent to client
- Google OAuth tokens verified by NextAuth (not manually)
- Existing API key auth preserved as fallback
- Session cookies remain httpOnly, secure, sameSite strict
- CSP updated minimally — only Google's required domains added
- Role is signed into the JWT — cannot be tampered with client-side

---

## How It Works (User Flow)

### Regular User
1. Visits `/admin/login`
2. Sees big "Sign in with Google" button
3. Clicks -> Google OAuth redirect -> signs in
4. Email NOT in admin list -> shown "You don't have admin access" message

### Admin User
1. Visits `/admin/login`
2. Clicks "Sign in with Google"
3. Email IS in admin list -> session cookie set with `role: "admin"`
4. Redirected to `/admin` dashboard — full access

### API/Programmatic Access
1. Still works with `Authorization: Bearer <ADMIN_API_KEY>` header
2. No change to existing behavior

---

## Google Cloud Console Setup (User Action Required)
1. Go to https://console.cloud.google.com/
2. Create a project (or use existing)
3. Enable "Google Identity" API
4. Go to Credentials -> Create OAuth 2.0 Client ID
5. Set authorized redirect URI: `https://yourdomain.com/api/auth/callback/google`
6. Copy Client ID and Client Secret into `.env.local`
