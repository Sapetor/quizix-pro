# Migration: `quizmaster` → `quizix` deployment rename

The deployment identifiers were renamed from `quizmaster*` to `quizix*`. Applying
the new manifests blindly does **not** migrate a live deployment: the Kubernetes
namespace, PVCs, the Docker host data dirs, and the pulled image all keep their
old names until an operator moves them. Follow the ordered steps below during a
maintenance window.

## What changed

| Old | New |
|---|---|
| namespace `quizmaster` | namespace `quizix` |
| image `ghcr.io/sapetor/quizmaster-pro:latest` | `ghcr.io/sapetor/quizix-pro:latest` |
| deployment/service/container `quizmaster-pro` | `quizix-pro` (Docker container `quizix-pro-app`) |
| configmap `quizmaster-config` | `quizix-config` |
| PVCs `quizmaster-quizzes` / `-results` / `-uploads` | `quizix-quizzes` / `-results` / `-uploads` |
| PDB `quizmaster-pdb`, ingress `quizmaster-ingress` | `quizix-pdb`, `quizix-ingress` |
| ingress path `/quizmaster/` + `BASE_PATH=/quizmaster/` | `/quizix/` + `BASE_PATH=/quizix/` |
| host data dirs `/opt/quizmaster-data`, `$HOME/quizmaster-data` | `/opt/quizix-data`, `$HOME/quizix-data` |

> `BASE_PATH` is now set explicitly in the ConfigMap. The server's built-in
> production default is still the old value, so do **not** remove the explicit
> `BASE_PATH: "/quizix/"` from the ConfigMap. Stored image paths are base-relative
> (`/uploads/...`), so changing the prefix does not corrupt existing data.

---

## A. Kubernetes migration

Run from a machine with `kubectl` access to the cluster.

```bash
# 1. Retag/push the image under the new name (or rebuild via CI).
docker pull ghcr.io/sapetor/quizmaster-pro:latest
docker tag  ghcr.io/sapetor/quizmaster-pro:latest ghcr.io/sapetor/quizix-pro:latest
docker push ghcr.io/sapetor/quizix-pro:latest

# 2. Quiesce the old deployment so no writes happen while copying.
kubectl scale deployment quizmaster-pro -n quizmaster --replicas=0

# 3. Copy data OUT of each old PVC to the local machine.
#    A throwaway pod mounts the old PVCs (same namespace).
for v in quizzes results uploads; do
  kubectl -n quizmaster run copyout-$v --restart=Never --image=busybox \
    --overrides="{\"spec\":{\"containers\":[{\"name\":\"c\",\"image\":\"busybox\",\"command\":[\"sleep\",\"3600\"],\"volumeMounts\":[{\"name\":\"d\",\"mountPath\":\"/data\"}]}],\"volumes\":[{\"name\":\"d\",\"persistentVolumeClaim\":{\"claimName\":\"quizmaster-$v\"}}]}}"
  kubectl -n quizmaster wait --for=condition=Ready pod/copyout-$v --timeout=60s
  kubectl cp quizmaster/copyout-$v:/data ./migrate-$v
  kubectl -n quizmaster delete pod copyout-$v
done

# 4. Create the new namespace + PVCs + workload.
kubectl apply -f k8s/01-quizix-pro.yaml
kubectl apply -f k8s/02-quizix-ingress.yaml   # (configmap.yaml is optional; 01 already includes one)

# 5. Scale the new deployment to 0, then copy data INTO the new PVCs.
kubectl scale deployment quizix-pro -n quizix --replicas=0
for v in quizzes results uploads; do
  kubectl -n quizix run copyin-$v --restart=Never --image=busybox \
    --overrides="{\"spec\":{\"containers\":[{\"name\":\"c\",\"image\":\"busybox\",\"command\":[\"sleep\",\"3600\"],\"volumeMounts\":[{\"name\":\"d\",\"mountPath\":\"/data\"}]}],\"volumes\":[{\"name\":\"d\",\"persistentVolumeClaim\":{\"claimName\":\"quizix-$v\"}}]}}"
  kubectl -n quizix wait --for=condition=Ready pod/copyin-$v --timeout=60s
  kubectl cp ./migrate-$v/. quizix/copyin-$v:/data
  kubectl -n quizix delete pod copyin-$v
done

# 6. Bring the new deployment up and verify.
kubectl scale deployment quizix-pro -n quizix --replicas=1
kubectl rollout status deployment/quizix-pro -n quizix --timeout=300s
# Browse http://<cluster-ip>/quizix and confirm quizzes/results/uploads are present.

# 7. Tear down the old namespace ONLY after verifying the new one.
kubectl delete namespace quizmaster
rm -rf ./migrate-quizzes ./migrate-results ./migrate-uploads
```

Alternative (no data copy): if your PVs use `Retain`, you can rebind each PV to a
new PVC in the `quizix` namespace — patch the PV's `persistentVolumeReclaimPolicy`
to `Retain`, delete the old PVC, clear the PV's `spec.claimRef`, then create the
matching `quizix-*` PVC so it binds to the existing PV. The copy method above is
the safe default and works with dynamic provisioners.

---

## B. Standalone Docker migration

Run on the Docker host.

```bash
# 1. Stop and remove the old container.
docker stop quizmaster-pro quizmaster-pro-app 2>/dev/null || true
docker rm   quizmaster-pro quizmaster-pro-app 2>/dev/null || true

# 2. Move host data directories to the new names.
#    (Use whichever path your deploy script used.)
sudo mv /opt/quizmaster-data /opt/quizix-data 2>/dev/null || true
mv "$HOME/quizmaster-data"   "$HOME/quizix-data" 2>/dev/null || true

# 3. Retag/pull the new image (CI publishes it under the new name).
docker pull ghcr.io/sapetor/quizix-pro:latest 2>/dev/null || \
  docker build -t quizix-pro:latest .

# 4. Start with the renamed compose file.
docker compose up -d --build     # docker-compose.yml (standalone)
# or, on the GitLab server: docker compose -f docker-compose.server.yml up -d --build

# 5. If you used named volumes (quizmaster-pro_*), copy their contents into the
#    new project volumes, then remove the stale ones:
docker volume ls | grep quizmaster        # find leftovers
# docker volume rm <old-volume>            # after confirming data moved

# 6. Verify, then remove the old image.
curl -f http://localhost:3000/health
docker image rm ghcr.io/sapetor/quizmaster-pro:latest quizmaster-pro:latest 2>/dev/null || true
```

---

## Rollback

Nothing is deleted until the final teardown step in each section. If the new
deployment misbehaves, scale it to 0 (K8s) or stop the new container (Docker) and
restart the old one — the old namespace / data dirs / image are still intact until
you explicitly remove them.
