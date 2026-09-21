# Deploying on Hostinger

## Read this first: which Hostinger plan

| Hostinger product | Runs this app? |
| --- | --- |
| **VPS (KVM 1/2/4/8)** | **Yes.** This is the supported target. |
| Shared / Premium / Business | **No.** |
| Cloud Startup / Professional | **No.** |
| Website Builder | No. |

Everything except the VPS line is LiteSpeed serving PHP against MySQL. This
application is a long-running Node 22 server with PostgreSQL 16 and a
background worker process. None of those three exist on shared hosting, and no
amount of configuration adds them — there is no shell daemon, no PostgreSQL,
and processes are killed between requests.

If the clinic is on a shared plan today, there are two honest options:

1. **Upgrade to a Hostinger VPS.** KVM 2 (2 vCPU, 8 GB) is comfortable for a
   single clinic. KVM 1 (1 vCPU, 4 GB) works but the first Docker build is
   slow.
2. **Keep the shared plan for the domain and email, and host the application
   somewhere that runs Node** (see `DEPLOY_VERCEL.md`). Point the domain's DNS
   at that host. This is a perfectly normal arrangement.

Pick a **datacentre in India** when creating the VPS. Hostinger has one in
Mumbai. A clinic site served from Europe pays roughly 150ms on every request,
and Core Web Vitals feeds search ranking.

---

## VPS deployment, start to finish

### 1. Create the VPS

In hPanel: **VPS → Create**. Ubuntu 24.04, no control panel (the script installs
what it needs). Add your SSH key during setup rather than using a root
password.

### 2. Point the domain at it

In hPanel **Domains → DNS Zone**, set:

| Type | Name | Value |
| ---- | ---- | ------------------ |
| A    | `@`  | the VPS IP address |
| A    | `www`| the VPS IP address |

Do this **before** running the script. The certificate is issued by proving
control of the domain over HTTP, so the domain has to resolve to the server
first. The script checks and warns you if it does not.

### 3. Get the code onto the server

```bash
ssh root@<vps-ip>
apt-get update && apt-get install -y git
git clone <your-repo-url> /opt/advanced-dental-care
cd /opt/advanced-dental-care
```

### 4. Run the deploy script

```bash
sudo bash scripts/deploy-hostinger.sh chandigarhdentist.com admin@chandigarhdentist.com
```

It installs Docker, configures the firewall, **generates every secret on the
server**, builds the image, applies migrations, and starts the app, worker,
PostgreSQL, Redis and a TLS-terminating Caddy.

It is idempotent. Deploying a new version later is `git pull` then re-running
it; it will not regenerate secrets that already exist.

Secrets are written to `.env` with mode 600 and never printed. A secret that
travels through a chat window, an email or a support ticket is a secret that
has to be rotated.

### 5. Create the first administrator

There is no seeded account in production, on purpose.

```bash
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml \
  run --rm --entrypoint "" \
  -e SEED_ADMIN_EMAIL='you@chandigarhdentist.com' \
  -e SEED_ADMIN_PASSWORD='<a real password>' \
  -e SEED_ADMIN_NAME='Dr Anshu Gupta' \
  app npx tsx prisma/seed-admin.ts
```

Then sign in at `/staff-login` and create an individual account per staff
member. Running the same command again resets that account's password and signs
out its existing sessions — which is the recovery path when nobody can get in.

---

## What the deployment looks like

```
        internet
           │  443
     ┌─────▼─────┐
     │   caddy   │  TLS, automatic renewal, www → apex
     └─────┬─────┘
           │  compose network
     ┌─────▼─────┐   ┌──────────┐
     │    app    │   │  worker  │  sends WhatsApp, email, reminders
     └─────┬─────┘   └────┬─────┘
           │              │
     ┌─────▼──────────────▼─────┐
     │  postgres 16  ·  redis 7 │  neither is published to the host
     └──────────────────────────┘
```

The app binds to **127.0.0.1:3000**, not `0.0.0.0`. Published publicly it would
serve the clinic over plain HTTP beside the TLS that Caddy adds — and since
session cookies are Secure-only, that endpoint could not even log in, so it
would exist purely as an unencrypted way to read the site.

PostgreSQL and Redis use `expose`, not `ports`. They are reachable only from
the compose network. Publishing 5432 is how clinic databases end up in search
engines for internet-connected devices.

`ufw` allows 22, 80 and 443. Nothing else.

---

## Running it

```bash
cd /opt/advanced-dental-care
C="docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml"

$C ps                  # what is running
$C logs -f app         # application logs
$C logs -f worker      # did that reminder actually send
$C restart app
git pull && sudo bash scripts/deploy-hostinger.sh <domain> <email>   # deploy
```

Health check: `curl https://<domain>/api/health` → `{"status":"ok"}`.

### Backups

Hostinger's VPS snapshots cover the whole disk, which is useful but not a
database backup — restoring one rolls the entire server back. Take a logical
dump as well:

```bash
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml \
  exec -T db pg_dump -U adcc adcc | gzip > /root/backups/adcc-$(date +%F).sql.gz
```

Put that in `cron`, copy it off the server, and **test a restore** —
`docs/BACKUP_RESTORE.md` has the procedure. A backup nobody has restored is a
hypothesis, and this database holds patient records.

---

## Before patients use it

The script prints these too. None of them are optional:

- [ ] **Messaging is off.** `WHATSAPP_PROVIDER`, `EMAIL_PROVIDER` and
      `SMS_PROVIDER` default to `console`, so messages are written to the log
      and **not sent**. Patients receive no confirmations or reminders until
      these are configured — see `docs/WHATSAPP.md`.
- [ ] **Object storage is empty.** `STORAGE_*` is unset, so document upload is
      unavailable. There is deliberately no local-disk fallback: a serverless
      or containerised filesystem does not persist, and X-rays must not be the
      thing that discovers that.
- [ ] **Payments are off** until `RAZORPAY_*` is set and the webhook is
      registered at `/api/payments/webhook`.
- [ ] Backups configured **and a restore tested**.
- [ ] `docs/CONTENT_AUDIT.md` signed off. The disputed figures — 25 vs 18
      years, 20,000 vs 5,000 patients — render as nothing until verified.
- [ ] Real staff accounts created, one per person.
- [ ] Doctor schedules and clinic holidays entered.

## A note on patient data

A VPS the clinic controls, in an Indian datacentre, is the better answer for
patient records than a US-based platform. That is the main argument for this
route over `DEPLOY_VERCEL.md`.

It also means the clinic is now responsible for what a managed platform would
otherwise handle: operating system updates, database backups, and disk
monitoring. `unattended-upgrades` covers the first; the other two need a human
who has agreed to own them.
