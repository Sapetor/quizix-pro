# Quizix Pro Docker Deployment Guide

This guide provides instructions for deploying Quizix Pro in a Docker container with local network access.

## Quick Start

1. **Deploy with default settings:**
   ```bash
   ./docker-build.sh
   ```

2. **Access the application:**
   - Local: http://localhost:3000
   - Network: http://YOUR_HOST_IP:3000

## Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- Local network access

## Configuration

### Environment Setup

1. Copy the environment template:
   ```bash
   cp .env.docker .env
   ```

2. Edit `.env` to match your environment:
   ```bash
   # Public URL, when behind a reverse proxy or tunnel
   PUBLIC_ORIGIN=https://quiz.example.com
   ALLOWED_ORIGINS=https://quiz.example.com

   # Proxy whose client-IP header is trusted (docker bridge gateway)
   TRUSTED_PROXY_IPS=172.17.0.1

   # AI Integration (optional - for server-side API key)
   CLAUDE_API_KEY=sk-ant-xxxxx
   CLAUDE_MODEL=claude-sonnet-4-5
   ```

   `.env.example` is the complete annotated list of variables the server
   reads. Anything not listed there is ignored.

   The image does not copy `.env` and neither compose file uses `env_file`,
   so Compose reads `.env` only to fill `${...}` placeholders in the compose
   file: `OLLAMA_URL`, `OLLAMA_ENABLED` and `MANIM_ENABLED` in
   `docker-compose.yml`, `OLLAMA_ENABLED` and `MANIM_ENABLED` in
   `docker-compose.server.yml`. Any other variable, including the ones above,
   must be added to the service's `environment:` block to reach the app.
   `TRUSTED_PROXY_IPS=172.17.0.1` applies to the bridge-network
   `docker-compose.server.yml`; with the host networking of
   `docker-compose.yml`, a `cloudflared` on the same host connects over
   loopback and needs no entry.

### Network Configuration

`docker-compose.yml` (used by `docker-build.sh`) runs the container with
`network_mode: host`. The container shares the host's network stack, listens
directly on host port 3000, and detects the real LAN IP for QR codes. There is
no custom bridge network and no `ports:` mapping in this file.

`docker-compose.server.yml` uses the default Docker bridge (`network_mode:
"bridge"`) and publishes `3000:3000`. Behind a bridge, the app sees requests
from the bridge gateway rather than the client, which is why that file shows
`TRUSTED_PROXY_IPS` and `PUBLIC_ORIGIN` as commented examples.

## Deployment Commands

### Build and Deploy
```bash
# Full deployment (recommended)
./docker-build.sh deploy

# Build only
./docker-build.sh build

# Check status
./docker-build.sh status

# Wait for the running container to answer
./docker-build.sh test
```

`deploy` and `test` probe `/health` inside the container with
`docker exec quizix-pro-app node`, the same request the image `HEALTHCHECK`
makes. They make up to 30 attempts, 2 seconds apart.

### Manual Docker Commands
```bash
# Build image
docker-compose build

# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Rebuild and restart
docker-compose up --build -d
```

## Network Access

### Local Network Discovery

1. **Find your host IP:**
   ```bash
   hostname -I
   # or
   ip route get 1 | awk '{print $7}'
   ```

2. **Access from other devices:**
   ```
   http://YOUR_HOST_IP:3000
   ```

### Firewall Configuration

Ensure port 3000 is accessible:

```bash
# Ubuntu/Debian
sudo ufw allow 3000

# CentOS/RHEL
sudo firewall-cmd --add-port=3000/tcp --permanent
sudo firewall-cmd --reload
```

## Data Persistence

### Volume Mounts

The container uses several volumes for data persistence:

```yaml
volumes:
  - quizzes-data:/app/quizzes        # Quiz library + users.json + .session-secret
  - results-data:/app/results        # Saved game results
  - uploads-data:/app/public/uploads # Uploaded images
```

The upload mount path is `/app/public/uploads`, not `/app/uploads`. That is
where the app writes (Dockerfile creates `public/uploads`). A container mounted
at `/app/uploads` keeps no uploads at all across a redeploy.

`/app/quizzes` holds `users.json` and `.session-secret` as well as the quiz
files, so skipping that mount loses every account and invalidates all sessions
on redeploy.

### Backup Strategy

```bash
# Backup results
docker exec quizix-pro-app tar -czf /tmp/results-backup.tar.gz /app/results
docker cp quizix-pro-app:/tmp/results-backup.tar.gz ./backup/

# Backup the named volumes
docker compose down
for v in quizzes-data results-data uploads-data; do
  docker run --rm -v "quizix-pro_$v:/data" -v "$PWD:/backup" alpine \
    tar -czf "/backup/quizix-$v-$(date +%Y%m%d).tar.gz" -C /data .
done
docker compose up -d
```

## Monitoring and Troubleshooting

### Health Checks

The container includes built-in health checks:
```bash
# Check container health
docker ps --format "table {{.Names}}\t{{.Status}}"

# Manual health check (from the host)
curl -f http://localhost:3000/health

# Same check from inside the container (the Dockerfile installs no curl)
docker exec quizix-pro-app node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1))"
```

### Log Analysis

```bash
# Real-time logs
docker-compose logs -f quizix-pro

# Last 100 lines
docker-compose logs --tail=100 quizix-pro
```

The app logs to stdout/stderr only; there is no log file inside the container.

### Performance Monitoring

```bash
# Container resource usage
docker stats quizix-pro-app

# Network connections
docker exec quizix-pro-app netstat -tlnp

# Disk usage
docker exec quizix-pro-app df -h
```

### Common Issues

#### 1. Port Already in Use
```bash
# Find process using port 3000
sudo lsof -i :3000
sudo netstat -tlnp | grep :3000

# docker-compose.server.yml (bridge): change the published host port
ports:
  - "3001:3000"  # Use port 3001 instead

# docker-compose.yml (host networking): there is no port mapping.
# Set PORT=3001 in the environment block, and change the port in its
# healthcheck command, which is hard-coded to 3000.
```

#### 2. Permission Issues
```bash
# Fix file permissions (bind mounts only; named volumes inherit from the image)
sudo chown -R 1001:1001 quizzes/ results/ public/uploads/

# Check container user
docker exec quizix-pro-app id
```

#### 3. Memory Issues
```bash
# docker-compose.yml sets mem_limit: 2g and cpus: "2"; raise those keys.

# docker-compose.server.yml uses the deploy block:
deploy:
  resources:
    limits:
      memory: 1G  # Increase from 512M
```

## Security Considerations

### Network Security

1. **Restrict CORS origins:**
   ```bash
   ALLOWED_ORIGINS=https://quiz.example.com  # exact origins, comma-separated
   ```
   Entries are exact origins; wildcards are not supported. Local-network
   origins (localhost, 10.x, 172.16-31.x, 192.168.x, `*.local`) on ports
   3000, 3001, 8000, 8080 or the server's own `PORT` stay allowed. Setting the
   variable drops the built-in cloud-platform wildcards.

2. **Use HTTPS in production:**
   ```yaml
   # Add reverse proxy with SSL
   labels:
     - "traefik.enable=true"
     - "traefik.http.routers.quizix.tls=true"
   ```

### Application Security

1. **Server-side API keys (recommended for production):**
   ```yaml
   # In the compose file's environment: block - key never exposed to clients
   - CLAUDE_API_KEY=sk-ant-xxxxx
   ```

2. **Built-in rate limiting:** Socket.IO events limited to 10/second per client

3. **Cryptographic file naming:** Uploaded files use `crypto.randomBytes()` for unpredictable names

### Container Security

1. **Non-root user:** ✅ Already configured (`nodejs`, uid/gid 1001)
2. **Read-only filesystem:** Optional
3. **Security scanning:**
   ```bash
   docker scout cves quizix-pro:latest
   ```

## Scaling and Load Balancing

Run a single instance. Game state (active games, players) is held in process
memory and Socket.IO has no shared adapter, so a second instance would not see
the first one's games. Both compose files also set a fixed `container_name`,
and `docker-compose.yml` binds host port 3000 directly, so
`docker-compose up --scale` fails with either file.

## Maintenance

### Updates

```bash
# Update application
git pull
./docker-build.sh deploy

# Update base image
docker-compose build --no-cache
docker-compose up -d
```

### Cleanup

```bash
# Remove unused images
docker image prune -f

# Remove all containers and volumes (⚠️ DATA LOSS)
docker-compose down -v
```

## Support

### Getting Help

1. Check logs first: `docker compose logs`
2. Verify network connectivity
3. Check resource usage

### Useful Commands Reference

```bash
# Container shell access
docker exec -it quizix-pro-app sh

# Volume inspection
docker volume inspect quizix-pro_quizzes-data quizix-pro_results-data quizix-pro_uploads-data

# Image information
docker image inspect quizix-pro:latest
```

---

**Note:** This Docker setup is optimized for local network deployment. For internet-facing deployments, additional security measures (SSL certificates, authentication, rate limiting) should be implemented. See "Behind a reverse proxy or Cloudflare Tunnel" in `DEPLOYMENT.md` for the settings a public hostname needs and the security items still open.