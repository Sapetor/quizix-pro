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

Both Dockerfiles also run `npm run build:prod` in their build stage, so an
image built from the current source always contains a fresh CSS bundle.
Committing the generated files still matters for `npm start` deployments and
for the CSS bundle staleness check in CI.

### What `build:prod` Does

The `build:prod` script runs:
- `npm run build:css` - Compiles and minifies CSS
- `npm run cache-bust` - Updates version strings in:
  - `public/sw.js` - the `BUILD_STAMP` fallback version
  - `public/index.html` - CSS/JS query string versions

At runtime the server overrides both: on every start it generates an
`ASSET_VERSION` (`server.js`), rewrites every `?v=NN` in `index.html` to it,
and injects it into `sw.js` as the service worker `CACHE_VERSION`. A restart
therefore invalidates client caches even if `cache-bust` was not run.
`BUILD_STAMP` is used only when `sw.js` is served without that substitution.

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

The manifest runs `ghcr.io/sapetor/quizix-pro:latest` with
`imagePullPolicy: Always`, so `kubectl apply` alone does not deploy new code
when the manifest is unchanged. Build and push the image, then run
`kubectl rollout restart deployment/quizix-pro -n quizix`
(see "Normal Deployment Workflow" in `k8s/TROUBLESHOOTING.md`).

**Option B: GitOps (ArgoCD/Flux)**
- Push to deployment branch
- Wait for automatic sync
- Verify rollout in ArgoCD UI

### 5. Verify Deployment

**Check pod status:**
```bash
kubectl get pods -n quizix -l app=quizix-pro
kubectl logs -n quizix -l app=quizix-pro --tail=50
```

**Test the application:**
```bash
# Check health endpoint (the ingress strips the /quizix prefix)
curl https://your-domain.com/quizix/health

# Access the app
open https://your-domain.com/quizix/
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

## Container hardening

All three deployment paths now drop capabilities and block privilege
escalation. The server listens on `PORT`, which every deployment file sets to
3000 (`server.js`, `server.listen(PORT, '0.0.0.0')`), so no capability is
needed to bind it.

| Setting | docker-compose.yml | docker-compose.server.yml | k8s/01-quizix-pro.yaml |
|---------|--------------------|---------------------------|------------------------|
| No new privileges | `security_opt` | `security_opt` | `allowPrivilegeEscalation: false` |
| Capabilities | `cap_drop: ALL` | `cap_drop: ALL` | `capabilities.drop: [ALL]` |
| Process cap | `pids_limit: 256` | `deploy.resources.limits.pids: 256` | not set (no pod-level equivalent) |
| Memory / CPU | 2g / 2 CPUs | 512M / 0.5 CPU | 512Mi / 500m |
| Non-root | image `USER nodejs` | image `USER nodejs` | `runAsNonRoot`, `runAsUser: 1001` |
| Read-only root | off | off | `readOnlyRootFilesystem: true` |
| seccomp | Docker default | Docker default | `RuntimeDefault` |

The server compose file keeps its own 512M / 0.5 CPU budget instead of copying
the 2g / 2 CPU values from `docker-compose.yml`, which sizes a LAN host that
also runs Manim. Compose maps `pids_limit` and `deploy.resources.limits.pids`
onto one setting and rejects the file if both are set to different values, so
the process cap lives in the `deploy` block there.

Read-only root is enabled only in Kubernetes, where every writable path is a
mount: the three PVCs (`/app/quizzes`, `/app/results`, `/app/public/uploads`)
plus an `emptyDir` at `/tmp` for `os.tmpdir()`. The compose files leave it off
because both expose `MANIM_ENABLED`, and a Manim render writes to HOME and to
font caches that no mount covers. Enabling `MANIM_ENABLED` in the Kubernetes
ConfigMap requires the same re-check before the pod will render.

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

**Cause**: The new image was not built and pushed, or the pod was not
restarted. Since the server stamps a new `ASSET_VERSION` at every start, a
running pod on the new image is enough for clients to update; a stale CSS
bundle in git also shows up here.

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
# Build-time fallback stamp in the source file
grep "BUILD_STAMP =" public/sw.js

# Version the running server injects (changes on every server start)
curl -s https://your-domain.com/quizix/sw.js | grep "INJECTED_VERSION ="
```

The first should show a recent stamp like `v20260123-a12adf2`; the second
shows the server's current `ASSET_VERSION`.

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

The source file holds a numeric `?v=NN`. The served page replaces it with the
server's per-start `ASSET_VERSION`, so check the live value with
`curl -s https://your-domain.com/quizix/ | grep main.bundle.css`.

**Fix:**
```bash
npm run build:prod
```

## 📊 Cache Strategy Reference

| Resource | Strategy | Max Age | Revalidation |
|----------|----------|---------|--------------|
| index.html | No cache | 0 | Always |
| sw.js | No cache | 0 | Always |
| CSS files | HTTPS: `max-age=0, must-revalidate`; HTTP: `no-store` | 0 | ETag + version query |
| JS files | HTTPS: `max-age=0, must-revalidate`; HTTP: `no-store` | 0 | ETag + version query |
| Images | HTTPS: cache; HTTP: `no-store` | HTTPS: 1h desktop, 2h mobile | ETag |
| API calls | Network only | N/A | N/A |
| Uploads | Network only | N/A | N/A |

Source: `middleware/static-files.js`. A request counts as HTTPS when
`req.secure` is set or `X-Forwarded-Proto` is `https`. On HTTPS the service
worker does the long-term caching in its own Cache Storage.

## 🔐 Environment Variables

### Required for Production

```bash
# .env file
NODE_ENV=production
BASE_PATH=/quizix/  # Or your K8s ingress path; use / when served at the root
PORT=3000
```

With `NODE_ENV=production` and no `BASE_PATH`, the server defaults to
`/quizix/` (`server.js`), so any deployment served at the root must set
`BASE_PATH=/` explicitly.

`server.js` loads `.env` from the working directory (`dotenv`), which covers
`npm start`. The Docker images do not copy `.env`, and neither compose file
uses `env_file`, so in a container only the variables listed in the compose
file's `environment:` block (or the Kubernetes ConfigMap) are set.

### Optional (AI Features)

```bash
CLAUDE_API_KEY=your-key-here
GEMINI_API_KEY=your-key-here
```

`HUGGINGFACE_API_KEY` is not read by the server. The complete, annotated list
of variables the app actually reads is `.env.example`.

### Account signup: `ALLOW_SIGNUP`

```bash
# Leave unset for a single-operator deployment.
# ALLOW_SIGNUP=true
```

On a fresh instance with no accounts, `POST /api/auth/signup` is open so the
operator can create the first account. Once any account exists, signup returns
403 (`error_signup_disabled`) unless this is exactly `"true"`. Existing accounts
and `login`/`logout` are unaffected either way. Set it to `"true"` only if you
want anyone who can reach the port to register, which also grants them the
server-side `CLAUDE_API_KEY` / `GEMINI_API_KEY` generation endpoints.

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

## Behind a reverse proxy or Cloudflare Tunnel

This setup runs the app as a plain process (`npm start`) on a host that also
runs `cloudflared`, and points the tunnel at the app's port. The examples use
the hostname `quiz.example.com` and port 3400. Any free port works as long as
`PORT` matches the tunnel's `service` URL.

### Tunnel ingress

In the `cloudflared` config file, route the hostname to the local port:

```yaml
ingress:
  - hostname: quiz.example.com
    service: http://localhost:3400
  - service: http_status:404
```

`cloudflared` requires the last ingress rule to be a catch-all, which is what
the final `http_status:404` line is.

### Environment

Put these in `.env` in the project root (`server.js` loads it with `dotenv`)
or export them before `npm start`:

```bash
NODE_ENV=production
BASE_PATH=/
PORT=3400
PUBLIC_ORIGIN=https://quiz.example.com
ALLOWED_ORIGINS=https://quiz.example.com
# Leave ENABLE_DEBUG_ROUTES unset.
```

- `BASE_PATH=/` must be set explicitly. With `NODE_ENV=production` and no
  `BASE_PATH`, the server defaults to `/quizix/`, the Kubernetes ingress path.
- `PUBLIC_ORIGIN` makes the QR code and join links use the public URL. Without
  it, `_getGameUrl` in `services/qr-service.js` falls back to the detected LAN
  IP, which phones outside the LAN cannot reach. Give the origin only (scheme
  and host); `BASE_PATH` is appended.
- `ALLOWED_ORIGINS` lets the Express CORS check and Socket.IO accept the public
  origin. Setting it also drops the built-in cloud-platform wildcard origins
  (Vercel, Netlify, Heroku and others) in `services/cors-validation-service.js`.
  Local-network origins stay allowed.
- `ENABLE_DEBUG_ROUTES` must stay unset: it turns on four unauthenticated
  diagnostic endpoints (see above).

### Client IPs and rate limits

`server.js` sets `app.set('trust proxy', 'loopback')`, and
`middleware/client-ip.js` uses Cloudflare's `CF-Connecting-IP` header only when
the direct TCP peer is loopback or an address listed in `TRUSTED_PROXY_IPS`.
A `cloudflared` running on the same host connects over loopback, so per-client
rate limits work with no extra setting.

If `cloudflared` runs in a container or on another host, its connections come
from a non-loopback address. Set `TRUSTED_PROXY_IPS` to that source address
(comma-separated if there are several). Otherwise every request resolves to the
connector's address and all clients share one rate-limit bucket.

The server binds `0.0.0.0` (`server.js`), so the port is also reachable directly
from the local network, outside the tunnel and outside any Cloudflare policy.
Block it in the host firewall if only tunnel traffic should reach it.

### What was verified

On 2026-11-11, through the tunnel, the page loads and the Socket.IO polling handshake
succeeds. The WebSocket upgrade through the tunnel has not been tested
separately.

### Public exposure items

[`docs/FUTURE.md`](docs/FUTURE.md), section "TODO: Public exposure via
Cloudflare Tunnel", lists the audit items for public exposure. All four are
fixed in code. Two of them depend on telling a direct LAN client from a
proxied one:

- `/api/active-games` returns live PINs only to signed-in users and direct LAN
  clients. Other requests get `{"games": []}` and join by PIN or QR code.
- Deleting, overwriting (`/api/save-quiz` with `filename`) or renaming and
  moving a quiz that has no owner needs a signed-in user or a direct LAN
  client; other requests get `401`.

A direct LAN client is one whose TCP peer is a loopback or private address
and whose request has no `CF-Connecting-IP`, `X-Forwarded-For`, `X-Real-IP`
or `Forwarded` header. cloudflared and the usual reverse proxies add one of
these headers, so their clients count as remote. A proxy that strips all of
them would make every client look local.

Both gates also let any signed-in user through, so they hold only while signup
is closed. Signup is open until the instance has its first account, and after
that only with `ALLOW_SIGNUP=true`. Create your account before exposing a
fresh instance, and leave `ALLOW_SIGNUP` unset.

## 📝 Version History Tracking

To track which version is currently deployed:

```bash
# Check service worker build stamp and the live per-start version
curl -s https://your-domain.com/quizix/sw.js | grep -E "BUILD_STAMP =|INJECTED_VERSION ="

# Check the image reference (the manifest uses the moving :latest tag, so
# this shows a tag, not a git hash)
kubectl describe deployment quizix-pro -n quizix | grep Image
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
kubectl rollout undo deployment/quizix-pro -n quizix

# Verify rollback
kubectl rollout status deployment/quizix-pro -n quizix
```

The manifest pins `ghcr.io/sapetor/quizix-pro:latest` with
`imagePullPolicy: Always`, so a rollback to a revision with the same tag pulls
whatever `:latest` currently points to. Roll back by pushing or referencing an
older image tag instead.

## 📞 Support

- Documentation: `/docs/`
- Issues: GitHub Issues
- Logs: `kubectl logs -n quizix -l app=quizix-pro --tail=100 -f`
