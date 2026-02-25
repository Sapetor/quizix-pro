# Kubernetes Deployment Guide for QuizMaster Pro

This guide walks you through deploying QuizMaster Pro to a Kubernetes cluster.

## Prerequisites

- Kubernetes cluster (v1.19+)
- `kubectl` configured to access your cluster
- Docker for building the container image
- Container registry access (Docker Hub, GCR, ECR, etc.)

## Quick Start

### 1. Build the Docker Image

```bash
# From the project root directory
docker build -t quizmaster-pro:latest .

# Tag for your registry
docker tag quizmaster-pro:latest your-registry/quizmaster-pro:latest

# Push to registry
docker push your-registry/quizmaster-pro:latest
```

### 2. Update Deployment Configuration

Edit `k8s/deployment.yaml` and update the image reference:

```yaml
image: your-registry/quizmaster-pro:latest
```

### 3. Deploy to Kubernetes

```bash
# Apply all manifests in order
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/pvc.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml

# Optional: Apply ingress if using external access
kubectl apply -f k8s/ingress.yaml
```

Or apply all at once:

```bash
kubectl apply -f k8s/
```

### 4. Verify Deployment

```bash
# Check namespace
kubectl get namespace quizmaster

# Check all resources
kubectl get all -n quizmaster

# Check pod status
kubectl get pods -n quizmaster

# View logs
kubectl logs -n quizmaster -l app=quizmaster-pro -f

# Check health endpoints
kubectl port-forward -n quizmaster svc/quizmaster-pro 3000:3000
# Then visit: http://localhost:3000/health
```

## Architecture Overview

### Components

1. **Namespace**: Isolated environment (`quizmaster`)
2. **ConfigMap**: Application configuration (PORT, NODE_ENV)
3. **PersistentVolumeClaims**: Storage for quizzes, results, and uploads
4. **Deployment**: Single replica with health checks
5. **Service**: ClusterIP with session affinity for Socket.IO
6. **Ingress** (optional): External access with WebSocket support

### Storage

Three persistent volumes are configured:

- **quizzes-pvc** (1Gi): Quiz definitions
- **results-pvc** (2Gi): Game results
- **uploads-pvc** (5Gi): Image uploads

## Configuration

### Environment Variables

Edit `k8s/configmap.yaml` to customize:

```yaml
data:
  NODE_ENV: "production"
  PORT: "3000"
  # Optional: Override network IP detection
  NETWORK_IP: "your-cluster-ip"
```

For sensitive values like API keys, use Kubernetes Secrets:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: quizmaster-secrets
  namespace: quizmaster
type: Opaque
stringData:
  CLAUDE_API_KEY: "sk-ant-xxxxx"  # Optional: Server-side Claude API key
  CLAUDE_MODEL: "claude-sonnet-4-5"
```

### Resource Limits

Default resource allocation in `k8s/deployment.yaml`:

```yaml
resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 512Mi
```

Adjust based on your expected load.

### Storage Class

If your cluster requires a specific storage class, update `k8s/pvc.yaml`:

```yaml
storageClassName: your-storage-class  # e.g., gp2, standard, local-path
```

## Accessing the Application

### Option 1: Port Forward (Development/Testing)

```bash
kubectl port-forward -n quizmaster svc/quizmaster-pro 3000:3000
```

Then access at: http://localhost:3000

### Option 2: Ingress (Production)

1. Install an Ingress controller (nginx, traefik, etc.)
2. Update `k8s/ingress.yaml` with your domain
3. Apply the ingress manifest
4. Configure DNS to point to your ingress controller

### Option 3: LoadBalancer

Uncomment the LoadBalancer service in `k8s/ingress.yaml`:

```bash
kubectl apply -f k8s/ingress.yaml
kubectl get svc -n quizmaster quizmaster-pro-lb
```

Use the EXTERNAL-IP to access the application.

## Scaling Considerations

### Current Limitation

The application uses **in-memory storage** for game state (active games, players). This means:

- ✅ Single replica works perfectly
- ❌ Multiple replicas will have isolated game states
- ❌ Players may not see games hosted on different pods

### Scaling Options

#### Option 1: Stay Single Replica (Recommended for Small/Medium Load)

Current configuration supports:
- Hundreds of concurrent players
- Dozens of simultaneous games
- Suitable for most use cases

#### Option 2: Horizontal Scaling with Redis (Future Enhancement)

To scale horizontally:

1. Add Redis deployment for shared session storage
2. Modify `server.js` to use Redis for:
   - Game state (`games` Map)
   - Player state (`players` Map)
   - Socket.IO adapter (socket.io-redis)
3. Update deployment to allow multiple replicas

Example Redis setup:

```yaml
# Add to your cluster
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
  namespace: quizmaster
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
      - name: redis
        image: redis:7-alpine
        ports:
        - containerPort: 6379
```

## Health Checks

The application exposes two health endpoints:

### Liveness Probe (`/health`)

Simple check if the server is running:

```bash
curl http://localhost:3000/health
# {"status":"ok","timestamp":"2025-01-05T10:00:00.000Z"}
```

### Readiness Probe (`/ready`)

Checks if the server is ready to accept traffic:

```bash
curl http://localhost:3000/ready
# {"status":"ready","checks":{"quizzes":true,"results":true,"uploads":true},"timestamp":"..."}
```

## Monitoring

### View Logs

```bash
# All pods
kubectl logs -n quizmaster -l app=quizmaster-pro -f

# Specific pod
kubectl logs -n quizmaster <pod-name> -f

# Previous crashed pod
kubectl logs -n quizmaster <pod-name> --previous
```

### Pod Status

```bash
kubectl get pods -n quizmaster -w
kubectl describe pod -n quizmaster <pod-name>
```

### Events

```bash
kubectl get events -n quizmaster --sort-by='.lastTimestamp'
```

## Troubleshooting

### Pod Not Starting

```bash
# Check pod status
kubectl describe pod -n quizmaster -l app=quizmaster-pro

# Common issues:
# - Image pull errors: Verify registry credentials
# - Resource limits: Check cluster has available resources
# - PVC binding: Ensure storage class is available
```

### Storage Issues

```bash
# Check PVC status
kubectl get pvc -n quizmaster

# If PVC is pending:
# - Check storage class exists: kubectl get storageclass
# - Verify cluster has available storage
# - Check PV provisioner logs
```

### WebSocket Connection Issues

If Socket.IO connections fail:

1. Verify session affinity is configured:
   ```bash
   kubectl get svc quizmaster-pro -n quizmaster -o yaml | grep -A 5 sessionAffinity
   ```

2. Check ingress annotations for WebSocket support

3. Review CORS settings in `server.js`

### Application Errors

```bash
# Check application logs
kubectl logs -n quizmaster -l app=quizmaster-pro --tail=100

# Exec into pod for debugging
kubectl exec -it -n quizmaster <pod-name> -- /bin/sh
```

## Updates and Rollbacks

### Updating the Application

```bash
# Build and push new image
docker build -t your-registry/quizmaster-pro:v2 .
docker push your-registry/quizmaster-pro:v2

# Update deployment
kubectl set image deployment/quizmaster-pro -n quizmaster quizmaster-pro=your-registry/quizmaster-pro:v2

# Monitor rollout
kubectl rollout status deployment/quizmaster-pro -n quizmaster
```

### Rolling Back

```bash
# View rollout history
kubectl rollout history deployment/quizmaster-pro -n quizmaster

# Rollback to previous version
kubectl rollout undo deployment/quizmaster-pro -n quizmaster

# Rollback to specific revision
kubectl rollout undo deployment/quizmaster-pro -n quizmaster --to-revision=2
```

## Backup and Restore

### Backup Persistent Data

```bash
# Create a backup job
kubectl run backup -n quizmaster --image=busybox --restart=Never --rm -it \
  --overrides='
{
  "spec": {
    "containers": [{
      "name": "backup",
      "image": "busybox",
      "command": ["tar", "czf", "/backup/data.tar.gz", "/data"],
      "volumeMounts": [
        {"name": "data", "mountPath": "/data"},
        {"name": "backup", "mountPath": "/backup"}
      ]
    }],
    "volumes": [
      {"name": "data", "persistentVolumeClaim": {"claimName": "quizmaster-quizzes-pvc"}},
      {"name": "backup", "hostPath": {"path": "/tmp/backup"}}
    ]
  }
}'
```

### Restore from Backup

```bash
# Extract backup to PVC
kubectl run restore -n quizmaster --image=busybox --restart=Never --rm -it \
  --overrides='...'  # Similar structure as backup
```

## Security Considerations

1. **Non-root User**: Containers run as user 1001
2. **Read-only Root Filesystem**: Disabled (needs write for node_modules)
3. **Dropped Capabilities**: All capabilities dropped
4. **Network Policies**: Consider adding for production
5. **RBAC**: Use least-privilege service accounts
6. **Secrets**: Store API keys in Kubernetes Secrets, not ConfigMaps
7. **Rate Limiting**: Built-in Socket.IO rate limiting (10 events/second per client)
8. **Cryptographic File Names**: Uploaded files use secure random names (`crypto.randomBytes()`)
9. **Server-Side API Keys**: Use `CLAUDE_API_KEY` env var so keys never reach clients

### Example NetworkPolicy

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: quizmaster-network-policy
  namespace: quizmaster
spec:
  podSelector:
    matchLabels:
      app: quizmaster-pro
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
      - namespaceSelector: {}
      ports:
      - protocol: TCP
        port: 3000
  egress:
    - to:
      - namespaceSelector: {}
```

## Production Checklist

Before deploying to production:

- [ ] Build and push image to private registry
- [ ] Update image reference in deployment.yaml
- [ ] Configure appropriate resource limits
- [ ] Set up Ingress with TLS/HTTPS
- [ ] Configure DNS records
- [ ] Set up monitoring and alerting
- [ ] Configure log aggregation
- [ ] Test backup and restore procedures
- [ ] Review security settings
- [ ] Configure network policies
- [ ] Set up automated health checks
- [ ] Document incident response procedures
- [ ] Test graceful shutdown behavior
- [ ] Verify session affinity for Socket.IO
- [ ] Test WebSocket connections through ingress

## Additional Resources

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Socket.IO with Kubernetes](https://socket.io/docs/v4/using-multiple-nodes/)
- [Kubernetes Best Practices](https://kubernetes.io/docs/concepts/configuration/overview/)
- [Health Check Patterns](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)

## Support

For issues or questions:
1. Check application logs: `kubectl logs -n quizmaster -l app=quizmaster-pro`
2. Review Kubernetes events: `kubectl get events -n quizmaster`
3. Consult CLAUDE.md in project root for application-specific details
