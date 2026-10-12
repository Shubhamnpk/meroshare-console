import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { updateGlobalTxn } from "@/lib/world/store";
import type { GlobalTxn } from "@/lib/world/import";

function toDateInput(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  return new Date(t).toISOString().slice(0, 10);
}

/** Edit quantity / price / date / notes. Side, symbol and currency are fixed. */
export function GlobalTxnEditDialog({ txn, onOpenChange }: { txn: GlobalTxn | null; onOpenChange: () => void }) {
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setQty(txn ? String(txn.qty) : "");
    setPrice(txn ? String(txn.price) : "");
    setDate(txn ? toDateInput(txn.date) : "");
    setNotes(txn?.notes ?? "");
    setError("");
  }, [txn]);

  const save = () => {
    if (!txn) return;
    const q = Number(qty);
    const p = Number(price);
    if (txn.side !== "CASH" && !(q > 0)) {
      setError("Quantity must be above zero.");
      return;
    }
    if (!(p >= 0)) {
      setError("Price must be zero or above.");
      return;
    }
    const d = date ? new Date(`${date}T00:00:00Z`).toISOString() : txn.date;
    if (!Number.isFinite(new Date(d).getTime())) {
      setError("Pick a valid date.");
      return;
    }
    const ok = updateGlobalTxn(txn.id, { qty: q, price: p, date: d, notes });
    if (!ok) {
      setError("Row no longer exists.");
      return;
    }
    toast.success("Transaction updated.");
    onOpenChange();
  };

  return (
    <Dialog open={Boolean(txn)} onOpenChange={(next) => !next && onOpenChange()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle>
            Edit {txn?.side} {txn?.symbol || ""}
          </DialogTitle>
          <DialogDescription>
            Quantity, price ({txn?.currency || "—"}), date and notes. Side, symbol and currency are fixed — delete and
            re-import to change those.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="gtxn-qty">Quantity</Label>
            <Input id="gtxn-qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gtxn-price">Price / share</Label>
            <Input id="gtxn-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="gtxn-date">Date</Label>
            <Input id="gtxn-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="gtxn-notes">Notes</Label>
            <Input id="gtxn-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onOpenChange}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={save}>
            Save changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
