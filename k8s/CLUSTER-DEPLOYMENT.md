# QuizMaster Pro - Cluster Deployment Guide

This deployment is configured to match your cluster's patterns and uses the `quizmaster` namespace.

## Quick Start

### 1. Build Docker Image

```bash
# From project root
docker build -t quizmaster-pro:latest .
```

### 2. Push to Registry (if using private registry)

```bash
# Tag for your registry
docker tag quizmaster-pro:latest your-registry/quizmaster-pro:latest

# Push
docker push your-registry/quizmaster-pro:latest
```

**Important:** Update the image in `01-quizmaster-pro.yaml`:
```yaml
image: your-registry/quizmaster-pro:latest
```

### 3. Deploy to Cluster

```bash
cd k8s
kubectl apply -f 01-quizmaster-pro.yaml
```

Or use the automated script:
```bash
./deploy-to-cluster.sh
```

### 4. Verify Deployment

```bash
# Check pods
kubectl get pods -n quizmaster

# Check services
kubectl get svc -n quizmaster

# Check PVCs
kubectl get pvc -n quizmaster

# View logs
kubectl logs -n quizmaster -l app=quizmaster-pro -f
```

### 5. Access the Application

**Port forwarding (for testing):**
```bash
kubectl port-forward -n quizmaster svc/quizmaster-pro 3000:3000
```
Then visit: http://localhost:3000

**For external access**, configure ingress in `02-quizmaster-ingress.yaml`

## Configuration

### Environment Variables

Edit `quizmaster-config` ConfigMap in `01-quizmaster-pro.yaml`:
```yaml
data:
  NODE_ENV: "production"
  PORT: "3000"
  # Add more as needed
```

### Storage

Three PVCs are created:
- `quizmaster-quizzes` (1Gi) - Quiz definitions
- `quizmaster-results` (2Gi) - Game results
- `quizmaster-uploads` (5Gi) - Image uploads

Adjust sizes in `01-quizmaster-pro.yaml` if needed.

### Private Registry

If using private Docker registry, uncomment in `01-quizmaster-pro.yaml`:
```yaml
imagePullSecrets:
  - name: dockerhub-cred
```

Then create the secret:
```bash
kubectl create secret docker-registry dockerhub-cred \
  --docker-server=https://index.docker.io/v1/ \
  --docker-username=YOUR_USERNAME \
  --docker-password=YOUR_PASSWORD \
  --docker-email=YOUR_EMAIL \
  -n quizmaster
```

## External Access

### Option 1: Ingress (Recommended)

Edit `02-quizmaster-ingress.yaml` and uncomment the ingress configuration for your controller (nginx, traefik, etc.).

**For nginx ingress:**
1. Uncomment the nginx Ingress section
2. Update `host: quiz.yourdomain.com`
3. Apply: `kubectl apply -f 02-quizmaster-ingress.yaml`

### Option 2: LoadBalancer

Uncomment the LoadBalancer service in `02-quizmaster-ingress.yaml`:
```bash
kubectl apply -f 02-quizmaster-ingress.yaml
kubectl get svc -n quizmaster quizmaster-pro-lb
```
Use the EXTERNAL-IP to access the app.

## Health Checks

The app exposes two health endpoints:

- **Liveness:** `http://localhost:3000/health`
  - Returns 200 if app is alive

- **Readiness:** `http://localhost:3000/ready`
  - Returns 200 if app is ready (directories accessible)
  - Returns 503 if not ready

## Troubleshooting

### Pods not starting

```bash
# Describe pod
kubectl describe pod -n quizmaster -l app=quizmaster-pro

# Check events
kubectl get events -n quizmaster --sort-by='.lastTimestamp'
```

### PVC not binding

```bash
# Check PVC status
kubectl get pvc -n quizmaster

# Check storage class
kubectl get storageclass
```

If PVCs are Pending, your cluster may need a specific storage class. Add to PVC spec:
```yaml
storageClassName: your-storage-class
```

### Image pull errors

If using private registry:
1. Verify secret exists: `kubectl get secret dockerhub-cred -n quizmaster`
2. Verify credentials are correct
3. Uncomment `imagePullSecrets` in deployment

### Socket.IO connection issues

- Verify session affinity is enabled in Service (it is by default)
- Check that WebSocket connections can reach the pod
- If using Ingress, ensure WebSocket annotations are uncommented

## Cleanup

```bash
# Delete all resources
kubectl delete -f 01-quizmaster-pro.yaml

# Or delete namespace (removes everything)
kubectl delete namespace quizmaster
```

**Note:** Deleting the namespace will also delete all PVCs and data!

## Scaling

**Current limitation:** Single replica only (in-memory game state).

For horizontal scaling:
1. Add Redis for shared session storage
2. Update Socket.IO adapter to use Redis
3. Increase replicas in deployment

## Monitoring

```bash
# Watch pod status
kubectl get pods -n quizmaster -w

# Stream logs
kubectl logs -n quizmaster -l app=quizmaster-pro -f --tail=50

# Execute into pod
kubectl exec -it -n quizmaster deployment/quizmaster-pro -- /bin/sh
```

## Key Differences from Standard K8s Setup

This deployment matches your cluster's patterns:
- ✅ Single unified YAML file (not separate files)
- ✅ Uses cluster's default storage class
- ✅ Simple label format `{ app: name }`
- ✅ `envFrom` with ConfigMap
- ✅ `ReadWriteOnce` access mode
- ✅ `imagePullPolicy: IfNotPresent`
- ✅ Includes session affinity for Socket.IO
- ✅ HTTP health checks (/health, /ready)
