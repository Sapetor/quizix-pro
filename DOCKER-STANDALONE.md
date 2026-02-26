# Quizix Pro - Standalone Docker Deployment

Deploy Quizix Pro on a dedicated machine (bare metal or VM) serving a local network. No Kubernetes, no cloud, no reverse proxy needed.

## Prerequisites

- A machine with Ethernet on your LAN
- Ubuntu Server 24.04 LTS (or any Linux with Docker)
- Docker Engine 24+ and Docker Compose v2

## 1. Install Ubuntu Server

1. Flash Ubuntu Server 24.04 LTS to a USB stick (use [Rufus](https://rufus.ie) on Windows)
2. Boot from USB and install with these settings:
   - **Server name:** `quizix-server` (becomes the mDNS hostname)
   - **Enable OpenSSH server:** Yes
   - **Snaps:** Skip all
3. Note the IP assigned during install (e.g., `10.110.3.82`)

### GPU issues (Erying boards)

If the monitor goes blank after BIOS, press `e` at the GRUB menu and add `nomodeset` to the `linux` line. After install, make it permanent:

```bash
sudo sed -i 's/GRUB_CMDLINE_LINUX_DEFAULT=".*"/GRUB_CMDLINE_LINUX_DEFAULT="quiet nomodeset"/' /etc/default/grub
sudo update-grub
```

## 2. Base Setup

SSH into the machine from another computer:

```bash
ssh youruser@<server-ip>
```

Run:

```bash
# Update and install essentials
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ufw avahi-daemon

# Firewall
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp     # SSH
sudo ufw allow 3000/tcp   # Quizix Pro
sudo ufw enable

# Ensure Docker starts on boot
sudo systemctl enable docker
```

## 3. Install Docker

```bash
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker $USER
```

Log out and back in, then verify:

```bash
docker --version
docker compose version
```

## 4. Deploy Quizix Pro

```bash
cd ~
git clone https://github.com/Sapetor/quizix-pro.git
cd quizix-pro
docker compose up -d --build
```

First build takes 2-3 minutes. Subsequent builds are faster (cached layers).

## 5. Verify

```bash
# Check container status
docker compose ps

# Test locally
curl -s http://localhost:3000/health
```

From any device on the network:
- **Same VLAN (wired):** `http://quizix-server.local:3000`
- **Different VLAN (WiFi):** `http://<server-ip>:3000` (`.local` doesn't work across VLANs)
- **Players (phones):** Scan the QR code in the lobby — it auto-detects the correct IP

## How It Works

| Component | Detail |
|-----------|--------|
| **Networking** | `network_mode: host` — container shares host's network, QR codes auto-detect the LAN IP |
| **Data** | Docker volumes persist quizzes, results, and uploads across restarts |
| **Auto-start** | `restart: unless-stopped` + Docker enabled at boot — survives reboots |
| **mDNS** | `avahi-daemon` broadcasts `quizix-server.local` on the LAN |
| **Demo quizzes** | Auto-seeded on first boot (9 languages) |

## Updating

```bash
ssh youruser@quizix-server.local
cd ~/quizix-pro
git pull
docker compose up -d --build
```

## Common Commands

| Task | Command |
|------|---------|
| Start | `docker compose up -d` |
| Stop | `docker compose down` |
| Rebuild after update | `docker compose up -d --build` |
| View logs | `docker compose logs -f` |
| Check status | `docker compose ps` |
| Restart | `docker compose down && docker compose up -d` |
| Check server IP | `hostname -I` |

## Auto-Publish Server IP

If the host accesses the app from a different VLAN (e.g., WiFi laptop reaching a wired server), `.local` hostnames won't resolve. This script automatically pushes the server's current IP to the GitHub repo so anyone can look it up.

**On the server, create the script:**

```bash
cat > ~/update-ip.sh << 'SCRIPT'
#!/bin/bash
cd /home/sapet/quizix-pro
IP=$(hostname -I | awk '{print $1}')
echo "http://${IP}:3000" > SERVER_URL.txt
git add SERVER_URL.txt
git diff --cached --quiet || git commit -m "auto: update server IP to ${IP}" && git push origin main
SCRIPT
chmod +x ~/update-ip.sh
```

**Add to cron (runs on boot + every hour):**

```bash
(crontab -l 2>/dev/null; echo "@reboot sleep 30 && /home/sapet/update-ip.sh"; echo "0 * * * * /home/sapet/update-ip.sh") | crontab -
```

**Host workflow:** Bookmark `https://github.com/Sapetor/quizix-pro/blob/main/SERVER_URL.txt` — it always shows the current server URL.

## Troubleshooting

### Container keeps restarting

```bash
docker compose logs --tail=50
```

Look for `Cannot find module` errors — means the Dockerfile is missing a directory. All required directories: `services/`, `config/`, `utils/`, `middleware/`, `routes/`, `socket/`, `seeds/`.

### CORS errors in browser console

The app allows: `localhost`, `127.0.0.1`, `192.168.x.x`, `10.x.x.x`, `172.16-31.x.x`, and `*.local` hostnames. If accessing from an unexpected origin, set `CORS_ORIGINS` in the environment:

```yaml
environment:
  - CORS_ORIGINS=http://custom-hostname:3000
```

### QR code shows wrong IP

The container uses `network_mode: host` to detect the real LAN IP. If it picks the wrong interface, override with:

```yaml
environment:
  - NETWORK_IP=10.110.3.82
```

### Players can't connect from phones

1. Confirm the phone is on the same network (WiFi, not mobile data)
2. Try the IP directly: `http://<server-ip>:3000`
3. Check firewall: `sudo ufw status` — port 3000 must be allowed
4. `.local` hostnames may not work on Android — use the IP or QR code

### App shows blank page

Check that `BASE_PATH=/` is set in the environment. Without it, production mode defaults to `/quizmaster/` (for Kubernetes ingress).

## Comparison with Other Deployment Methods

| | Standalone Docker | Kubernetes | Railway/Cloud |
|---|---|---|---|
| **Best for** | Single server, local network | Multi-node, high availability | Internet-facing, no infra |
| **Setup time** | ~20 minutes | Hours | Minutes |
| **Maintenance** | `git pull && docker compose up -d --build` | kubectl/GitOps | Git push |
| **Cost** | Hardware only | Hardware + complexity | Monthly fee |
| **Config file** | `docker-compose.yml` | `k8s/*.yaml` | Railway dashboard |
| **BASE_PATH** | `/` | `/quizmaster/` (ingress) | `/` |
