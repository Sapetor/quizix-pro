# Kubernetes Troubleshooting Guide

This guide documents common issues and fixes for the Quizmaster Pro deployment.

## Cluster Info

**Control Plane (SSH here to run kubectl):**
```bash
ssh labadmin@10.80.21.11
```

Then `sudo -i` or prefix commands with `sudo` as needed.

| Node | Role | Internal IP |
|------|------|-------------|
| k8s-control-plane-1 | control-plane | 192.168.2.51 |
| k8s-control-plane-2 | control-plane | 192.168.2.52 |
| k8s-control-plane-3 | control-plane | 192.168.2.53 |
| k8s-worker-node1 | worker | 192.168.2.54 |
| k8s-worker-node2 | worker | 192.168.2.55 |
| k8s-worker-node3 | worker | 192.168.2.56 |
| k8s-worker-node4 | worker | 192.168.2.57 |
| k8s-worker-node5 | worker | 192.168.2.58 |

**Note:** External access is via `10.80.21.11`. Internal IPs (192.168.2.x) are only accessible from within the cluster.

---

## Deployment Strategy (Simplified)

This app uses a simple, robust configuration:

| Setting | Value | Why |
|---------|-------|-----|
| `replicas` | 1 | Single instance is sufficient |
| `strategy` | Recreate | Avoids Multi-Attach errors with RWO volumes |
| `imagePullPolicy` | IfNotPresent | Avoids Docker Hub rate limits |
| `nodeSelector` | k8s-worker-node5 | Pins to one node, eliminates volume issues |
| `resources` | requests set | Prevents BestEffort QoS (less likely to evict) |

---

## Normal Deployment Workflow

### When You Change App Code

**Step 1: Build and push new Docker image (from WSL):**
```bash
cd /mnt/c/Users/sapet/quizix-pro

# Build the image
docker build -t ghcr.io/sapetor/quizmaster-pro:latest .

# Push to GitHub Container Registry
docker push ghcr.io/sapetor/quizmaster-pro:latest
```

**Step 2: Deploy to cluster:**
```bash
# SSH to control plane
ssh labadmin@10.80.21.11

# Restart deployment (pulls new image)
kubectl rollout restart deployment/quizmaster-pro -n quizmaster
kubectl get pods -n quizmaster -w
```

### When You Change Kubernetes Manifest

**Step 1: Copy manifest to cluster (from WSL):**
```bash
scp /mnt/c/Users/sapet/quizix-pro/k8s/01-quizmaster-pro.yaml labadmin@10.80.21.11:/tmp/
```

**Step 2: Apply changes (from control plane):**
```bash
ssh labadmin@10.80.21.11

kubectl apply -f /tmp/01-quizmaster-pro.yaml
kubectl rollout restart deployment/quizmaster-pro -n quizmaster
kubectl get pods -n quizmaster -w
```

### When You Change Both

```bash
# From WSL - build and push
cd /mnt/c/Users/sapet/quizix-pro
docker build -t ghcr.io/sapetor/quizmaster-pro:latest .
docker push ghcr.io/sapetor/quizmaster-pro:latest

# Copy manifest
scp /mnt/c/Users/sapet/quizix-pro/k8s/01-quizmaster-pro.yaml labadmin@10.80.21.11:/tmp/

# From control plane - apply and restart
ssh labadmin@10.80.21.11
kubectl apply -f /tmp/01-quizmaster-pro.yaml
kubectl rollout restart deployment/quizmaster-pro -n quizmaster
kubectl get pods -n quizmaster -w
```

---

## Issue: Docker Hub Rate Limiting (429 Too Many Requests)

### Symptoms
```
Failed to pull image: 429 Too Many Requests
toomanyrequests: You have reached your unauthenticated pull rate limit
```

### Cause
- Docker Hub limits anonymous pulls to 100 per 6 hours per IP
- `imagePullPolicy: Always` + pod evictions = many pulls
- Multiple nodes pulling = limit hit quickly

### Prevention (Already Configured)
- `imagePullPolicy: IfNotPresent` - only pulls if image not on node
- `nodeSelector` - pins to one node, image cached there

### Fix if Rate Limited
1. **Wait ~6 hours** for rate limit to reset
2. **Or ask cluster owner** to add Docker Hub credentials:
   ```bash
   kubectl create secret docker-registry dockerhub-cred \
     --docker-server=docker.io \
     --docker-username=USERNAME \
     --docker-password=PASSWORD \
     -n quizmaster
   ```
   Then uncomment `imagePullSecrets` in deployment.

### Check for Existing Docker Credentials
```bash
kubectl get secrets -n quizmaster | grep -i docker
kubectl get secrets -A | grep -i docker
```

### Current Setup: GitHub Container Registry

We use GitHub Container Registry (ghcr.io) instead of Docker Hub to avoid rate limits.

**Image:** `ghcr.io/sapetor/quizmaster-pro:latest`

**One-time setup (already done):**

```bash
# Login to GitHub Container Registry (need PAT with write:packages scope)
echo "YOUR_GITHUB_PAT" | docker login ghcr.io -u sapetor --password-stdin
```

**Make the package public:**
1. Go to github.com → Your profile → Packages tab
2. Click quizmaster-pro → Package settings
3. Danger Zone → Change visibility → Public

**Benefits:**
- No rate limits for public images
- Faster pulls (GitHub's CDN)
- No need for imagePullSecrets if public

---

## Issue: Pods Stuck in PodInitializing / ContainerStatusUnknown / Evicted

### Symptoms
- Many pods in `PodInitializing` for hours
- Pods showing `ContainerStatusUnknown`
- Pods showing `Completed` instead of `Running`
- Events showing `Multi-Attach error for volume`
- Events showing `The node was low on resource: ephemeral-storage`

### Root Cause
1. **Ephemeral storage exhaustion** - Worker nodes running out of disk space
2. **PVC Multi-Attach** - RWO volumes can't attach to multiple nodes simultaneously

### Diagnosis

**From control plane (ssh labadmin@10.80.21.11):**

```bash
# Check pod status
kubectl get pods -n quizmaster

# Check recent events
kubectl get events -n quizmaster --sort-by='.lastTimestamp' | tail -30

# Describe a stuck pod
kubectl describe pod POD_NAME -n quizmaster | tail -40

# Check disk on worker nodes
for ip in 192.168.2.54 192.168.2.55 192.168.2.56 192.168.2.57 192.168.2.58; do
  echo -n "$ip: " && ssh root@$ip "df -h / | tail -1 | awk '{print \$5, \$4}'"
done
```

---

## Fix: Quick Recovery (Safe - Only Affects Your App)

These commands only affect the `quizmaster` namespace. Safe to run.

**From control plane (ssh labadmin@10.80.21.11):**

```bash
# 1. Delete all non-running pods (cleans up zombies)
kubectl delete pods -n quizmaster --field-selector=status.phase!=Running --force --grace-period=0

# 2. Scale down to release volumes
kubectl scale deployment quizmaster-pro -n quizmaster --replicas=0

# 3. Wait for volumes to detach
sleep 30

# 4. Scale back up
kubectl scale deployment quizmaster-pro -n quizmaster --replicas=1

# 5. Watch it come up
kubectl get pods -n quizmaster -w
```

---

## Fix: Apply Updated Manifest

**Step 1: From WSL on your local machine, SCP the manifest to control plane:**

```bash
scp /mnt/c/Users/sapet/quizix-pro/k8s/01-quizmaster-pro.yaml labadmin@10.80.21.11:/tmp/
```

**Step 2: Verify the file transferred correctly (on control plane):**

```bash
# Check for Recreate strategy
grep -A1 "strategy:" /tmp/01-quizmaster-pro.yaml

# Check for resource requests
grep -A6 "resources:" /tmp/01-quizmaster-pro.yaml

# Check for nodeSelector
grep -A2 "nodeSelector:" /tmp/01-quizmaster-pro.yaml

# Or compare checksums (run md5sum on both machines)
md5sum /tmp/01-quizmaster-pro.yaml
```

**Step 3: Apply the manifest (on control plane):**

```bash
kubectl apply -f /tmp/01-quizmaster-pro.yaml
kubectl rollout restart deployment/quizmaster-pro -n quizmaster
kubectl get pods -n quizmaster -w
```

---

## Fix: Cluster-Wide Disk Cleanup (Requires Cluster Owner Approval)

**WARNING:** These commands affect the entire cluster, not just your app.
**Ask the cluster owner before running these.**

**On each worker node (SSH to 192.168.2.54-58):**

```bash
# Check what's using disk
df -h /
du -sh /var/* 2>/dev/null | sort -hr | head -10

# Check container image count
crictl images | wc -l

# Check log sizes
du -sh /var/log/containers/ /var/log/pods/ 2>/dev/null
journalctl --disk-usage
```

**Cleanup commands (GET APPROVAL FIRST):**

```bash
# Prune unused container images
crictl rmi --prune

# Vacuum journal logs to 100MB
journalctl --vacuum-size=100M

# Remove exited containers
crictl rm $(crictl ps -a -q --state exited) 2>/dev/null
```

---

## Changing the Pinned Node

The app is pinned to `k8s-worker-node5` by default. To change:

1. Check which nodes have disk space:
   ```bash
   for ip in 192.168.2.54 192.168.2.55 192.168.2.56 192.168.2.57 192.168.2.58; do
     echo -n "$ip: " && ssh root@$ip "df -h / | tail -1 | awk '{print \$5, \$4}'"
   done
   ```

2. Edit `k8s/01-quizmaster-pro.yaml`:
   ```yaml
   nodeSelector:
     kubernetes.io/hostname: k8s-worker-nodeX  # Change X
   ```

3. Redeploy (SCP + apply + restart)

---

## Preventive Measures

### 1. Monitor disk before it becomes critical
```bash
for ip in 192.168.2.54 192.168.2.55 192.168.2.56 192.168.2.57 192.168.2.58; do
  echo -n "$ip: "
  ssh root@$ip "df -h / | tail -1 | awk '{print \$5}'"
done
```

### 2. Check which node your app is on
```bash
kubectl get pods -n quizmaster -o wide
```

### 3. Check PVC status
```bash
kubectl get pvc -n quizmaster
```

---

## Useful Commands Reference

| Task | Command |
|------|---------|
| List pods | `kubectl get pods -n quizmaster` |
| Watch pods | `kubectl get pods -n quizmaster -w` |
| Pod details | `kubectl describe pod POD_NAME -n quizmaster` |
| Pod logs | `kubectl logs POD_NAME -n quizmaster` |
| Recent events | `kubectl get events -n quizmaster --sort-by='.lastTimestamp'` |
| Node status | `kubectl get nodes -o wide` |
| All workloads | `kubectl get pods -A -o wide` |
| Delete stuck pods | `kubectl delete pods -n quizmaster --field-selector=status.phase!=Running --force --grace-period=0` |
| Restart deployment | `kubectl rollout restart deployment/quizmaster-pro -n quizmaster` |
| Scale down | `kubectl scale deployment quizmaster-pro -n quizmaster --replicas=0` |
| Scale up | `kubectl scale deployment quizmaster-pro -n quizmaster --replicas=1` |

---

## Summary: What Went Wrong (Feb 2026 Incident)

1. **Disk pressure** on worker nodes triggered pod evictions
2. **RWO volumes** couldn't detach fast enough → Multi-Attach errors
3. **Eviction loop** caused 20+ zombie pods
4. **`imagePullPolicy: Always`** meant every restart pulled from Docker Hub
5. **Docker Hub rate limit** hit (100 pulls/6hrs anonymous)

**Fixes applied:**
- `strategy: Recreate` - clean shutdown before new pod
- `imagePullPolicy: IfNotPresent` - use cached images
- `nodeSelector` - pin to one node, no Multi-Attach possible
- `resources` requests - prevents BestEffort QoS, less likely to evict
- **Switched to ghcr.io** - no rate limits

---

## Issue: Cluster-Wide Disk Pressure (External Access Fails)

### Symptoms
- App pod is Running and healthy
- `kubectl exec` into pod shows app responds on localhost
- External URL (http://10.80.21.11/quizmaster) times out or returns blank
- Multiple namespaces showing evicted pods

### Diagnosis

**Check which nodes have disk pressure:**
```bash
kubectl get nodes -o custom-columns='NAME:.metadata.name,DISK_PRESSURE:.status.conditions[?(@.type=="DiskPressure")].status,LAST_TRANSITION:.status.conditions[?(@.type=="DiskPressure")].lastTransitionTime'
```

**Check cluster-wide eviction events:**
```bash
kubectl get events -A | grep -i "disk\|ephemeral\|evict" | tail -20
```

**Check MetalLB status (provides external IPs):**
```bash
kubectl get pods -n metallb-system | grep -E "Running|controller|speaker"
```

**Check Ingress controller:**
```bash
kubectl get pods -n ingress-nginx | grep Running
```

### Root Cause

When multiple worker nodes have disk pressure:
1. Pods get evicted cluster-wide (not just your app)
2. Core infrastructure affected: MetalLB, Ingress, Rook-Ceph
3. MetalLB controller/speakers down = external IPs don't route
4. Cluster enters "flapping state" - components constantly evicted/restarting

### Recovery

**Step 1: Find a healthy node**
```bash
kubectl get nodes -o custom-columns='NAME:.metadata.name,DISK:.status.conditions[?(@.type=="DiskPressure")].status' | grep False
```

**Step 2: Move your app to healthy node**

Edit `k8s/01-quizmaster-pro.yaml`:
```yaml
nodeSelector:
  kubernetes.io/hostname: k8s-worker-node2  # Pick a node without disk pressure
```

Then redeploy:
```bash
scp /mnt/c/Users/sapet/quizix-pro/k8s/01-quizmaster-pro.yaml labadmin@10.80.21.11:/tmp/
# On control plane:
kubectl apply -f /tmp/01-quizmaster-pro.yaml
kubectl rollout restart deployment/quizmaster-pro -n quizmaster
```

**Step 3: If external access still fails, use port-forward workaround**
```bash
# From control plane
kubectl port-forward -n quizmaster svc/quizmaster-pro 3000:3000 --address=0.0.0.0
```
Then access: `http://10.80.21.11:3000`

Or via SSH tunnel from local machine:
```bash
ssh -L 3000:localhost:3000 labadmin@10.80.21.11 "kubectl port-forward -n quizmaster svc/quizmaster-pro 3000:3000"
```
Then access: `http://localhost:3000`

### When to Escalate to Cluster Owner

Escalate immediately if:
- 3+ worker nodes show `DiskPressure: True`
- MetalLB has no running controller
- Ingress controller keeps getting evicted
- Multiple namespaces affected (gitlab, rook-ceph, metallb-system)

The cluster owner needs to:
1. Clean up disk on affected nodes
2. Configure aggressive image garbage collection
3. Set up log rotation
4. Add monitoring/alerts for disk usage

---

## Issue: Stuck Volume Attachments

### Symptoms
- Pod stuck in `Init:0/1` for extended time
- Events show: `AttachVolume.Attach failed for volume "pvc-xxx" : volume attachment is being deleted`
- Volume attachments show `ATTACHED: true` but pod can't mount

### Fix

```bash
# Scale down
kubectl scale deployment quizmaster-pro -n quizmaster --replicas=0

# Find stuck attachments
kubectl get volumeattachments | grep -E "(pvc-99eec36a|pvc-e08e1895|pvc-15a8a2dd)"

# Remove finalizers to force delete
kubectl patch volumeattachment <NAME> -p '{"metadata":{"finalizers":null}}' --type=merge

# Verify gone
kubectl get volumeattachments | grep quizmaster

# Scale back up
kubectl scale deployment quizmaster-pro -n quizmaster --replicas=1
```

---

## Contact

If disk issues persist, contact the cluster owner to:
1. Set up automatic image garbage collection
2. Configure log rotation
3. Add more disk to worker nodes
4. Set up monitoring/alerts for disk usage
5. Add Docker Hub credentials to avoid rate limits
