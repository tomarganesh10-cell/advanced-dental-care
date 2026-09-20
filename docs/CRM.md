# Lead management

## Why every enquiry becomes a lead

The question a clinic actually pays to answer is "which channel produced paying
patients". Without a single pipeline, the honest answer is "we think Google" and
the ad budget is set on a feeling.

Every website enquiry, booking, international enquiry and logged phone call
creates a `Lead` with first-touch attribution. A booking creates both an
appointment and a lead, so conversion is measurable from one place.

## First touch, not last

Attribution is captured on the first page of the session and stored for its
duration. If someone arrives from a Google ad, reads for a week, then returns by
typing the URL, **the ad produced the booking**. Last-touch attribution would
credit "direct" and the clinic would cut the campaign that worked.

Captured: `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`,
`utm_term`, `gclid`, landing page, referrer.

## Pipeline

```
NEW → CONTACTED → QUALIFIED → APPOINTMENT_BOOKED → VISITED
                                     → TREATMENT_STARTED → WON
                              ↘ LOST
                              ↘ FOLLOW_UP
```

**Marking a lead LOST requires a reason.** A pipeline full of unexplained losses
tells the clinic nothing about what to change. "Chose a clinic closer to home"
and "price" lead to completely different responses.

## Deduplication

A repeat enquiry from the same number within 24 hours attaches to the existing
lead as an activity rather than creating a new row.

Someone filling in two forms in an afternoon is one person. Two rows means two
staff members ring them, which is worse than not ringing at all.

## Follow-up automation

Three WhatsApp messages over seven days, then it **stops**.

| Day | Message                                                           |
| --- | ----------------------------------------------------------------- |
| 0   | Acknowledgement (consent required)                                |
| 1   | "Would you like help finding a consultation time?"                |
| 3   | Information about the treatment they asked about                  |
| 7   | Final offer to arrange a consultation, stated as the last message |

Any reply, booking, or status change past NEW cancels the remainder
(`cancelLeadFollowUps`). Moving a lead out of NEW in the admin panel does the
same — someone who has already spoken to a person should not keep receiving
"would you like help booking?".

A sequence that runs until the person replies is why people block clinic
numbers, and Meta will suspend a business account for it.

The sequence only runs with WhatsApp consent. Without it, the lead is still
captured and still appears in the pipeline for a human to call.

## Source performance

`/admin/leads` shows enquiries and booking rate by source over 90 days.

Booking rate, not just volume, because a source with high volume and a low rate
is usually a targeting problem rather than a volume problem — and the fix is
different.

## Who can see what

Marketing gets the full lead pipeline and **no patient access at all**. A lead
is a marketing object; a patient is a medical one. Once someone becomes a
patient, marketing can see that the lead converted, not what was done to them.
