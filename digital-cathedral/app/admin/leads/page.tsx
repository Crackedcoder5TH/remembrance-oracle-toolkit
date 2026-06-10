import { redirect } from "next/navigation";

/**
 * /admin/leads — preserved as a redirect to /admin so existing bookmarks
 * still land on the dashboard (which is where the actual lead list lives).
 *
 * The seed-data utility that used to live at this path was renamed to
 * /admin/seed because its actual purpose is seeding test data, not viewing
 * production leads. Anyone who hits /admin/leads expecting a leads list
 * now lands on the dashboard that has the real list + filters.
 */
export default function AdminLeadsRedirect(): never {
  redirect("/admin");
}
