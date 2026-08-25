import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSettings } from "@/lib/settings";
import { updatePassword, updatePin } from "@/lib/meroshare/account.functions";
import { errorMessage } from "@/lib/format";

function SecretField({
  id,
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          maxLength={maxLength}
          autoComplete={autoComplete}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 pr-10"
        />
        <button
          type="button"
          aria-label={show ? "Hide" : "Show"}
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );
}

export function PasswordDialog() {
  const { passwordOpen, closePassword } = useSettings();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const match = newPassword.length > 0 && confirmPassword === newPassword;
  const valid = oldPassword.length > 0 && newPassword.length >= 8 && match;

  const mutation = useMutation({
    mutationFn: updatePassword,
    onSuccess: () => {
      toast.success("Password updated.", {
        description: "Use your new password next time you sign in.",
      });
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      closePassword();
    },
    onError: (e) => toast.error(errorMessage(e, "Could not change password.")),
  });

  return (
    <Dialog open={passwordOpen} onOpenChange={(next) => !next && closePassword()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>
            Used to sign in to your MeroShare account. Changes apply directly on MeroShare.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate({ data: { oldPassword, newPassword } });
          }}
        >
          <SecretField
            id="pw-old"
            label="Current password"
            value={oldPassword}
            onChange={setOldPassword}
            autoComplete="current-password"
          />
          <SecretField
            id="pw-new"
            label="New password"
            value={newPassword}
            onChange={setNewPassword}
            maxLength={128}
            autoComplete="new-password"
          />
          <SecretField
            id="pw-confirm"
            label="Confirm new password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
          />
          {confirmPassword.length > 0 && !match && (
            <p className="text-xs text-red-600">Passwords do not match.</p>
          )}
          <Button type="submit" disabled={mutation.isPending || !valid} className="w-full">
            {mutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Updating…
              </>
            ) : (
              "Update password"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PinDialog() {
  const { pinOpen, closePin } = useSettings();
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");

  const mutation = useMutation({
    mutationFn: updatePin,
    onSuccess: () => {
      toast.success("Transaction PIN updated.", {
        description: "Your new PIN applies to your next transaction.",
      });
      setOldPin("");
      setNewPin("");
      closePin();
    },
    onError: (e) => toast.error(errorMessage(e, "Could not change PIN.")),
  });

  return (
    <Dialog open={pinOpen} onOpenChange={(next) => !next && closePin()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change transaction PIN</DialogTitle>
          <DialogDescription>
            Required to approve share applications and payments. Exactly 4 digits, applied directly
            on MeroShare.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate({ data: { oldPin, newPin } });
          }}
        >
          <SecretField
            id="pin-old"
            label="Current PIN"
            value={oldPin}
            onChange={setOldPin}
            placeholder="4 to 8 digits"
          />
          <SecretField
            id="pin-new"
            label="New 4-digit PIN"
            value={newPin}
            onChange={(v) => setNewPin(v.replace(/\D/g, "").slice(0, 4))}
            placeholder="••••"
          />
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" />
            Use a number you won't forget. There is no recovery without your DP.
          </div>
          <Button
            type="submit"
            disabled={mutation.isPending || oldPin.length < 4 || newPin.length !== 4}
            className="w-full"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Updating…
              </>
            ) : (
              "Update PIN"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SecurityDialogs() {
  return (
    <>
      <PasswordDialog />
      <PinDialog />
    </>
  );
}
