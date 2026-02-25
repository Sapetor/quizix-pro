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
kubectl apply -f k8s/deployment.yaml
kubectl rollout status deployment/quizix-pro
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

## 🔄 How Auto-Update Works

### Service Worker Strategy

1. **index.html** - Never cached (always fresh from server)
2. **sw.js** - Always revalidated with server
3. **Static assets** - Cached with version-specific names

### Update Flow

```
User visits site
    ↓
Browser fetches index.html (no cache)
    ↓
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
BASE_PATH=/quizmaster/  # Or your K8s ingress path
PORT=3000
```

### Optional (AI Features)

```bash
CLAUDE_API_KEY=your-key-here
GEMINI_API_KEY=your-key-here
HUGGINGFACE_API_KEY=your-key-here
```

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
