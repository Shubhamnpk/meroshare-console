import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Merged into the IPO page: /reports now lands on the Applications tab.
 * Kept so old links and bookmarks keep working.
 */
export const Route = createFileRoute("/_dash/reports")({
  beforeLoad: () => {
    throw redirect({ to: "/ipo", search: { tab: "applications" } });
  },
  component: () => null,
});
