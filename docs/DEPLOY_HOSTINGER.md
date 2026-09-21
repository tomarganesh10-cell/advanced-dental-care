# Deploying on Hostinger

## Read this first: which Hostinger plan

| Hostinger product | Runs this app? |
| --- | --- |
| **VPS (KVM 1/2/4/8)** | **Yes, fully.** App, worker, PostgreSQL and Redis on one box. |
| Business / Cloud (Node.js app) | **Partly.** Runs the app; needs an external PostgreSQL. |
| Premium / Single / shared | **No.** |
| Website Builder | No. |

The dividing line is Node.js. Hostinger's Node.js app feature exists only on
**Business and Cloud** plans; Premium and below are LiteSpeed serving PHP, with
no long-running process, so this application cannot start there at all.

Even on Business or Cloud there is a second limit: **Hostinger provides MySQL
only — no PostgreSQL on any shared or managed plan.** This application requires
PostgreSQL, so that route means an external database (Neon or Supabase) and a
cron job calling `/api/cron/drain` in place of the worker process. Workable, but
two moving parts in two places.

A VPS has neither limitation, which is why it is the supported target.

If the clinic is on Premium today and owns a VPS, the right arrangement is to
**keep Premium for the domain, DNS and email, and run the application on the
VPS.** Premium's DNS zone editor points the domain wherever you like; nothing
has to move.

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

## When the server already has a reverse proxy

A VPS that already runs something has its own front door on ports 80 and 443,
and this stack must not try to take them. `scripts/deploy-hostinger.sh` refuses
to continue in that case rather than fighting for the port.

Run without the bundled proxy instead:

```bash
# The docker network your existing proxy is attached to.
docker inspect <proxy-container> --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}'

PROXY_NETWORK=<that network> \
  docker compose -f docker-compose.yml -f deploy/docker-compose.behind-proxy.yml up -d --build
docker compose -f docker-compose.yml -f deploy/docker-compose.behind-proxy.yml \
  run --rm --entrypoint "" app npx prisma migrate deploy
```

The app joins that network under the alias **`clinic-app`**, reachable as
`http://clinic-app:3000`. An alias rather than a container name or an IP,
because those change when a container is recreated and the alias does not.

Then add `deploy/nginx-clinic.conf.template` to the proxy as a **new** file,
with `__DOMAIN__` replaced. Never edit an existing server block: adding one
cannot change how the other sites behave, editing one can. Check before
reloading — `nginx -t` refuses a broken config, so a typo cannot take the proxy
down, and `reload` does not drop connections the way `restart` does:

```bash
nginx -t && nginx -s reload
```

Two settings in that template are load-bearing. `X-Forwarded-Proto` tells the
app it is on https; without it the Secure-only session cookies are never set and
signing in appears to work and then silently does nothing. `client_max_body_size
64m` allows X-rays through; the 1 MB default rejects them with a 413.

TLS is the existing proxy's job here, so the certificate for the clinic domain
has to be issued the same way that proxy issues its others.

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
