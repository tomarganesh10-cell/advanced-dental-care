import { barcodeSvg } from "@/lib/barcode";
import { formatClinicDate } from "@/lib/time";

/**
 * A4 sheet of stock labels, laid out for the 70 × 37 mm / 24-per-sheet stationery
 * that every Indian stationer carries.
 *
 * Rendered server-side into inline SVG rather than drawn in the browser: the
 * app's CSP blocks external scripts, and a label sheet that depends on
 * JavaScript having run is a label sheet that prints blank often enough to
 * matter.
 *
 * Dimensions are in millimetres throughout. Print CSS is the one place where
 * physical units are the right unit — the label stock is a fixed physical size,
 * and expressing it in pixels makes correctness depend on the printer's DPI.
 */

export interface StockLabel {
  id: string;
  labelCode: string;
  batchNumber: string | null;
  expiryDate: Date | null;
  receivedAt: Date;
  quantityRemaining: number;
  itemName: string;
  sku: string;
  unit: string;
  storageLocation: string | null;
  supplierName: string | null;
}

/**
 * `now` is passed in rather than read here: this is a component body, and
 * reading the clock during render is impure.
 */
export function StockLabelSheet({ labels, now }: { labels: StockLabel[]; now: Date }) {
  return (
    <>
      <style>{`
        .label-sheet {
          display: grid;
          grid-template-columns: repeat(3, 70mm);
          grid-auto-rows: 37mm;
          gap: 0;
          width: 210mm;
          margin-inline: auto;
          background: #fff;
        }
        .stock-label {
          box-sizing: border-box;
          padding: 2.5mm 3mm;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          overflow: hidden;
          color: #000;
          /* Cutting guides on screen; removed for print so they do not appear
             on the label stock, which is already die-cut. */
          outline: 0.2mm dashed #c7d0d9;
          outline-offset: -0.1mm;
        }
        .stock-label__name {
          font-size: 3.2mm;
          font-weight: 700;
          line-height: 1.15;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .stock-label__meta {
          font-size: 2.3mm;
          line-height: 1.3;
          font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
        }
        .stock-label__expiry--soon { font-weight: 700; }
        .stock-label__barcode { height: 9mm; display: block; }
        .stock-label__barcode svg { height: 100%; width: auto; max-width: 100%; }

        @media screen {
          .label-sheet {
            border: 1px solid #d5dde5;
            padding: 8mm 0;
            box-shadow: 0 1px 3px rgb(15 29 42 / 0.08);
          }
        }

        @media print {
          @page { size: A4 portrait; margin: 8mm 0 0 0; }
          .label-sheet { border: 0; padding: 0; box-shadow: none; }
          .stock-label { outline: none; }
        }
      `}</style>

      <div className="label-sheet">
        {labels.map((label) => {
          const expiringSoon =
            label.expiryDate !== null &&
            label.expiryDate.getTime() - now.getTime() < 60 * 24 * 60 * 60 * 1000;

          return (
            <div key={label.id} className="stock-label">
              <div>
                <p className="stock-label__name">{label.itemName}</p>
                <p className="stock-label__meta">
                  {label.sku}
                  {label.batchNumber ? ` · LOT ${label.batchNumber}` : ""}
                </p>
                <p
                  className={
                    expiringSoon ? "stock-label__meta stock-label__expiry--soon" : "stock-label__meta"
                  }
                >
                  {label.expiryDate
                    ? `EXP ${formatClinicDate(label.expiryDate)}`
                    : "No expiry date"}
                  {label.storageLocation ? ` · ${label.storageLocation}` : ""}
                </p>
              </div>

              <div
                className="stock-label__barcode"
                // The SVG is generated from a code this application created and
                // stored; it contains no caller-supplied markup.
                dangerouslySetInnerHTML={{
                  __html: barcodeSvg(label.labelCode, {
                    moduleWidth: 1,
                    height: 26,
                    showText: true,
                    title: `Stock batch ${label.labelCode}`,
                  }),
                }}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}
