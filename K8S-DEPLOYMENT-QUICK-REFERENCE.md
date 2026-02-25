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
- Bottom-right corner shows current version
- Format: `v20260123-c37241d` (date + git hash)
- Visible on main menu to verify deployments

## Cache Strategy

| File | Cached? | Duration | Auto-Update? |
|------|---------|----------|--------------|
| index.html | ❌ No | 0 | Always fresh |
| sw.js | ❌ No | 0 | Always fresh |
| CSS/JS | ✅ Yes | 24-48h | Via version param |
| Images | ✅ Yes | 1-2h | Via ETag |

## Troubleshooting

### ❌ Users see old version after deployment

**Cause**: Forgot to run `npm run build:prod`

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
grep CACHE_VERSION public/sw.js
```

Should show: `v20260123-xxxxx` (recent date)

### ❌ Hard refresh still required

**Verify cache headers**:
```bash
curl -I https://your-domain.com/ | grep Cache-Control
```

Should show: `Cache-Control: no-cache, no-store, must-revalidate`

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
   - Look at bottom-right corner
   - Should show: `v20260123-xxxxxx`

3. **Test cache behavior**:
   - Open DevTools → Network
   - Refresh page
   - Check `index.html` → `no-cache, no-store`
   - Check `sw.js` → `no-cache`

## K8s-Specific Notes

### Ingress Path
If using path-based routing (e.g., `/quizmaster/`):

**.env file:**
```bash
BASE_PATH=/quizmaster/
```

### Health Checks
```bash
# Liveness probe
curl https://your-domain.com/health

# Readiness probe
curl https://your-domain.com/ready
```

### View Logs
```bash
kubectl logs -l app=quizix-pro --tail=50 -f
```

### Rollback
```bash
kubectl rollout undo deployment/quizix-pro
```

## Success Indicators

✅ Build completes without errors
✅ Version number changes in sw.js
✅ Asset versions increment in index.html
✅ Version displays in UI bottom-right
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
grep CACHE_VERSION public/sw.js

# Test locally
npm start

# View K8s pods
kubectl get pods -l app=quizix-pro

# Watch deployment
kubectl rollout status deployment/quizix-pro
```

---

**Need help?** See `DEPLOYMENT.md` for detailed documentation.
