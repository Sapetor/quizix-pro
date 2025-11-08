# Kubernetes Deployment Guide

This guide explains how to configure the BASE_PATH for Kubernetes deployments with path-based routing.

## Problem

When deploying to Kubernetes with path-based routing (e.g., `/quizmaster/`), static files (JS, CSS, images) return 404 errors because they're not served at the correct path.

## Solution

The application now automatically detects the base path from the `BASE_PATH` environment variable.

## Configuration

### 1. Set BASE_PATH in Your Kubernetes Deployment

Add the `BASE_PATH` environment variable to your deployment manifest:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: quizix-pro
spec:
  template:
    spec:
      containers:
      - name: quizix-pro
        image: your-image:tag
        env:
        - name: BASE_PATH
          value: "/quizmaster/"    # Must include trailing slash
        - name: NODE_ENV
          value: "production"
```

**Important:** The `BASE_PATH` value must:
- Start with `/`
- End with `/`
- Match your ingress path configuration

### 2. Verify Configuration

After deployment, check if the environment variable is set correctly:

```bash
# Check pod environment variables
kubectl get pods -l app=quizix-pro -o jsonpath='{.items[0].spec.containers[0].env[?(@.name=="BASE_PATH")].value}'

# Check server logs for confirmation
kubectl logs -l app=quizix-pro | grep "Base path configured"

# Expected output:
# ℹ️ [SERVER] Base path configured: /quizmaster/
# ℹ️ [SERVER] Static files mounted at: /quizmaster/
```

### 3. Test the Configuration

Access the diagnostic endpoint to verify settings:

```bash
curl https://your-domain/quizmaster/debug/config
```

Expected response:
```json
{
  "BASE_PATH": "/quizmaster/",
  "BASE_PATH_length": 13,
  "BASE_PATH_equals_slash": false,
  "BASE_PATH_not_equals_slash": true,
  "staticMountedAt": "/quizmaster/",
  "NODE_ENV": "production",
  "isProduction": true
}
```

### 4. Verify Static Files Are Served Correctly

Test that static files are accessible at the correct paths:

```bash
# Test JavaScript file
curl -I https://your-domain/quizmaster/js/main.js
# Should return: HTTP/1.1 200 OK

# Test image file
curl -I https://your-domain/quizmaster/images/carrousel-main-menu-mobile-1.png
# Should return: HTTP/1.1 200 OK

# Test CSS file
curl -I https://your-domain/quizmaster/css/main.bundle.css
# Should return: HTTP/1.1 200 OK
```

## Troubleshooting

### Issue: Files still return 404

**Check 1:** Verify BASE_PATH is set in the deployment
```bash
kubectl describe pod <pod-name> | grep BASE_PATH
```

**Check 2:** Check the pod logs for the base path configuration
```bash
kubectl logs <pod-name> | grep "Base path"
```

**Check 3:** Verify your Ingress routing
```bash
kubectl get ingress -o yaml
```

Make sure your Ingress path matches the BASE_PATH:
```yaml
spec:
  rules:
  - http:
      paths:
      - path: /quizmaster
        pathType: Prefix
        backend:
          service:
            name: quizix-pro
            port:
              number: 3000
```

**Check 4:** Look at the browser Network tab

Open DevTools → Network tab and check the actual URLs being requested:
- ✅ Correct: `https://your-domain/quizmaster/js/main.js`
- ❌ Wrong: `https://your-domain/js/main.js` (missing base path)

If the URLs are missing the base path, the `<base>` tag might not be set correctly in the HTML.

**Check 5:** View page source

View the HTML source and verify the `<base>` tag:
```html
<base href="/quizmaster/">  <!-- ✅ Correct -->
<base href="/">            <!-- ❌ Wrong for K8s -->
```

### Issue: BASE_PATH not being detected

If the environment variable is set but not being used:

1. Restart the deployment to ensure new env vars are loaded:
```bash
kubectl rollout restart deployment quizix-pro
```

2. Check if there are any errors in the logs:
```bash
kubectl logs -l app=quizix-pro --tail=50
```

### Issue: Some files load, others don't

If only some static files return 404, check the file paths in your application. The application uses the `<base>` tag, so all relative URLs should work automatically.

Check for:
- Absolute URLs starting with `/` that don't use the base path
- Hardcoded domain names
- External resources that need CORS configuration

## Local Development

For local development, either:

1. Don't set BASE_PATH (defaults to `/`):
```bash
npm start
```

2. Or create a `.env` file:
```bash
BASE_PATH=/
NODE_ENV=development
```

## Example: Complete Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: quizix-pro
spec:
  replicas: 1
  selector:
    matchLabels:
      app: quizix-pro
  template:
    metadata:
      labels:
        app: quizix-pro
    spec:
      containers:
      - name: quizix-pro
        image: your-registry/quizix-pro:latest
        ports:
        - containerPort: 3000
        env:
        - name: BASE_PATH
          value: "/quizmaster/"
        - name: NODE_ENV
          value: "production"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: quizix-pro
spec:
  selector:
    app: quizix-pro
  ports:
  - port: 3000
    targetPort: 3000
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: quizix-pro
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /$2
spec:
  rules:
  - http:
      paths:
      - path: /quizmaster(/|$)(.*)
        pathType: ImplementationSpecific
        backend:
          service:
            name: quizix-pro
            port:
              number: 3000
```

## Support

If you continue to have issues:

1. Check the server logs: `kubectl logs -l app=quizix-pro`
2. Access the diagnostic endpoint: `curl https://your-domain/quizmaster/debug/config`
3. Verify your Ingress configuration matches the BASE_PATH
4. Open a GitHub issue with the diagnostic output
