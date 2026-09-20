"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import {
  applyStockCountAction,
  openStockCountAction,
  recordCountLineAction,
  type ActionResult,
} from "@/app/admin/inventory/actions";
import { Button } from "@/components/ui/button";

const fieldClass =
  "w-full rounded-(--radius-input) border border-(--color-navy-200) px-3 py-2 text-sm";

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
    </p>
  );
}

export function OpenStockCountForm({
  categories,
}: {
  categories: Array<{ id: string; name: string }>;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  function submit(formData: FormData) {
    startTransition(async () => {
      setResult(await openStockCountAction(formData));
    });
  }

  return (
    <form action={submit} className="grid gap-3 sm:grid-cols-3 sm:items-end">
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="count-category">
          Scope
        </label>
        <select id="count-category" name="categoryId" className={fieldClass} defaultValue="">
          <option value="">Everything in stock</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="count-scope">
          Note
        </label>
        <input
          id="count-scope"
          name="scope"
          type="text"
          className={fieldClass}
          placeholder="e.g. Monthly count, implant cabinet"
        />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
        {pending ? "Opening…" : "Open a count"}
      </Button>

      <div className="sm:col-span-3">
        <Result result={result} />
      </div>
    </form>
  );
}

/**
 * One line of an open count.
 *
 * The expected quantity is shown, which is a deliberate trade-off: hiding it
 * produces a more honest count, but a clinic counting a hundred lines by hand
 * needs to see which ones disagree. The control that matters is that a
 * disagreement cannot be closed without a written reason.
 */
export function CountLineForm({
  lineId,
  expected,
  counted,
  varianceReason,
}: {
  lineId: string;
  expected: number;
  counted: number | null;
  varianceReason: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [value, setValue] = useState(counted === null ? "" : String(counted));

  const parsed = value === "" ? null : Number(value);
  const differs = parsed !== null && Number.isFinite(parsed) && parsed !== expected;

  function submit(formData: FormData) {
    startTransition(async () => {
      setResult(await recordCountLineAction(formData));
    });
  }

  return (
    <form action={submit} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="lineId" value={lineId} />

      <label className="sr-only" htmlFor={`counted-${lineId}`}>
        Counted quantity
      </label>
      <input
        id={`counted-${lineId}`}
        name="countedQuantity"
        type="number"
        min={0}
        step={1}
        required
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="w-24 rounded-(--radius-input) border border-(--color-navy-200) px-2 py-1.5 text-sm tabular-nums"
      />

      {differs ? (
        <>
          <label className="sr-only" htmlFor={`reason-${lineId}`}>
            Why it differs
          </label>
          <input
            id={`reason-${lineId}`}
            name="varianceReason"
            type="text"
            required
            minLength={3}
            defaultValue={varianceReason ?? ""}
            placeholder="Why does it differ?"
            className="min-w-52 flex-1 rounded-(--radius-input) border border-amber-300 bg-amber-50 px-2 py-1.5 text-sm"
          />
        </>
      ) : (
        <input type="hidden" name="varianceReason" value={varianceReason ?? ""} />
      )}

      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>

      {result && !result.ok ? (
        <span className="w-full text-xs text-red-700">{result.message}</span>
      ) : null}
    </form>
  );
}

export function ApplyStockCountForm({ stockCountId }: { stockCountId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [confirming, setConfirming] = useState(false);

  function submit(formData: FormData) {
    startTransition(async () => {
      setResult(await applyStockCountAction(formData));
      setConfirming(false);
    });
  }

  return (
    <div className="space-y-3">
      {confirming ? (
        <form action={submit} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="stockCountId" value={stockCountId} />
          <span className="text-sm">
            Closing writes a correction for every line that differs. This cannot be undone.
          </span>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Closing…" : "Close and correct"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <Button type="button" size="sm" onClick={() => setConfirming(true)}>
          Close this count
        </Button>
      )}
      <Result result={result} />
    </div>
  );
}
