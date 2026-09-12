# Deployment Guide for Quizix Pro

## 🚀 Kubernetes Deployment Checklist

### Before Every Deployment

**CRITICAL**: Always run the production build command before deploying:

```bash
npm run build:prod
```

This command:
1. ✅ Builds optimized CSS bundle
2. ✅ Updates cache-busting version numbers
3. ✅ Updates service worker version
4. ✅ Ensures users get the latest code

### What `build:prod` Does

The `build:prod` script runs:
- `npm run build:css` - Compiles and minifies CSS
- `npm run cache-bust` - Updates version strings in:
  - `public/sw.js` - Service worker cache version
  - `public/index.html` - CSS/JS query string versions

### Version Format

Versions use this format:
- **With git**: `v20260123-a12adf2` (date + git hash)
- **Without git**: `v20260123-1445` (date + time)

## 📦 Deployment Steps

### 1. Development Testing
```bash
npm run dev
# Test all features locally
```

### 2. Production Build
```bash
npm run build:prod
```

**Verify build output:**
```
🔄 Cache Busting for Quizix Pro

Generated version: v20260123-a12adf2

✓ sw.js: v20260122-1230 → v20260123-a12adf2
✓ index.html: Updated 4 asset references to v=13

✅ Cache busting complete!
```

### 3. Commit Changes
```bash
git add public/sw.js public/index.html public/css/main.bundle.css
git commit -m "build: production build v20260123-a12adf2"
git push
```

### 4. Deploy to Kubernetes

**Option A: Direct kubectl**
```bash
kubectl apply -f k8s/01-quizix-pro.yaml
kubectl rollout status deployment/quizix-pro -n quizix
```

**Option B: GitOps (ArgoCD/Flux)**
- Push to deployment branch
- Wait for automatic sync
- Verify rollout in ArgoCD UI

### 5. Verify Deployment

**Check pod status:**
```bash
kubectl get pods -l app=quizix-pro
kubectl logs -l app=quizix-pro --tail=50
```

**Test the application:**
```bash
# Check health endpoint
curl https://your-domain.com/health

# Access the app
open https://your-domain.com
```

## 🐳 Docker Compose Volume Migration (one-time, breaking)

`docker-compose.server.yml` previously mounted:

```yaml
volumes:
  - ./results:/app/results          # host bind
  - ./uploads:/app/uploads          # host bind, and the WRONG path: the app
                                    # writes /app/public/uploads, so this
                                    # directory was always empty
  - quiz_data:/app/public/uploads   # named volume, the real upload store
```

It now mounts three named volumes:

```yaml
volumes:
  - quizzes-data:/app/quizzes
  - results-data:/app/results
  - uploads-data:/app/public/uploads
```

On a server that already runs the old file, `docker compose up -d` starts
against **empty** volumes. The old data is not deleted, it is orphaned: results
stay in `./results` on the host and uploads stay in the `quiz_data` volume.
Copy them across **before** the first start on the new file.

Compose prefixes volume names with the project name, which defaults to the
directory name. Substitute yours if it differs:

```bash
PROJECT=quizix-pro   # check with: docker volume ls

# 1. Stop the old stack.
docker compose -f docker-compose.server.yml down

# 2. Create the new volumes so they exist before anything writes to them.
docker volume create ${PROJECT}_quizzes-data
docker volume create ${PROJECT}_results-data
docker volume create ${PROJECT}_uploads-data

# 3. Uploads: old named volume -> new named volume.
docker run --rm \
  -v ${PROJECT}_quiz_data:/from:ro \
  -v ${PROJECT}_uploads-data:/to \
  alpine sh -c 'cp -a /from/. /to/'

# 4. Results: old host bind -> new named volume.
docker run --rm \
  -v "$PWD/results":/from:ro \
  -v ${PROJECT}_results-data:/to \
  alpine sh -c 'cp -a /from/. /to/'

# 5. Quizzes: there was NO quizzes mount before, so the quiz library,
#    quizzes/users.json and quizzes/.session-secret lived inside the container
#    layer and were destroyed on every redeploy. If the old container is still
#    present, recover them now; otherwise seed from the repo.
docker cp quizix-pro-app:/app/quizzes/. ./quizzes-recovered/ 2>/dev/null \
  && docker run --rm \
       -v "$PWD/quizzes-recovered":/from:ro \
       -v ${PROJECT}_quizzes-data:/to \
       alpine sh -c 'cp -a /from/. /to/'

# 6. The app runs as uid/gid 1001; copied files must be writable by it.
docker run --rm \
  -v ${PROJECT}_quizzes-data:/q \
  -v ${PROJECT}_results-data:/r \
  -v ${PROJECT}_uploads-data:/u \
  alpine chown -R 1001:1001 /q /r /u

# 7. Start the new stack and verify.
docker compose -f docker-compose.server.yml up -d
docker compose -f docker-compose.server.yml exec quizix-pro ls /app/quizzes /app/public/uploads
```

Keep `./results` and the `quiz_data` volume until you have confirmed the new
stack serves the old data. Remove the stale volume only afterwards:
`docker volume rm ${PROJECT}_quiz_data`.

### Script-based deploys changed mount paths too

`.gitlab-ci.yml` and `deploy-to-server.sh` used to mount uploads at
`/app/uploads` (a path the app never writes) and mounted no quizzes volume at
all. They now use `/app/public/uploads` and add `<data-dir>/quizzes`. On an
existing server the previous upload directory is empty, so nothing is lost, but
the quiz library and accounts that lived in the container layer must be copied
out of the old container before it is replaced:

```bash
docker cp quizix-pro-app:/app/quizzes/. /opt/quizix-data/quizzes/    # GitLab CI path
docker cp quizix-pro-app:/app/public/uploads/. /opt/quizix-data/uploads/
chown -R 1001:1001 /opt/quizix-data
```

(`deploy-to-server.sh` uses `$HOME/quizix-data` instead of `/opt/quizix-data`.)

## 🔄 How Auto-Update Works

### Update Strategy

1. **index.html** - Never cached (always fresh from server)
2. **sw.js** - Always revalidated with server
3. **HTTP LAN clients** - JS/CSS/images are served with `no-store` so phones on `http://<lan-ip>` do not pin old builds
4. **HTTPS clients** - Service worker takes over and refreshes cached assets on version change

### Update Flow

```
User visits site
    ↓
Browser fetches index.html (no cache)
    ↓
Is the origin HTTPS / secure?
    ↓
If no:
    Browser fetches JS/CSS/images with no-store headers
    ↓
    User gets latest version from the server

If yes:
    index.html loads sw.js (with version check)
    ↓
    Service Worker detects new CACHE_VERSION
    ↓
    Service Worker installs new cache
    ↓
    Page automatically reloads
    ↓
    User sees latest version! ✨
```

### Automatic Checks

- ✅ Updates checked **immediately** on page load
- ✅ Updates checked **every hour** while page is open
- ✅ Page **auto-reloads** when update detected

## 🛠️ Troubleshooting

### Users Still See Old Version

**Cause**: Build not run before deployment

**Solution**:
```bash
npm run build:prod
git add public/sw.js public/index.html
git commit -m "build: cache bust for deployment"
git push
# Redeploy
```

### Browser Says "Not Secure" On Phones

**Cause**: `http://<lan-ip>` is an insecure context. Mobile browsers disable service workers and will always show a "not secure" warning on plain HTTP.

**Solution**:
- Put the app behind HTTPS with a certificate trusted by the phones.
- For LAN-only installs, use a reverse proxy such as Caddy, Nginx, or Traefik plus a locally trusted certificate (for example `mkcert` or your own internal CA).
- The app now falls back to `no-store` HTTP headers on plain HTTP so updates still arrive, but the security warning only disappears with HTTPS.

### Service Worker Not Updating

**Check service worker version:**
```bash
grep "CACHE_VERSION" public/sw.js
```

Should show a recent version like `v20260123-a12adf2`

**Force update:**
1. Open browser DevTools
2. Go to Application → Service Workers
3. Click "Unregister"
4. Hard refresh (Ctrl+Shift+R / Cmd+Shift+R)

### CSS Not Updating

**Check CSS version:**
```bash
grep "main.bundle.css" public/index.html
```

Should show: `main.bundle.css?v=13` (or higher)

**Fix:**
```bash
npm run build:prod
```

## 📊 Cache Strategy Reference

| Resource | Strategy | Max Age | Revalidation |
|----------|----------|---------|--------------|
| index.html | No cache | 0 | Always |
| sw.js | No cache | 0 | Always |
| CSS files | Cache | 24-48h | With version |
| JS files | Cache | 24-48h | With version |
| Images | Cache | 1-2h | With ETag |
| API calls | Network only | N/A | N/A |
| Uploads | Network only | N/A | N/A |

## 🔐 Environment Variables

### Required for Production

```bash
# .env file
NODE_ENV=production
BASE_PATH=/quizix/  # Or your K8s ingress path
PORT=3000
```

### Optional (AI Features)

```bash
CLAUDE_API_KEY=your-key-here
GEMINI_API_KEY=your-key-here
```

`HUGGINGFACE_API_KEY` is not read by the server. The complete, annotated list
of variables the app actually reads is `.env.example`.

### Diagnostic endpoints: `ENABLE_DEBUG_ROUTES`

```bash
# Leave UNSET in production.
# ENABLE_DEBUG_ROUTES=true
```

Four unauthenticated endpoints are now off unless this is exactly `"true"`:

| Endpoint | What it exposes |
|----------|-----------------|
| `/metrics` | Full Prometheus process metrics |
| `/debug/config` | BASE_PATH and environment dump |
| `/api/debug/files` | Filesystem inspection |
| `/api/debug/directory` | Directory listing |

This gates **development** runs as well. `/metrics` and `/debug/config` were
previously registered unconditionally, and the two `/api/debug` routes only
checked `NODE_ENV !== 'production'`; since `npm start` sets no `NODE_ENV`, a
plain LAN run served all four. Any script or dashboard that scrapes `/metrics`
gets a 404 until the variable is set on that deployment.

There is no Prometheus scrape target, `ServiceMonitor`, or
`prometheus.io/scrape` annotation anywhere in this repository, so nothing in
the shipped manifests breaks. If you added scraping outside the repo, add
`ENABLE_DEBUG_ROUTES: "true"` to the `quizix-config` ConfigMap in
`k8s/01-quizix-pro.yaml` and put a network policy in front of the endpoint.

`/health` and `/ready` are not gated, so container healthchecks and the
Kubernetes liveness/readiness probes are unaffected.

## 📝 Version History Tracking

To track which version is currently deployed:

```bash
# Check service worker version
curl https://your-domain.com/sw.js | grep CACHE_VERSION

# Check deployed git hash
kubectl describe deployment quizix-pro | grep Image
```

## 🎯 Best Practices

### ✅ DO

- Always run `npm run build:prod` before deployment
- Commit generated files (sw.js, index.html, main.bundle.css)
- Test locally before deploying to K8s
- Monitor pod logs after deployment
- Keep deployment notes in git commit messages

### ❌ DON'T

- Deploy without running build:prod
- Edit version numbers manually
- Cache index.html or sw.js in CDN/proxy
- Forget to test after deployment

## 🚨 Emergency Rollback

If a deployment has critical issues:

```bash
# Rollback to previous deployment
kubectl rollout undo deployment/quizix-pro

# Verify rollback
kubectl rollout status deployment/quizix-pro
```

## 📞 Support

- Documentation: `/docs/`
- Issues: GitHub Issues
- Logs: `kubectl logs -l app=quizix-pro --tail=100 -f`
