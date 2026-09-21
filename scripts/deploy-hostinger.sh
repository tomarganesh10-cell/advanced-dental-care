#!/usr/bin/env bash
#
# One-shot bootstrap for a fresh Hostinger VPS (Ubuntu 22.04 / 24.04).
#
# Installs Docker, generates secrets, brings up the app, database, Redis,
# background worker and a TLS-terminating reverse proxy, then applies the
# database migrations.
#
# Run it as root on the VPS, from inside the checked-out repository:
#
#     sudo bash scripts/deploy-hostinger.sh clinic.example.com you@example.com
#
# It is idempotent: running it again upgrades in place and never regenerates a
# secret that already exists. Re-running is the intended way to deploy a new
# version.
#
# It does NOT work on Hostinger shared, Premium, Business or Cloud hosting.
# Those are PHP and MySQL with no long-running process and no PostgreSQL; this
# application needs all three. Hostinger VPS (KVM) only.

set -euo pipefail

SITE_DOMAIN="${1:-}"
ADMIN_EMAIL="${2:-}"

if [[ -z "$SITE_DOMAIN" || -z "$ADMIN_EMAIL" ]]; then
  echo "Usage: sudo bash scripts/deploy-hostinger.sh <domain> <email-for-tls-notices>" >&2
  echo "Example: sudo bash scripts/deploy-hostinger.sh clinic.example.com admin@clinic.example.com" >&2
  exit 1
fi

if [[ $EUID -ne 0 ]]; then
  echo "Run this with sudo — it installs packages and opens firewall ports." >&2
  exit 1
fi

if [[ ! -f docker-compose.yml || ! -f package.json ]]; then
  echo "Run this from the root of the checked-out repository." >&2
  exit 1
fi

say() { printf '\n\033[1;34m==>\033[0m %s\n' "$1"; }
warn() { printf '\n\033[1;33m!!\033[0m %s\n' "$1"; }

# ---------------------------------------------------------------------------
# Docker
# ---------------------------------------------------------------------------

if ! command -v docker >/dev/null 2>&1; then
  say "Installing Docker"
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg openssl ufw
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg |
    gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    >/etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
else
  say "Docker already installed — skipping"
fi

# ---------------------------------------------------------------------------
# Firewall
# ---------------------------------------------------------------------------
# Port 3000 is deliberately absent. The app binds to loopback and is reached
# only through the reverse proxy, so it is never exposed without TLS.

say "Configuring the firewall"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null
echo "    Open: 22 (SSH), 80 and 443 (web). Everything else is closed."

# ---------------------------------------------------------------------------
# Secrets and environment
# ---------------------------------------------------------------------------
# Generated on the server and never printed. A secret that travels through a
# chat window, an email or a ticket is a secret that has to be rotated.

if [[ -f .env ]]; then
  say "Reusing the existing .env (secrets are not regenerated)"
else
  say "Generating .env with fresh secrets"
  cp .env.example .env

  set_env() {
    local key="$1" value="$2"
    if grep -qE "^${key}=" .env; then
      # The value can contain / and &, so use a delimiter that cannot appear in
      # base64 or hex output and escape the replacement.
      python3 - "$key" "$value" <<'PYEOF'
import sys, pathlib, re
key, value = sys.argv[1], sys.argv[2]
path = pathlib.Path(".env")
text = path.read_text()
text = re.sub(rf"^{re.escape(key)}=.*$", f"{key}={value}", text, flags=re.M)
path.write_text(text)
PYEOF
    else
      printf '%s=%s\n' "$key" "$value" >>.env
    fi
  }

  set_env AUTH_SECRET "$(openssl rand -base64 48)"
  set_env CRON_SECRET "$(openssl rand -hex 32)"
  set_env POSTGRES_PASSWORD "$(openssl rand -hex 24)"
  set_env NEXT_PUBLIC_SITE_URL "https://${SITE_DOMAIN}"
  set_env SITE_DOMAIN "$SITE_DOMAIN"
  set_env ADMIN_EMAIL "$ADMIN_EMAIL"
  set_env OTP_DEV_ECHO "false"
  set_env LOG_LEVEL "info"

  # The app refuses to boot with a bucket name and no credentials, which is the
  # correct behaviour — patient documents must not fall back to local disk.
  # Clear it until real object storage exists.
  set_env STORAGE_BUCKET ""

  chmod 600 .env
  echo "    Secrets written to .env (mode 600). They are not printed anywhere."
fi

# shellcheck disable=SC1091
set -a; . ./.env; set +a

# ---------------------------------------------------------------------------
# DNS check
# ---------------------------------------------------------------------------
# Caddy will fail to obtain a certificate if the domain does not resolve here,
# and the failure message is much less clear than this one.

say "Checking DNS for ${SITE_DOMAIN}"
server_ip="$(curl -fsS --max-time 10 https://api.ipify.org || echo "")"
domain_ip="$(getent hosts "$SITE_DOMAIN" | awk '{print $1}' | head -1 || echo "")"

if [[ -z "$domain_ip" ]]; then
  warn "${SITE_DOMAIN} does not resolve yet. Point its A record at ${server_ip:-this server} in Hostinger's DNS, wait for it to propagate, then re-run this script. Continuing — TLS will fail until it resolves."
elif [[ -n "$server_ip" && "$domain_ip" != "$server_ip" ]]; then
  warn "${SITE_DOMAIN} resolves to ${domain_ip} but this server is ${server_ip}. Fix the A record, or TLS will fail."
else
  echo "    ${SITE_DOMAIN} -> ${domain_ip}"
fi

# ---------------------------------------------------------------------------
# Build and start
# ---------------------------------------------------------------------------

COMPOSE=(docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml)

say "Building the application image (this takes a few minutes the first time)"
"${COMPOSE[@]}" build

say "Starting the database and Redis"
"${COMPOSE[@]}" up -d db redis

# Migrations run as a one-off container BEFORE the app starts, rather than at
# boot. Two app instances starting together would otherwise both try to migrate.
say "Applying database migrations"
"${COMPOSE[@]}" run --rm --entrypoint "" app npx prisma migrate deploy

say "Starting the application, worker and reverse proxy"
"${COMPOSE[@]}" up -d

# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

say "Waiting for the application to report healthy"
healthy=false
for _ in $(seq 1 30); do
  if curl -fsS --max-time 5 http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    healthy=true
    break
  fi
  sleep 3
done

if [[ "$healthy" == true ]]; then
  echo "    /api/health is answering."
else
  warn "The application is not healthy yet. Check the logs:"
  echo "      docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml logs -f app"
fi

# ---------------------------------------------------------------------------
# What is left for a human
# ---------------------------------------------------------------------------

cat <<EOF

--------------------------------------------------------------------------
Deployed.

  Site        https://${SITE_DOMAIN}
  Staff login https://${SITE_DOMAIN}/staff-login
  Health      https://${SITE_DOMAIN}/api/health

Caddy is obtaining a certificate now; give it a minute on the first run.

STILL TO DO, and the site is not ready for patients until they are done:

 1. Create the first administrator. There is no seeded account in production
    on purpose:

      docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml \\
        run --rm --entrypoint "" \\
        -e SEED_ADMIN_EMAIL='you@example.com' \\
        -e SEED_ADMIN_PASSWORD='<a real password>' \\
        app npx tsx prisma/seed-admin.ts

 2. Sign in and create a real account per staff member. The audit trail records
    who opened which patient record; shared logins make it worthless.

 3. Configure messaging. WHATSAPP_PROVIDER, EMAIL_PROVIDER and SMS_PROVIDER are
    set to "console", so messages are logged and NOT sent. Patients get no
    confirmations until these are real. See docs/WHATSAPP.md.

 4. Configure object storage (STORAGE_*) before anyone uploads an X-ray. It is
    intentionally empty — there is no local-disk fallback for patient records.

 5. Set up database backups AND test a restore. See docs/BACKUP_RESTORE.md.
    A backup nobody has restored is a hypothesis.

 6. Sign off docs/CONTENT_AUDIT.md. Until the disputed figures are verified the
    site omits them rather than guessing.

To deploy a new version later: git pull, then re-run this script.
--------------------------------------------------------------------------
EOF
