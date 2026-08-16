import { PortalLanding } from "./portal-landing";

/** Public operational entry point. Authentication remains on the existing role-specific routes. */
export default function PortalIndexPage() {
  return <PortalLanding />;
}
