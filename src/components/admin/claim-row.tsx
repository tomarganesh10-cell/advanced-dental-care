"use client";

import { useState, useTransition } from "react";
import { BadgeCheck, ChevronDown, CircleAlert, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { verifyClaimAction } from "@/app/admin/content-verification/actions";
import type { FlatClaim } from "@data/verification";

/**
 * One claim, with its verification form.
 *
 * The form asks for evidence before it will accept VERIFIED, and says so
 * before the user tries — a validation message that only appears after a failed
 * submit teaches people to treat the field as optional.
 */
export function ClaimRow({
  claim,
  stored,
}: {
  claim: FlatClaim;
  stored?: {
    status: string;
    value: unknown;
    evidence: string | null;
    notes: string | null;
    verifiedByName: string | null;
    verifiedAt: Date | null;
  } | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [status, setStatus] = useState(stored?.status ?? claim.status);

  const effectiveStatus = stored?.status ?? claim.status;
  const effectiveValue = stored?.value ?? claim.value;

  const tone =
    effectiveStatus === "VERIFIED"
      ? "success"
      : effectiveStatus === "ARCHIVED"
        ? "neutral"
        : "warning";

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await verifyClaimAction(formData);
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) setOpen(false);
    });
  }

  return (
    <li className="border-b border-(--color-hairline) last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-(--color-navy-50)/50"
      >
        <span className="mt-0.5 shrink-0" aria-hidden="true">
          {effectiveStatus === "VERIFIED" ? (
            <BadgeCheck className="size-4 text-(--color-teal-600)" />
          ) : (
            <CircleAlert className="size-4 text-amber-600" />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-(--color-ink)">{claim.key}</span>
          <span className="mt-0.5 block truncate text-xs text-(--color-ink-subtle)">
            {formatValue(effectiveValue)} · {claim.source}
          </span>
          {claim.notes ? (
            <span className="mt-1 block text-xs leading-relaxed text-amber-800">{claim.notes}</span>
          ) : null}
        </span>

        <span className="flex shrink-0 items-center gap-2">
          <Badge tone={tone}>{effectiveStatus.replace(/_/g, " ").toLowerCase()}</Badge>
          <ChevronDown
            className={`size-4 text-(--color-ink-subtle) transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </span>
      </button>

      {open ? (
        <form
          action={submit}
          className="space-y-3 border-t border-(--color-hairline) bg-(--color-surface-sunken) px-4 py-4"
        >
          <input type="hidden" name="key" value={claim.key} />
          <input type="hidden" name="label" value={claim.label} />
          <input type="hidden" name="source" value={claim.source} />

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Value</span>
              <input
                name="value"
                defaultValue={formatValue(effectiveValue)}
                className="h-9 w-full rounded-lg border border-(--color-navy-200) bg-white px-3 text-sm"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">Status</span>
              <select
                name="status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="h-9 w-full rounded-lg border border-(--color-navy-200) bg-white px-3 text-sm"
              >
                <option value="NEEDS_VERIFICATION">Needs verification</option>
                <option value="VERIFIED">Verified</option>
                <option value="ARCHIVED">Archived (no longer true)</option>
              </select>
            </label>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">
              Evidence
              {status === "VERIFIED" ? <span className="text-(--color-danger)"> *</span> : null}
            </span>
            <input
              name="evidence"
              defaultValue={stored?.evidence ?? ""}
              required={status === "VERIFIED"}
              placeholder="e.g. MDS certificate seen 12 Mar 2026; AERB licence no. XYZ valid to 2028"
              className="h-9 w-full rounded-lg border border-(--color-navy-200) bg-white px-3 text-sm"
            />
            <span className="mt-1 block text-xs text-(--color-ink-subtle)">
              What document did you actually see? A claim cannot be marked verified without this.
            </span>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Accurate as of</span>
              <input
                type="date"
                name="asOf"
                defaultValue={claim.asOf ?? ""}
                className="h-9 w-full rounded-lg border border-(--color-navy-200) bg-white px-3 text-sm"
              />
              <span className="mt-1 block text-xs text-(--color-ink-subtle)">
                For counts and statistics. Shown alongside the number on the site.
              </span>
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">Internal notes</span>
              <input
                name="notes"
                defaultValue={stored?.notes ?? ""}
                className="h-9 w-full rounded-lg border border-(--color-navy-200) bg-white px-3 text-sm"
              />
            </label>
          </div>

          {message ? (
            <p
              role="status"
              className={`rounded-lg p-2.5 text-sm ${
                message.ok
                  ? "bg-(--color-teal-50) text-(--color-teal-900)"
                  : "bg-red-50 text-red-800"
              }`}
            >
              {message.text}
            </p>
          ) : null}

          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Save
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>

            {stored?.verifiedByName && stored.verifiedAt ? (
              <span className="ml-auto text-xs text-(--color-ink-subtle)">
                Verified by {stored.verifiedByName} on{" "}
                {new Date(stored.verifiedAt).toLocaleDateString("en-IN")}
              </span>
            ) : null}
          </div>
        </form>
      ) : null}
    </li>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
