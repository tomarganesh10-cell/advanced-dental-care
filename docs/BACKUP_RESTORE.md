# Backup and restore

A backup you have never restored is a hypothesis, not a backup.

## What must be backed up

| Data              | Where                              | Loss means                                             |
| ----------------- | ---------------------------------- | ------------------------------------------------------ |
| PostgreSQL        | Managed backups + your own dumps   | Every patient record, appointment, invoice and payment |
| Patient documents | S3-compatible bucket               | Every X-ray, CBCT and clinical photograph              |
| `.env`            | Your secret manager, **never git** | Inability to decrypt or authenticate anything          |

The database and the documents must be recoverable to a **consistent point**. A
database restored to Tuesday alongside documents from Thursday produces records
that reference files that do not exist.

## Database

### Automated

Use the managed provider's automated backups. Confirm:

- Daily full backups with point-in-time recovery
- Retention of at least 30 days
- Backups encrypted at rest
- Backups stored in a **different** region or account from the primary

### Your own

Provider backups are convenient and are also inside the provider. Keep an
independent copy.

```bash
pg_dump --format=custom --compress=9 \
  --file="adcc-$(date +%F).dump" "$DATABASE_URL"

# Encrypt before it leaves the machine — this file is the entire clinic.
age -r "$AGE_PUBLIC_KEY" -o "adcc-$(date +%F).dump.age" "adcc-$(date +%F).dump"
shred -u "adcc-$(date +%F).dump"
```

Upload the encrypted file to storage that the application's own credentials
cannot reach. If an attacker compromises the app, they should not also be able
to delete the backups.

### Restore

```bash
createdb adcc_restore
pg_restore --dbname="postgresql://…/adcc_restore" --no-owner --clean adcc-2026-09-19.dump
```

Restore to a **new** database first, verify it, then cut over. Restoring over a
live database converts a recoverable incident into an unrecoverable one.

Verify before cutting over:

```sql
SELECT count(*) FROM patients WHERE "deletedAt" IS NULL;
SELECT count(*) FROM appointments;
SELECT max("createdAt") FROM appointments;   -- how much did we lose?
SELECT count(*) FROM payments WHERE status = 'SUCCESS' AND "verifiedAt" IS NOT NULL;
```

## Patient documents

Enable **versioning** and a lifecycle rule on the bucket. Versioning turns an
accidental or malicious delete into a recoverable event.

Replicate to a second bucket in another region:

```bash
aws s3 sync "s3://adcc-patient-documents" "s3://adcc-documents-backup" \
  --source-region ap-south-1 --region ap-southeast-1
```

Documents are already encrypted at rest (AES-256) and the replica inherits that.

### Orphan check

Storage and database drift. Run monthly:

```sql
SELECT count(*) FROM patient_documents WHERE "deletedAt" IS NULL;
```

Compare against the object count in the bucket. Objects with no row are
orphans — likely a failed upload. Rows with no object are worse: a patient
record referencing a radiograph that no longer exists.

## Restore drill

**Every quarter. Put it in a calendar.**

1. Restore the latest dump to a scratch database.
2. Point a staging instance at it.
3. Sign in as staff. Open a patient record. Open an appointment.
4. Sign in as a patient. Confirm appointments and invoices appear.
5. Download a document — this tests database _and_ storage together.
6. Record how long the whole thing took.

That last number is your real recovery time objective. Most teams discover it is
four times what they assumed, and they discover it during a drill rather than
during an incident.

## Retention and deletion

Dental records carry statutory retention periods that outlast a patient's
relationship with the practice, so backups holding deleted records is expected
and lawful — see `docs/PATIENT_RIGHTS` and the site's own data rights page.

When a deletion request is actioned, record in `data_subject_requests` what was
deleted, what was retained and the legal basis. Backups age out naturally; do
not attempt to surgically edit historical backups, which destroys their
integrity as evidence.

## What to do in an incident

1. **Stop writing.** Put the application in maintenance before anything else. A
   corrupted database that is still accepting bookings gets worse every minute.
2. Identify the last known-good point.
3. Restore to a new database.
4. Verify with the queries above.
5. Cut over.
6. Reconcile payments against Razorpay's dashboard — money may have moved during
   the gap, and the webhook retries will help but should be checked, not assumed.
7. Write down what happened, same day, while it is accurate.
