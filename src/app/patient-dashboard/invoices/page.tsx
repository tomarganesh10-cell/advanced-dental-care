import { Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { PayInvoiceButton } from "@/components/portal/pay-invoice-button";
import { features } from "@/lib/env";
import { formatClinicDate } from "@/lib/time";
import { formatPaise } from "@/lib/utils";
import { requirePatientPage } from "@/server/auth/guards";
import { getPortalInvoices } from "@/server/portal";
import { contact } from "@data/clinic-master-data";

export const dynamic = "force-dynamic";

const STATUS_TONES = {
  ISSUED: "warning",
  PARTIALLY_PAID: "warning",
  PAID: "success",
  CANCELLED: "neutral",
  WRITTEN_OFF: "neutral",
  DRAFT: "neutral",
} as const;

export default async function PortalInvoicesPage() {
  const principal = await requirePatientPage();
  const invoices = await getPortalInvoices(principal);

  const outstanding = invoices.reduce(
    (sum, invoice) => (invoice.status === "PAID" ? sum : sum + invoice.balancePaise),
    0,
  );

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl">Invoices</h1>
        <p className="mt-1 text-sm text-[--color-ink-subtle]">
          {outstanding > 0
            ? `${formatPaise(outstanding)} outstanding across ${invoices.filter((i) => i.status !== "PAID").length} invoice(s).`
            : "Everything is settled."}
        </p>
      </div>

      {invoices.length === 0 ? (
        <EmptyState
          title="No invoices yet"
          description="Invoices appear here once treatment has been billed."
        />
      ) : (
        <ul className="space-y-4">
          {invoices.map((invoice) => (
            <li
              key={invoice.id}
              className="overflow-hidden rounded-[--radius-card] border border-[--color-hairline] bg-white"
            >
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[--color-hairline] px-5 py-4">
                <div>
                  <p className="flex items-center gap-2 font-semibold">
                    <Receipt className="size-4 text-[--color-ink-subtle]" aria-hidden="true" />
                    {invoice.number}
                  </p>
                  <p className="mt-0.5 text-xs text-[--color-ink-subtle]">
                    {invoice.issuedAt ? `Issued ${formatClinicDate(invoice.issuedAt, "d MMM yyyy")}` : "Not yet issued"}
                    {invoice.dueAt ? ` · due ${formatClinicDate(invoice.dueAt, "d MMM yyyy")}` : ""}
                  </p>
                </div>

                <div className="text-right">
                  <p className="font-[family-name:--font-display] text-xl font-semibold tabular-nums">
                    {formatPaise(invoice.totalPaise)}
                  </p>
                  <Badge tone={STATUS_TONES[invoice.status]}>
                    {invoice.status.toLowerCase().replace(/_/g, " ")}
                  </Badge>
                </div>
              </div>

              <table className="w-full text-sm">
                <caption className="sr-only">Items on invoice {invoice.number}</caption>
                <thead className="border-b border-[--color-hairline] bg-[--color-surface-sunken]">
                  <tr>
                    <th scope="col" className="px-5 py-2 text-left font-medium">Treatment</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Qty</th>
                    <th scope="col" className="px-5 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[--color-hairline]">
                  {invoice.items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-5 py-2.5">{item.description}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{item.quantity}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums">
                        {formatPaise(item.lineTotalPaise)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="space-y-1 border-t border-[--color-hairline] px-5 py-3 text-sm">
                <Line label="Subtotal" value={formatPaise(invoice.subtotalPaise)} />
                {invoice.discountPaise > 0 ? (
                  <Line label="Discount" value={`− ${formatPaise(invoice.discountPaise)}`} />
                ) : null}
                {invoice.taxPaise > 0 ? <Line label="Tax" value={formatPaise(invoice.taxPaise)} /> : null}
                <Line label="Total" value={formatPaise(invoice.totalPaise)} emphasise />
                {invoice.paidPaise > 0 ? (
                  <Line label="Paid" value={`− ${formatPaise(invoice.paidPaise)}`} />
                ) : null}
                {invoice.balancePaise > 0 ? (
                  <Line label="Balance due" value={formatPaise(invoice.balancePaise)} emphasise />
                ) : null}
              </div>

              {invoice.balancePaise > 0 && invoice.status !== "CANCELLED" ? (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[--color-hairline] bg-[--color-surface-sunken] px-5 py-3.5">
                  {features.payments ? (
                    <PayInvoiceButton
                      invoiceId={invoice.id}
                      amountLabel={formatPaise(invoice.balancePaise)}
                      invoiceNumber={invoice.number}
                      patientName={principal.fullName}
                      patientPhone={principal.phone}
                    />
                  ) : (
                    <p className="text-sm text-[--color-ink-muted]">
                      Online payment is not enabled. Please pay at the clinic or call{" "}
                      {contact.phone.display}.
                    </p>
                  )}
                  <p className="text-xs text-[--color-ink-subtle]">
                    You can also pay at the clinic by cash, card or UPI.
                  </p>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Line({
  label,
  value,
  emphasise,
}: {
  label: string;
  value: string;
  emphasise?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4">
      <span className={emphasise ? "font-medium" : "text-[--color-ink-subtle]"}>{label}</span>
      <span className={`tabular-nums ${emphasise ? "font-semibold" : ""}`}>{value}</span>
    </div>
  );
}
