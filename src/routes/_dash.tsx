import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/meroshare/auth.functions";

export const Route = createFileRoute("/_dash")({
  beforeLoad: async () => {
    const user = await getCurrentUser();
    if (!user) throw redirect({ to: "/" });
    return { user };
  },
  component: DashLayout,
});

function DashLayout() {
  const { user } = Route.useRouteContext();
  return (
    <AppShell user={user}>
      <Outlet />
    </AppShell>
  );
}
