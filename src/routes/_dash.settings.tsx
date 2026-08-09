import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePassword, updatePin } from "@/lib/meroshare/account.functions";
import { errorMessage } from "@/lib/format";

export const Route = createFileRoute("/_dash/settings")({
  head: () => ({
    meta: [
      { title: "Settings — MeroShare Investor Console" },
      { name: "description", content: "Change your MeroShare password or transaction PIN securely." },
      { property: "og:title", content: "Settings — MeroShare Investor Console" },
      { property: "og:description", content: "Change your MeroShare password or transaction PIN securely." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");

  const passwordMutation = useMutation({
    mutationFn: updatePassword,
    onSuccess: () => { toast.success("Password updated."); setOldPassword(""); setNewPassword(""); },
    onError: (e) => toast.error(errorMessage(e, "Could not change password.")),
  });

  const pinMutation = useMutation({
    mutationFn: updatePin,
    onSuccess: () => { toast.success("Transaction PIN updated."); setOldPin(""); setNewPin(""); },
    onError: (e) => toast.error(errorMessage(e, "Could not change PIN.")),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Security changes are applied directly on MeroShare.</p>
      </div>

      <section className="max-w-md space-y-4 rounded-2xl border border-border/70 bg-card p-5">
        <h2 className="font-display text-base font-semibold">Change password</h2>
        <div className="space-y-2">
          <Label htmlFor="old-password">Current password</Label>
          <Input id="old-password" type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-password">New password</Label>
          <Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </div>
        <Button
          disabled={passwordMutation.isPending || !oldPassword || newPassword.length < 8}
          onClick={() => passwordMutation.mutate({ data: { oldPassword, newPassword } })}
        >
          Update password
        </Button>
      </section>

      <section className="max-w-md space-y-4 rounded-2xl border border-border/70 bg-card p-5">
        <h2 className="font-display text-base font-semibold">Change transaction PIN</h2>
        <div className="space-y-2">
          <Label htmlFor="old-pin">Current PIN</Label>
          <Input id="old-pin" type="password" inputMode="numeric" maxLength={8} value={oldPin} onChange={(e) => setOldPin(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-pin">New 4-digit PIN</Label>
          <Input id="new-pin" type="password" inputMode="numeric" maxLength={4} value={newPin} onChange={(e) => setNewPin(e.target.value)} />
        </div>
        <Button
          disabled={pinMutation.isPending || oldPin.length < 4 || newPin.length !== 4}
          onClick={() => pinMutation.mutate({ data: { oldPin, newPin } })}
        >
          Update PIN
        </Button>
      </section>
    </div>
  );
}
