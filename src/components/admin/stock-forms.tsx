"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import {
  adjustStockAction,
  issueStockAction,
  receiveStockAction,
  writeOffExpiredAction,
  type ActionResult,
} from "@/app/admin/inventory/actions";
import { Button } from "@/components/ui/button";

/**
 * Stock forms.
 *
 * All of them share one shape: submit, show what the server said, and never
 * pretend the write succeeded before it did. Stock quantities are the kind of
 * number people reconcile against a physical shelf, so an optimistic update
 * that later turns out to be wrong is worse than a half-second wait.
 */

const fieldClass =
  "w-full rounded-(--radius-input) border border-(--color-navy-200) px-3 py-2 text-sm";
const labelClass = "mb-1 block text-sm font-medium";

function Result({ result }: { result: ActionResult | null }) {
  if (!result) return null;

  return (
    <p
      role="status"
      className={
        result.ok
          ? "rounded-(--radius-input) bg-(--color-teal-50) px-3 py-2 text-sm text-(--color-teal-900)"
          : "rounded-(--radius-input) bg-red-50 px-3 py-2 text-sm text-red-900"
      }
    >
      {result.message}
      {result.ok && result.batchId ? (
        <>
          {" "}
          <Link
            href={`/admin/inventory/labels?batch=${result.batchId}`}
            className="font-medium underline"
          >
            Print the label
          </Link>
          .
        </>
      ) : null}
    </p>
  );
}

export interface ItemOption {
  id: string;
  name: string;
  sku: string;
  unit: string;
  requiresBatchTracking: boolean;
  requiresExpiryTracking: boolean;
}

export function ReceiveStockForm({
  items,
  suppliers,
  canSeeCost,
}: {
  items: ItemOption[];
  suppliers: Array<{ id: string; name: string }>;
  canSeeCost: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [itemId, setItemId] = useState(items[0]?.id ?? "");

  const selected = items.find((item) => item.id === itemId);

  function submit(formData: FormData) {
    startTransition(async () => {
      setResult(await receiveStockAction(formData));
    });
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-(--color-ink-muted)">
        There are no active stock items to receive against yet.
      </p>
    );
  }

  return (
    <form action={submit} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className={labelClass} htmlFor="receive-item">
          Item
        </label>
        <select
          id="receive-item"
          name="itemId"
          className={fieldClass}
          value={itemId}
          onChange={(event) => setItemId(event.target.value)}
          required
        >
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} ({item.sku})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass} htmlFor="receive-quantity">
          Quantity {selected ? `(${selected.unit.toLowerCase()})` : ""}
        </label>
        <input
          id="receive-quantity"
          name="quantity"
          type="number"
          min={1}
          step={1}
          required
          className={fieldClass}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="receive-batch">
          Batch / lot number{" "}
          {selected?.requiresBatchTracking ? (
            <span className="text-red-700">required</span>
          ) : (
            <span className="font-normal text-(--color-ink-subtle)">optional</span>
          )}
        </label>
        <input
          id="receive-batch"
          name="batchNumber"
          type="text"
          className={fieldClass}
          required={selected?.requiresBatchTracking ?? false}
          placeholder="As printed on the packaging"
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="receive-expiry">
          Expiry date{" "}
          {selected?.requiresExpiryTracking ? (
            <span className="text-red-700">required</span>
          ) : (
            <span className="font-normal text-(--color-ink-subtle)">optional</span>
          )}
        </label>
        <input
          id="receive-expiry"
          name="expiryDate"
          type="date"
          className={fieldClass}
          required={selected?.requiresExpiryTracking ?? false}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="receive-supplier">
          Supplier
        </label>
        <select id="receive-supplier" name="supplierId" className={fieldClass} defaultValue="">
          <option value="">Not recorded</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass} htmlFor="receive-invoice">
          Supplier invoice / challan
        </label>
        <input id="receive-invoice" name="invoiceRef" type="text" className={fieldClass} />
      </div>

      {canSeeCost ? (
        <div>
          <label className={labelClass} htmlFor="receive-cost">
            Cost per unit (₹)
          </label>
          <input
            id="receive-cost"
            name="unitCostRupees"
            type="number"
            min={0}
            step="0.01"
            className={fieldClass}
          />
        </div>
      ) : null}

      <div className="sm:col-span-2">
        <label className={labelClass} htmlFor="receive-notes">
          Notes
        </label>
        <input id="receive-notes" name="notes" type="text" className={fieldClass} />
      </div>

      <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
          {pending ? "Receiving…" : "Receive stock"}
        </Button>
        <span className="text-xs text-(--color-ink-subtle)">
          A label code is generated automatically and can be printed straight away.
        </span>
      </div>

      <div className="sm:col-span-2">
        <Result result={result} />
      </div>
    </form>
  );
}

export function IssueStockForm({
  itemId,
  unit,
  batches,
}: {
  itemId: string;
  unit: string;
  batches: Array<{ id: string; labelCode: string; batchNumber: string | null; remaining: number }>;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  function submit(formData: FormData) {
    startTransition(async () => {
      setResult(await issueStockAction(formData));
    });
  }

  return (
    <form action={submit} className="grid gap-3 sm:grid-cols-4 sm:items-end">
      <input type="hidden" name="itemId" value={itemId} />

      <div>
        <label className={labelClass} htmlFor="issue-quantity">
          Quantity ({unit.toLowerCase()})
        </label>
        <input
          id="issue-quantity"
          name="quantity"
          type="number"
          min={1}
          step={1}
          required
          className={fieldClass}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="issue-batch">
          Batch
        </label>
        <select id="issue-batch" name="batchId" className={fieldClass} defaultValue="">
          <option value="">Earliest expiry first</option>
          {batches.map((batch) => (
            <option key={batch.id} value={batch.id}>
              {batch.batchNumber ?? batch.labelCode} — {batch.remaining} left
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass} htmlFor="issue-reason">
          Used for
        </label>
        <input
          id="issue-reason"
          name="reason"
          type="text"
          className={fieldClass}
          placeholder="e.g. Implant placement, surgery 2"
        />
      </div>

      <Button type="submit" disabled={pending} variant="secondary">
        {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
        {pending ? "Issuing…" : "Issue"}
      </Button>

      <div className="sm:col-span-4">
        <Result result={result} />
      </div>
    </form>
  );
}

export function AdjustBatchForm({
  batchId,
  itemId,
  remaining,
}: {
  batchId: string;
  itemId: string;
  remaining: number;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [open, setOpen] = useState(false);

  function submit(formData: FormData) {
    startTransition(async () => {
      const outcome = await adjustStockAction(formData);
      setResult(outcome);
      if (outcome.ok) setOpen(false);
    });
  }

  if (!open) {
    return (
      <>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)}>
          Adjust
        </Button>
        <Result result={result} />
      </>
    );
  }

  return (
    <form action={submit} className="grid gap-2 rounded-(--radius-input) bg-(--color-surface-sunken) p-3">
      <input type="hidden" name="batchId" value={batchId} />
      <input type="hidden" name="itemId" value={itemId} />

      <label className="text-xs font-medium" htmlFor={`adjust-type-${batchId}`}>
        Reason type
      </label>
      <select id={`adjust-type-${batchId}`} name="type" className={fieldClass} defaultValue="WASTAGE">
        <option value="WASTAGE">Wastage — damaged, dropped or contaminated</option>
        <option value="EXPIRY_WRITE_OFF">Expired</option>
        <option value="ADJUSTMENT">Correction</option>
        <option value="RETURN">Returned to stock</option>
      </select>

      <label className="text-xs font-medium" htmlFor={`adjust-delta-${batchId}`}>
        Change (negative removes; {remaining} on hand)
      </label>
      <input
        id={`adjust-delta-${batchId}`}
        name="delta"
        type="number"
        step={1}
        required
        defaultValue={-1}
        className={fieldClass}
      />

      <label className="text-xs font-medium" htmlFor={`adjust-reason-${batchId}`}>
        What happened
      </label>
      <input
        id={`adjust-reason-${batchId}`}
        name="reason"
        type="text"
        required
        minLength={3}
        className={fieldClass}
        placeholder="Required — this is the audit trail"
      />

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>

      <Result result={result} />
    </form>
  );
}

export function WriteOffExpiredButton({ expiredUnits }: { expiredUnits: number }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [confirming, setConfirming] = useState(false);

  function run() {
    startTransition(async () => {
      setResult(await writeOffExpiredAction());
      setConfirming(false);
    });
  }

  if (expiredUnits === 0) {
    return <Result result={result} />;
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {confirming ? (
        <>
          <span className="text-sm">
            Write off all {expiredUnits} expired {expiredUnits === 1 ? "unit" : "units"}?
          </span>
          <Button type="button" size="sm" variant="danger" onClick={run} disabled={pending}>
            {pending ? "Writing off…" : "Yes, write them off"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </>
      ) : (
        <Button type="button" size="sm" variant="danger" onClick={() => setConfirming(true)}>
          Write off expired stock
        </Button>
      )}
      <Result result={result} />
    </div>
  );
}
