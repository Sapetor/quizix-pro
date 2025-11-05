#!/bin/bash
# Simple deployment script for QuizMaster Pro
# Matches your cluster's deployment pattern

set -e

echo "========================================="
echo "QuizMaster Pro - Cluster Deployment"
echo "========================================="
echo ""

# Check prerequisites
if ! command -v kubectl &> /dev/null; then
    echo "Error: kubectl not found"
    exit 1
fi

if ! kubectl cluster-info &> /dev/null; then
    echo "Error: Cannot connect to cluster"
    exit 1
fi

echo "✓ kubectl connected to cluster"
echo ""

# Build and push image
echo "Step 1: Building Docker image..."
cd "$(dirname "$0")/.."
docker build -t quizmaster-pro:latest .
echo "✓ Image built"
echo ""

# Optional: Tag and push to registry
read -p "Push to Docker registry? (y/n): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    read -p "Enter registry/image name (e.g., yourusername/quizmaster-pro): " REGISTRY_IMAGE
    docker tag quizmaster-pro:latest "$REGISTRY_IMAGE:latest"
    docker push "$REGISTRY_IMAGE:latest"
    echo "✓ Image pushed to $REGISTRY_IMAGE:latest"
    echo ""
    echo "⚠️  Update k8s/01-quizmaster-pro.yaml with image: $REGISTRY_IMAGE:latest"
    echo ""
fi

# Deploy to cluster
echo "Step 2: Deploying to Kubernetes..."
cd k8s

kubectl apply -f 01-quizmaster-pro.yaml
echo "✓ Resources created"
echo ""

# Wait for rollout
echo "Step 3: Waiting for deployment..."
kubectl rollout status deployment/quizmaster-pro -n quizmaster --timeout=300s
echo "✓ Deployment ready"
echo ""

# Show status
echo "========================================="
echo "Deployment Status:"
echo "========================================="
kubectl get all -n quizmaster
echo ""
echo "PVCs:"
kubectl get pvc -n quizmaster
echo ""

# Access instructions
echo "========================================="
echo "Access Instructions:"
echo "========================================="
echo "Port forward to access locally:"
echo "  kubectl port-forward -n quizmaster svc/quizmaster-pro 3000:3000"
echo ""
echo "View logs:"
echo "  kubectl logs -n quizmaster -l app=quizmaster-pro -f"
echo ""
echo "Health check:"
echo "  kubectl port-forward -n quizmaster svc/quizmaster-pro 3000:3000"
echo "  Then visit: http://localhost:3000/health"
echo ""
