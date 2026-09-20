# Deployment

## What you need

| Component      | Minimum       | Notes                                                                   |
| -------------- | ------------- | ----------------------------------------------------------------------- |
| Node           | 20.11         | 22 LTS recommended                                                      |
| PostgreSQL     | 16            | Managed, with automated backups                                         |
| Redis          | 7             | Optional but **required if running more than one instance** — see below |
| Object storage | S3-compatible | Must be **private**. Cloudflare R2 or AWS S3 ap-south-1                 |
| TLS            | —             | Session cookies are Secure-only; the app refuses to start on http://    |

Host in or near India. A clinic site served from us-east-1 to patients in
Chandigarh pays 200ms on every request, and Core Web Vitals is a ranking factor.

---

## Environment

Copy `.env.example` and fill it in. `src/lib/env.ts` validates at boot and the
app **refuses to start** in production with:

- a placeholder or short `AUTH_SECRET`
- an `http://` site URL
- `OTP_DEV_ECHO` enabled
- a Razorpay key without its secret or webhook secret
- a storage bucket without credentials

This is deliberate. Silently running with a forgeable session secret is worse
than not starting.

```bash
openssl rand -base64 48      # AUTH_SECRET
```

`SKIP_ENV_VALIDATION=1` relaxes these **at build time only**, so CI can build an
image without production secrets. It has no effect at runtime.

### Redis

Without `REDIS_URL` the rate limiter falls back to an in-process map. That is
correct for one instance and **bypassable behind more than one** — an attacker
reconnects until they land on a different instance. Set it in production.

---

## Deploying

### Docker Compose

```bash
docker compose up -d --build
docker compose exec app npx prisma migrate deploy
```

### Vercel / managed platform

1. Point it at the repository.
2. Build command: `npm run build` (runs `prisma generate` first).
3. Set every variable from `.env.example`.
4. Run `npx prisma migrate deploy` as a release step, not at boot — two
   instances starting together would both try to migrate.
5. Run the worker (below) as a separate process; a serverless function will not
   keep it alive.

### Migrations

```bash
npx prisma migrate deploy    # production: applies, never generates
```

Never `prisma migrate dev` or `prisma db push` against production. The first
can generate a destructive migration; the second skips the migration history
entirely.

Review every migration's SQL before applying. Prisma will drop a column to match
a schema change without asking twice.

---

## The background worker

```bash
npm run worker
```

It drains the notification outbox, prunes expired sessions and OTP challenges,
and refreshes the Google rating cache.

**Without it, no WhatsApp message, email or reminder is ever sent.** Queue rows
accumulate and the admin dashboard raises a warning once the backlog grows, but
the failure is silent to patients until someone notices the reminders stopped.

Run it under a supervisor (systemd, a container restart policy, a platform
worker process). One instance is enough — the drain claims rows with a
conditional update, so a second would be safe but redundant.

---

## Domains

| Host                        | Serves                                     |
| --------------------------- | ------------------------------------------ |
| `chandigarhdentist.com`     | Everything                                 |
| `www.chandigarhdentist.com` | 301 to the apex, or the reverse — pick one |

Admin and the portal live at `/admin` and `/patient-dashboard` rather than
subdomains, so they share the session cookie without cross-domain complexity.
They are `noindex` at the header level, not merely in robots.txt — a robots
entry advertises a path rather than protecting it.

---

## Launch checklist

**Before:**

- [ ] `docs/CONTENT_AUDIT.md` signed off — this is a blocker, not a formality
- [ ] Redirect map reconciled against Search Console (`docs/SEO_MIGRATION.md`)
- [ ] `AUTH_SECRET` generated fresh; not the one from any other environment
- [ ] Database backups configured **and a restore tested** (`docs/BACKUP_RESTORE.md`)
- [ ] Storage bucket confirmed private — try fetching an object URL directly
- [ ] Razorpay webhook registered at `/api/payments/webhook` with its secret
- [ ] WhatsApp templates approved by Meta (`docs/WHATSAPP.md`)
- [ ] Seed data removed; every demo account deleted
- [ ] Real staff accounts created with individual logins — **no shared accounts**;
      the audit trail is worthless if four people share one
- [ ] Doctor schedules entered, holidays loaded
- [ ] Worker running and confirmed sending

**After:**

- [ ] Book a real appointment end to end and confirm the messages arrive
- [ ] Make a ₹1 payment and confirm it settles and appears on the invoice
- [ ] Sign in to the portal as a patient and check only that patient's data appears
- [ ] Confirm `/admin` redirects when signed out
- [ ] Watch Search Console for 404s for eight weeks

---

## Monitoring

Minimum worth having:

- **Uptime** on `/` and `/api/availability?date=…` — the second tells you the
  database is reachable, which the first does not.
- **Queue depth**: alert if `notification_messages` has more than ~50 rows in
  `QUEUED` older than 30 minutes. That means the worker has stopped and patients
  are not being reminded.
- **Failed payments**: alert on any `payments` row in `FAILED` with a
  `gatewayPaymentId`, which means money may have moved without settling.
- **Error rate** from the structured logs. Every response carries an
  `X-Request-Id` that appears in the log line.

Logs are JSON (pino) with structural redaction of passwords, tokens, OTPs and
clinical fields. Ship them somewhere searchable; do not rely on container
stdout.

---

## Scaling

This is a single-clinic system and will run comfortably on one small instance
for years. If it does grow:

- The database is the bottleneck before the application is.
- `SERIALIZABLE` booking transactions will show occasional serialisation
  failures under load. They are retried by the client, not a bug.
- Redis becomes mandatory, not optional.
- `analytics_events` and `audit_logs` grow fastest. Partition by month before
  they become slow, not after.
