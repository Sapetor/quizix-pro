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

### Network Configuration

The Docker setup creates a custom bridge network that allows:

1. **Host network access on port 3000**
2. **Isolated container environment**

#### Default Network Settings
- Subnet: `172.20.0.0/16`
- Gateway: `172.20.0.1`
- Bridge name: `quizix-bridge`

#### Customizing Network Settings

Edit `docker-compose.yml`:
```yaml
networks:
  quizix-network:
    ipam:
      config:
        - subnet: 192.168.100.0/24  # Your custom subnet
          gateway: 192.168.100.1
```

## Deployment Commands

### Build and Deploy
```bash
# Full deployment (recommended)
./docker-build.sh deploy

# Build only
./docker-build.sh build

# Check status
./docker-build.sh status

# Check the running container's /health endpoint
./docker-build.sh test
```

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

# Manual health check
docker exec quizix-pro-app curl -f http://localhost:3000/api/ping
```

### Log Analysis

```bash
# Real-time logs
docker-compose logs -f quizix-pro

# Last 100 lines
docker-compose logs --tail=100 quizix-pro

# Application-specific logs
docker exec quizix-pro-app cat /app/logs/application.log
```

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

# Change port in docker-compose.yml:
ports:
  - "3001:3000"  # Use port 3001 instead
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
# Increase memory limit in docker-compose.yml:
deploy:
  resources:
    limits:
      memory: 1G  # Increase from 512M
```

## Security Considerations

### Network Security

1. **Restrict CORS origins:**
   ```bash
   CORS_ORIGINS=http://192.168.1.*  # Only local network
   ```

2. **Use HTTPS in production:**
   ```yaml
   # Add reverse proxy with SSL
   labels:
     - "traefik.enable=true"
     - "traefik.http.routers.quizix.tls=true"
   ```

### Application Security

1. **Server-side API keys (recommended for production):**
   ```bash
   # In .env file - key never exposed to clients
   CLAUDE_API_KEY=sk-ant-xxxxx
   ```

2. **Built-in rate limiting:** Socket.IO events limited to 10/second per client

3. **Cryptographic file naming:** Uploaded files use `crypto.randomBytes()` for unpredictable names

### Container Security

1. **Non-root user:** ✅ Already configured
2. **Read-only filesystem:** Optional
3. **Security scanning:**
   ```bash
   docker scan quizix-pro:latest
   ```

## Scaling and Load Balancing

### Multiple Instances

```bash
# Scale to 3 instances
docker-compose up --scale quizix-pro=3 -d

# With load balancer
docker-compose -f docker-compose.yml -f docker-compose.scale.yml up -d
```

### Load Balancer Configuration

Create `docker-compose.scale.yml`:
```yaml
version: '3.8'
services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    depends_on:
      - quizix-pro
```

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

# Network inspection
docker network inspect quizix-pro_quizix-network

# Volume inspection
docker volume inspect quizix-pro_quizzes-data quizix-pro_results-data quizix-pro_uploads-data

# Image information
docker image inspect quizix-pro:latest
```

---

**Note:** This Docker setup is optimized for local network deployment. For internet-facing deployments, additional security measures (SSL certificates, authentication, rate limiting) should be implemented.