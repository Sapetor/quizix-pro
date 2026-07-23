# Quizix Pro - Cluster Deployment Guide

This deployment is configured to match your cluster's patterns and uses the `quizix` namespace.

## 🎯 Cluster Pattern Matching

This configuration has been adapted to match your cluster's deployment patterns:

✅ **Single unified YAML** - All resources in one file with `---` separators
✅ **Path-based routing** - Uses `/quiz` path (not host-based like `quiz.domain.com`)
✅ **RollingUpdate strategy** - Matches your server deployment pattern
✅ **nginx ingress** - Compatible with your existing `lab-apps` ingress
✅ **No SSL redirect** - Matches your cluster's HTTP configuration
✅ **Simple labels** - Uses `{ app: quizix-pro }` format
✅ **ReadWriteOnce PVCs** - Uses cluster default storage class
✅ **ConfigMap with envFrom** - Consistent with your server pattern
✅ **imagePullPolicy** - Ready for both IfNotPresent and Always

**Key additions for Quizix Pro:**
- 🔌 **Socket.IO support** - Extended timeout (3600s vs your 60s) + WebSocket annotations
- ❤️ **Health probes** - `/health` and `/ready` endpoints
- 💾 **Persistent storage** - 3 PVCs for quizzes, results, and uploads
- 📍 **Session affinity** - ClientIP sticky sessions for multiplayer games

## Quick Start

### 1. Build Docker Image

```bash
# From project root
docker build -t quizix-pro:latest .
```

### 2. Push to Registry (if using private registry)

```bash
# Tag for your registry
docker tag quizix-pro:latest your-registry/quizix-pro:latest

# Push
docker push your-registry/quizix-pro:latest
```

**Important:** Update the image in `01-quizix-pro.yaml`:
```yaml
image: your-registry/quizix-pro:latest
```

### 3. Deploy to Cluster

```bash
cd k8s
kubectl apply -f 01-quizix-pro.yaml
```

Or use the automated script:
```bash
./deploy-to-cluster.sh
```

### 4. Verify Deployment

```bash
# Check pods
kubectl get pods -n quizix

# Check services
kubectl get svc -n quizix

# Check PVCs
kubectl get pvc -n quizix

# View logs
kubectl logs -n quizix -l app=quizix-pro -f
```

### 5. Access the Application

**Port forwarding (for testing):**
```bash
kubectl port-forward -n quizix svc/quizix-pro 3000:3000
```
Then visit: http://localhost:3000

**For external access**, configure ingress in `02-quizix-ingress.yaml`

## Configuration

### Environment Variables

Edit `quizix-config` ConfigMap in `01-quizix-pro.yaml`:
```yaml
data:
  NODE_ENV: "production"
  PORT: "3000"
  # Add more as needed
```

### Storage

Three PVCs are created:
- `quizix-quizzes` (1Gi) - Quiz definitions
- `quizix-results` (2Gi) - Game results
- `quizix-uploads` (5Gi) - Image uploads

Adjust sizes in `01-quizix-pro.yaml` if needed.

### Private Registry

If using private Docker registry, uncomment in `01-quizix-pro.yaml`:
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
  -n quizix
```

## External Access

Your cluster uses **path-based routing** (no host/domain names). Quizix Pro provides 3 ingress options:

### Option 1: Standalone Ingress (Simplest)

Deploy Quizix Pro with its own ingress:

```bash
kubectl apply -f 02-quizix-ingress.yaml
```

Access at: **`http://your-cluster-ip/quiz`**

This creates a separate ingress in the `quizix` namespace with:
- Path: `/quiz` → Quizix Pro
- Increased timeout (3600s) for Socket.IO WebSocket connections
- Session affinity for sticky sessions

### Option 2: Integrate into Existing lab-apps Ingress (Recommended)

Add Quizix Pro to your existing `lab-apps` ingress:

**1. Change namespace to `lab` in `01-quizix-pro.yaml`:**
```bash
# Replace all instances of 'namespace: quizix' with 'namespace: lab'
sed -i 's/namespace: quizix/namespace: lab/g' k8s/01-quizix-pro.yaml
```

**2. Update your existing `ingress.yaml` to add:**
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: lab-apps
  namespace: lab
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "false"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"  # ⚠️ Changed from 60 to 3600
    nginx.ingress.kubernetes.io/use-regex: "true"
    # ⚠️ Add these new annotations for Socket.IO:
    nginx.ingress.kubernetes.io/websocket-services: "quizix-pro"
    nginx.ingress.kubernetes.io/affinity: "cookie"
    nginx.ingress.kubernetes.io/session-cookie-name: "quizix-affinity"
spec:
  ingressClassName: nginx
  rules:
    - http:
        paths:
          - path: /lab
            pathType: Prefix
            backend:
              service:
                name: client
                port:
                  number: 80
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: server
                port:
                  number: 3000
          # ⚠️ Add this new path:
          - path: /quiz
            pathType: Prefix
            backend:
              service:
                name: quizix-pro
                port:
                  number: 3000
```

**3. Apply the changes:**
```bash
kubectl apply -f 01-quizix-pro.yaml
kubectl apply -f your-ingress.yaml
```

Access at: **`http://your-cluster-ip/quiz`**

### Option 3: Cross-Namespace Access

Keep Quizix in `quizix` namespace but access from `lab` ingress using ExternalName service. See instructions in `02-quizix-ingress.yaml`.

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
kubectl describe pod -n quizix -l app=quizix-pro

# Check events
kubectl get events -n quizix --sort-by='.lastTimestamp'
```

### PVC not binding

```bash
# Check PVC status
kubectl get pvc -n quizix

# Check storage class
kubectl get storageclass
```

If PVCs are Pending, your cluster may need a specific storage class. Add to PVC spec:
```yaml
storageClassName: your-storage-class
```

### Image pull errors

If using private registry:
1. Verify secret exists: `kubectl get secret dockerhub-cred -n quizix`
2. Verify credentials are correct
3. Uncomment `imagePullSecrets` in deployment

### Socket.IO connection issues

- Verify session affinity is enabled in Service (it is by default)
- Check that WebSocket connections can reach the pod
- If using Ingress, ensure WebSocket annotations are uncommented

## Cleanup

```bash
# Delete all resources
kubectl delete -f 01-quizix-pro.yaml

# Or delete namespace (removes everything)
kubectl delete namespace quizix
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
kubectl get pods -n quizix -w

# Stream logs
kubectl logs -n quizix -l app=quizix-pro -f --tail=50

# Execute into pod
kubectl exec -it -n quizix deployment/quizix-pro -- /bin/sh
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
