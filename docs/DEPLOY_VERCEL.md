# Deploying to Vercel with Neon

The fastest route to a working URL. For a clinic that wants patient records on
infrastructure it controls, read `DEPLOYMENT.md` and use Docker Compose instead.

Read the caveats at the bottom before committing to this route — one of them
decides whether you need a paid Vercel plan.

---

## 1. Database — Neon

1. Sign up at neon.tech, create a project.
2. Region: **AWS ap-southeast-1 (Singapore)**. It is the closest Neon offers to
   Chandigarh; a US region adds roughly 200ms to every query.
3. Copy the **pooled** connection string. It looks like:

   ```
   postgresql://USER:PASSWORD@ep-xxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```

Use the pooled string, not the direct one. Serverless functions open a
connection per invocation and will exhaust a direct Postgres connection limit
under ordinary load.

Keep the password out of chat, email and Git. Paste it only into Vercel's
environment variable screen.

---

## 2. Import the repository

In Vercel: **Add New → Project → Import** the `advanced-dental-care` repo.

Leave the framework preset alone — `vercel.json` already sets the build command
and pins the region to `bom1` (Mumbai), so functions run near the patients.

---

## 3. Environment variables

Set these in **Project → Settings → Environment Variables** before the first
deploy. The app refuses to boot without them, which is the intended behaviour.

| Variable              | Value                                                     |
| --------------------- | --------------------------------------------------------- |
| `DATABASE_URL`        | the pooled Neon string from step 1                        |
| `NEXT_PUBLIC_SITE_URL`| `https://<your-project>.vercel.app` — **https, no slash**  |
| `AUTH_SECRET`         | `openssl rand -base64 48`                                 |
| `CRON_SECRET`         | `openssl rand -hex 32`                                    |

Generate the two secrets on your own machine:

```bash
openssl rand -base64 48      # AUTH_SECRET
openssl rand -hex 32         # CRON_SECRET
```

Everything else in `.env.example` is optional and can wait. Leaving
`WHATSAPP_PROVIDER`, `EMAIL_PROVIDER` and `SMS_PROVIDER` at `console` means
messages are logged rather than sent, which is correct until Meta approves the
templates. `STORAGE_BUCKET` must stay **empty** until you have real credentials
— a bucket name without keys is a boot failure, deliberately.

Once you point a real domain at the project, update `NEXT_PUBLIC_SITE_URL` to
that domain and redeploy. It is what canonical URLs, the sitemap and signed
links are built from.

---

## 4. Deploy

Press Deploy. The build runs `prisma migrate deploy` first, so the schema is
created on the first deploy with no manual step.

Then seed the first administrator. From a machine with the repo checked out:

```bash
DATABASE_URL='<the same pooled Neon string>' \
SEED_ADMIN_EMAIL='you@example.com' \
SEED_ADMIN_PASSWORD='<a real password>' \
npm run db:seed
```

Sign in at `/staff-login`, then **create your real staff accounts and delete the
seeded demo ones**. Individual logins are not bureaucracy here: the audit trail
records who opened which patient record, and it is worthless if four people
share an account.

---

## 5. Check it

```bash
curl https://<your-project>.vercel.app/api/health     # {"status":"ok"}
```

Then walk one booking through end to end and confirm the appointment appears in
`/admin/appointments`.

---

## Caveats

**Cron frequency decides your plan.** `vercel.json` schedules
`/api/cron/drain` every five minutes, which is what sends confirmations and
reminders. **Vercel's Hobby plan runs cron jobs once a day** and will quietly
clamp that schedule — a patient would book and hear nothing for up to 24 hours.
Either use a paid plan, or run `npm run worker` on any always-on machine with
`DATABASE_URL` set. A worker on a small VPS alongside Vercel hosting is a
perfectly reasonable arrangement.

**Migrations run during the build.** Convenient, but a preview deployment from a
branch migrates the same database as production. Fine for one clinic on one
environment; give preview builds their own Neon branch if that changes.

**Patient documents need object storage.** X-rays and scans go to an
S3-compatible bucket, not to the host's filesystem — a serverless filesystem does
not persist. Until `STORAGE_*` is configured, document upload is unavailable
while everything else works.

**Vercel is a US company processing data for an Indian clinic.** That is a
question for whoever advises the practice on patient data, not a technical
blocker. It is the main argument for the Docker Compose route.
