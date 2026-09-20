# Inventory and stock labelling

## Why this is not a generic stock system

Three things about a dental clinic drive the design:

1. **Implants and biomaterials are regulated medical devices.** When a
   manufacturer recalls a lot, the clinic must be able to name every patient who
   received an item from it. So stock is held **per batch**, and issuing records
   the batch — not just the item — and can point at the appointment it was used
   in.
2. **Most of the stock expires.** Anaesthetic, composite, impression material
   and biomaterials all have dates. Issuing therefore draws from the batch that
   expires **soonest**, not the one that arrived first.
3. **The balance has to reconcile against a physical shelf.** Quantities are
   whole numbers in the item's own unit. Storing 0.1 of a bottle invites float
   drift into a number someone counts by hand.

## The invariant

> For every batch, the sum of its stock movements equals `quantityRemaining`,
> and that number is never negative.

Everything else is bookkeeping. `tests/integration/inventory.test.ts` asserts it
after every operation it exercises, including under concurrency.

`quantityRemaining` on the batch is the authoritative balance. It changes only
inside the same transaction that writes the matching `StockMovement` row, so the
ledger and the balance cannot drift apart.

## Concurrency

Two people picking the last implant at the same moment is the same problem as
two patients booking the last slot, and gets the same answer: the balance is
read and written inside one `SERIALIZABLE` transaction, with a conditional
update that only matches if the row has not moved since it was read.

A loser gets `ConcurrentStockMovementError` and can retry safely — nothing was
written. A genuine shortage gets `InsufficientStockError` instead.

Reading the balance first and writing it afterwards, outside a transaction,
would let both succeed. That is the bug this design exists to prevent.

## FEFO, not FIFO

`issueStock` orders open batches by `expiryDate` ascending, nulls last, then by
`receivedAt`. In a clinic these differ often: a delivery with three months left
routinely arrives after one with a year. Picking by arrival order throws away
the short-dated stock.

A caller can pin a specific batch when the physical box in hand is what matters.
The UI defaults to FEFO and says why.

## Stock movements

| Type               | Sign | Reason required | Used for                               |
| ------------------ | ---- | --------------- | -------------------------------------- |
| `RECEIPT`          | +    | no              | Goods in. The only type that creates a batch. |
| `ISSUE`            | −    | no              | Consumed in a treatment or clinic use  |
| `RETURN`           | +    | no              | Came back unused                       |
| `ADJUSTMENT`       | ±    | **yes**         | Deliberate correction                  |
| `WASTAGE`          | −    | **yes**         | Damaged, contaminated, dropped         |
| `EXPIRY_WRITE_OFF` | −    | **yes**         | Passed its date                        |
| `COUNT_CORRECTION` | ±    | **yes**         | Reconciliation after a physical count  |

A reason is mandatory for everything that removes stock without a patient
attached. Unexplained shrinkage is exactly what a stock system exists to make
visible, and an optional free-text field is how it stays invisible.

Movements are append-only. A mistake is corrected by another movement, never by
editing the history.

## Labels

Each batch gets a `labelCode` — `ADC-B-` plus six characters from an alphabet
with no lookalikes (no O/0, no I/1), because someone will eventually read one
out over the phone.

`/admin/inventory/labels` prints an A4 sheet laid out for 70 × 37 mm stock,
24 per sheet. Each label carries the item name, SKU, lot number, expiry date,
storage location and a **Code 128-B barcode** of the label code.

The barcode encoder is hand-written (`src/lib/barcode.ts`) rather than a
dependency, because the application's CSP blocks external scripts and the sheet
has to render server-side into printable SVG. It is covered by round-trip tests
plus checks of the pattern table against the specification.

**The barcode encodes the label code and nothing else.** Encoding the expiry
date into the symbol would freeze a fact the system may later correct.

### Printing

- **100% scale, not "fit to page".** A barcode scaled down by a few percent
  stops scanning reliably.
- Headers and footers off, or they overlap the top row.
- Print a test sheet on plain paper and scan it before committing label stock.

A handheld scanner types the code and presses Enter; `GET /api/inventory/scan`
answers from the code alone.

## Stock counts

A count is three steps, deliberately:

1. **Open it.** Snapshots the expected quantity of every batch in scope. The
   snapshot is taken once. Comparing against a live balance at apply time would
   silently absorb any movement made while the shelf was being counted — which
   is exactly the discrepancy a count exists to surface.
2. **Record what was found**, line by line.
3. **Apply it.** Writes a `COUNT_CORRECTION` movement for every line that
   differs.

Applying **refuses** if any line with a variance has no reason recorded.

Lines that were never counted are left alone rather than treated as zero, so
stopping halfway does not write off the entire shelf.

## Permissions

Split finer than most resources, because the interesting risk is not reading
stock levels — it is writing them.

| Permission             | Who has it by default                                    |
| ---------------------- | -------------------------------------------------------- |
| `inventory:view`       | Everyone except marketing                                 |
| `inventory:manage`     | Clinic admin, manager                                     |
| `inventory:receive`    | Clinic admin, manager, assistant, receptionist            |
| `inventory:issue`      | Clinic admin, doctor, assistant                           |
| `inventory:adjust`     | Clinic admin, manager **only**                            |
| `inventory:count`      | Clinic admin, manager, assistant                          |
| `inventory:label`      | Clinic admin, manager, assistant                          |
| `inventory:view_cost`  | Clinic admin, manager, accountant                         |

Two deliberate choices:

- **`inventory:adjust` is narrow.** It is the permission that lets stock leave
  without a patient. A dental assistant can pick stock all day and cannot write
  any off.
- **Cost is separate from stock level.** The query layer omits cost fields
  entirely rather than hiding them in the component — returning them and styling
  them away would put the clinic's margins one devtools panel away from anyone
  who can see the stock list.

## Expiry

`writeOffExpiredStock()` sweeps every batch past its date. Run it from the
scheduled job (`npm run worker`, or `/api/cron/drain` on a serverless host).

Expired stock left on the books overstates what the clinic can actually use,
which is how a treatment gets planned around material that has to be thrown
away. `/admin/inventory/expiry` shows the window ahead, soonest first — the
batches worth acting on are the ones with a few weeks left, not the ones already
red.

`receiveStock` refuses stock that is already expired. It is almost always a
data-entry slip, and accepting it silently puts unusable stock into the picking
order.

## Answering a recall

```
getBatchRecipients(batchId)
```

Returns every patient who received stock from a batch, with the appointment and
date. It reads the **movement ledger** rather than the batch, because the batch
is usually long exhausted by the time a notice arrives.

For this to work, two things must actually happen in daily use:

1. Batch-tracked items must be received with the **manufacturer's** batch number
   — that is the string a recall notice quotes. `receiveStock` refuses to accept
   a batch-tracked item without one.
2. Stock must be issued **against the appointment**, not in bulk at the end of
   the week. A bulk issue records that stock left; it cannot say who it went to.
