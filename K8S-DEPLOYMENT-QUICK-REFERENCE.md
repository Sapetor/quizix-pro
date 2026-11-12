# 🚀 K8s Deployment Quick Reference

## Before EVERY Deployment

### 1. Run Build Command
```bash
npm run build:prod
```

**This is CRITICAL!** It:
- ✅ Builds CSS bundle
- ✅ Updates service worker version
- ✅ Updates asset version numbers
- ✅ Ensures users get latest code

The Docker build stage also runs `npm run build:prod`, and the server stamps
`index.html` and `sw.js` with a new `ASSET_VERSION` on every start, so a pod
restart alone invalidates client caches. See `DEPLOYMENT.md`.

### 2. Verify Build Output
```
✓ sw.js: v20260122-xxx → v20260123-yyy
✓ index.html: Updated N asset references to v=13
```

### 3. Commit & Deploy
```bash
git add public/sw.js public/index.html public/css/main.bundle.css
git commit -m "build: production build v20260123-yyy"
git push
```

## How Auto-Update Works

### User Flow
1. User visits site
2. Browser fetches **index.html** (never cached)
3. Loads **sw.js** (always revalidated)
4. Service worker detects new `CACHE_VERSION`
5. Page **automatically reloads**
6. User sees **latest version** ✨

### Version Display
- The landing page footer shows the current version (`#app-version`)
- Value: the server's `ASSET_VERSION`, a base-36 timestamp generated at each
  server start, not a date + git hash; `dev` if `index.html` was served
  without the server's substitution
- Changes on every pod restart, so it confirms a restart, not a specific build

## Cache Strategy

| File | Cached? | Duration | Auto-Update? |
|------|---------|----------|--------------|
| index.html | ❌ No | 0 | Always fresh |
| sw.js | ❌ No | 0 | Always fresh |
| CSS/JS | HTTPS: revalidate; HTTP: `no-store` | 0 | Via version param + ETag |
| Images | HTTPS only | 1h desktop, 2h mobile | Via ETag |

## Troubleshooting

### ❌ Users see old version after deployment

**Cause**: Image not rebuilt and pushed, or pod not restarted. The deployment
uses `ghcr.io/sapetor/quizix-pro:latest` with `imagePullPolicy: Always`, so a
new build reaches the cluster only through build, push and
`kubectl rollout restart deployment/quizix-pro -n quizix`
(see `k8s/TROUBLESHOOTING.md`). A stale CSS bundle in git also shows up here.

**Fix**:
```bash
npm run build:prod
git add public/sw.js public/index.html public/css/main.bundle.css
git commit -m "build: cache bust"
git push
# Redeploy to K8s
```

### ❌ Version not updating in UI

**Check current version**:
```bash
# Build-time fallback stamp
grep "BUILD_STAMP =" public/sw.js

# Live per-start version served by the pod
curl -s https://your-domain.com/quizix/sw.js | grep "INJECTED_VERSION ="
```

The first should show `v20260123-xxxxx` (recent date).

### ❌ Hard refresh still required

**Verify cache headers**:
```bash
curl -I https://your-domain.com/quizix/ | grep Cache-Control
```

Should show: `Cache-Control: no-store, no-cache, must-revalidate, private`

## Files Changed in This Update

1. **server.js** - index.html never cached
2. **public/index.html** - Version display added
3. **public/css/layout.css** - Version styling
4. **DEPLOYMENT.md** - Full deployment guide

## Testing Before Deployment

1. **Local test**:
   ```bash
   npm run build:prod
   npm start
   ```

2. **Check version display**:
   - Open http://localhost:3000
   - Look at the landing page footer
   - Should show the server's per-start `ASSET_VERSION`

3. **Test cache behavior**:
   - Open DevTools → Network
   - Refresh page
   - Check `index.html` → `no-store, no-cache, must-revalidate, private`
   - Check `sw.js` → `no-store, no-cache, must-revalidate, private`

## K8s-Specific Notes

### Ingress Path
If using path-based routing (e.g., `/quizix/`), set it in the `quizix-config`
ConfigMap in `k8s/01-quizix-pro.yaml` (the pod does not read a `.env` file):

```yaml
BASE_PATH: "/quizix/"
```

### Health Checks
```bash
# Liveness probe (the ingress strips the /quizix prefix)
curl https://your-domain.com/quizix/health

# Readiness probe
curl https://your-domain.com/quizix/ready
```

### View Logs
```bash
kubectl logs -n quizix -l app=quizix-pro --tail=50 -f
```

### Rollback
```bash
kubectl rollout undo deployment/quizix-pro -n quizix
```

## Success Indicators

✅ Build completes without errors
✅ Version number changes in sw.js
✅ Asset versions increment in index.html
✅ Version displays in the landing page footer
✅ No hard refresh needed after deployment
✅ Service worker auto-reloads on version change

## Quick Commands

```bash
# Full build + deploy
npm run build:prod && \
git add public/ && \
git commit -m "build: production" && \
git push

# Check version
grep "BUILD_STAMP =" public/sw.js

# Test locally
npm start

# View K8s pods
kubectl get pods -n quizix -l app=quizix-pro

# Watch deployment
kubectl rollout status deployment/quizix-pro -n quizix
```

---

**Need help?** See `DEPLOYMENT.md` for detailed documentation.
