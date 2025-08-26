# Quizix Pro Docker Deployment Guide

This guide provides instructions for deploying Quizix Pro in a Docker container with local network access and GitLab connectivity.

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
- GitLab instance (optional)

## Configuration

### Environment Setup

1. Copy the environment template:
   ```bash
   cp .env.docker .env
   ```

2. Edit `.env` to match your environment:
   ```bash
   # GitLab Configuration
   GITLAB_URL=http://your-gitlab-server:8080
   GITLAB_TOKEN=your-gitlab-token
   
   # Network Configuration
   CORS_ORIGINS=http://192.168.1.*,http://10.0.0.*
   ```

### GitLab Integration

#### Option 1: HTTP Access
```bash
# In .env file
GITLAB_URL=http://gitlab.local:8080
GITLAB_TOKEN=your-personal-access-token
```

#### Option 2: SSH Access
```bash
# In .env file
GITLAB_URL=ssh://git@gitlab.local:2222
GITLAB_SSH_KEY=/app/.ssh/id_rsa
```

For SSH access, mount your SSH key:
```yaml
# Add to docker-compose.yml volumes section
volumes:
  - ~/.ssh/id_rsa:/app/.ssh/id_rsa:ro
```

### Network Configuration

The Docker setup creates a custom bridge network that allows:

1. **Container-to-GitLab communication**
2. **Host network access on port 3000**
3. **Isolated container environment**

#### Default Network Settings
- Subnet: `172.20.0.0/16`
- Gateway: `172.20.0.1`
- Bridge name: `quizmaster-bridge`

#### Customizing Network Settings

Edit `docker-compose.yml`:
```yaml
networks:
  quizmaster-network:
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

# Test GitLab connectivity
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

## GitLab Connectivity

### Testing GitLab Connection

```bash
# From host
curl -f http://your-gitlab-server:8080

# From container
docker exec quizmaster-pro-app curl -f http://your-gitlab-server:8080
```

### Common GitLab Issues

#### 1. GitLab Not Reachable
```bash
# Check if GitLab is accessible from host
ping gitlab.local

# Check DNS resolution in container
docker exec quizmaster-pro-app nslookup gitlab.local

# Add to docker-compose.yml if needed:
extra_hosts:
  - "gitlab.local:192.168.1.100"  # Your GitLab IP
```

#### 2. SSL Certificate Issues
```bash
# For self-signed certificates, add to .env:
NODE_TLS_REJECT_UNAUTHORIZED=0

# Or mount custom CA certificates:
volumes:
  - /etc/ssl/certs:/etc/ssl/certs:ro
```

#### 3. Authentication Issues
```bash
# Test GitLab token
curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://your-gitlab-server/api/v4/user

# Check token permissions in GitLab:
# - API access
# - Repository access
```

## Data Persistence

### Volume Mounts

The container uses several volumes for data persistence:

```yaml
volumes:
  - ./results:/app/results        # Quiz results
  - ./uploads:/app/uploads        # File uploads
  - quiz_data:/app/public/uploads # Runtime data
```

### Backup Strategy

```bash
# Backup results
docker exec quizmaster-pro-app tar -czf /tmp/results-backup.tar.gz /app/results
docker cp quizmaster-pro-app:/tmp/results-backup.tar.gz ./backup/

# Backup entire data
docker-compose down
tar -czf quizmaster-backup-$(date +%Y%m%d).tar.gz results/ uploads/
docker-compose up -d
```

## Monitoring and Troubleshooting

### Health Checks

The container includes built-in health checks:
```bash
# Check container health
docker ps --format "table {{.Names}}\t{{.Status}}"

# Manual health check
docker exec quizmaster-pro-app curl -f http://localhost:3000/api/ping
```

### Log Analysis

```bash
# Real-time logs
docker-compose logs -f quizmaster-pro

# Last 100 lines
docker-compose logs --tail=100 quizmaster-pro

# Application-specific logs
docker exec quizmaster-pro-app cat /app/logs/application.log
```

### Performance Monitoring

```bash
# Container resource usage
docker stats quizmaster-pro-app

# Network connections
docker exec quizmaster-pro-app netstat -tlnp

# Disk usage
docker exec quizmaster-pro-app df -h
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
# Fix file permissions
sudo chown -R 1001:1001 results/ uploads/

# Check container user
docker exec quizmaster-pro-app id
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
     - "traefik.http.routers.quizmaster.tls=true"
   ```

### Container Security

1. **Non-root user:** ✅ Already configured
2. **Read-only filesystem:** Optional
3. **Security scanning:**
   ```bash
   docker scan quizmaster-pro:latest
   ```

## Scaling and Load Balancing

### Multiple Instances

```bash
# Scale to 3 instances
docker-compose up --scale quizmaster-pro=3 -d

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
      - quizmaster-pro
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

1. Check logs first: `docker-compose logs`
2. Verify network connectivity
3. Test GitLab access separately
4. Check resource usage

### Useful Commands Reference

```bash
# Container shell access
docker exec -it quizmaster-pro-app sh

# Network inspection
docker network inspect quizmaster-pro_quizmaster-network

# Volume inspection
docker volume inspect quizmaster-pro_quiz_data

# Image information
docker image inspect quizmaster-pro:latest
```

---

**Note:** This Docker setup is optimized for local network deployment. For internet-facing deployments, additional security measures (SSL certificates, authentication, rate limiting) should be implemented.