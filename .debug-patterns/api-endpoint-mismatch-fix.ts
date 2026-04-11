// FIX: Portal pages must use portal API routes, not legacy client API routes
//
// WRONG — portal welcome page calls legacy client login:
//   fetch("/api/client/login", { ... })
//   fetch("/api/client/profile")
//
// RIGHT — portal welcome page calls portal API:
//   fetch("/api/portal/login", { ... })
//   fetch("/api/portal/session")
//
// When two API route sets exist (e.g., /api/client/* and /api/portal/*),
// each UI page must use the matching API. Mismatched routes cause:
// - Different session cookies being set (CLIENT_SESSION_COOKIE vs PORTAL_SESSION_COOKIE)
// - Different response formats (data.success vs data.error)
// - Session verification failures on subsequent requests
