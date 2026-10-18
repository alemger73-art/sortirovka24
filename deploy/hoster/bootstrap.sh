#!/usr/bin/env bash
# One-time hardening + Docker on a fresh Ubuntu 24.04 (run as root).
# Usage: bash bootstrap.sh [main|backup]
set -euo pipefail
ROLE="${1:-main}"
export DEBIAN_FRONTEND=noninteractive

apt-get update -y
apt-get upgrade -y
apt-get install -y ca-certificates curl gnupg ufw fail2ban unattended-upgrades git rsync age
dpkg-reconfigure -f noninteractive unattended-upgrades
timedatectl set-timezone Asia/Almaty || true

# SSH: keys only, no root password login.
sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?PermitRootLogin .*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
systemctl reload ssh || systemctl reload sshd || true
systemctl enable --now fail2ban

ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
if [ "$ROLE" = "main" ]; then
  # Web only through Cloudflare (published ranges); direct hits to the IP are refused.
  for net in 173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 103.31.4.0/22 141.101.64.0/18 \
             108.162.192.0/18 190.93.240.0/20 188.114.96.0/20 197.234.240.0/22 198.41.128.0/17 \
             162.158.0.0/15 104.16.0.0/13 104.24.0.0/14 172.64.0.0/13 131.0.72.0/22; do
    ufw allow proto tcp from "$net" to any port 80,443
  done
  for net in 2400:cb00::/32 2606:4700::/32 2803:f800::/32 2405:b500::/32 2405:8100::/32 2a06:98c0::/29 2c0f:f248::/32; do
    ufw allow proto tcp from "$net" to any port 80,443
  done
fi
ufw --force enable

if [ "$ROLE" = "main" ]; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
  mkdir -p /opt/s24 /opt/s24/backups
  chmod 700 /opt/s24
else
  # Backup server: a locked-down user that may only receive files.
  id s24backup >/dev/null 2>&1 || useradd -m -s /bin/bash s24backup
  mkdir -p /home/s24backup/.ssh /srv/s24-backups
  chown -R s24backup:s24backup /home/s24backup /srv/s24-backups
  chmod 700 /home/s24backup/.ssh /srv/s24-backups
fi
echo "bootstrap ($ROLE) done"
