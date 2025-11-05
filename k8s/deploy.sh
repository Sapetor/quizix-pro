#!/bin/bash
# Kubernetes Deployment Script for QuizMaster Pro

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE="quizmaster"
IMAGE_NAME="quizmaster-pro"
IMAGE_TAG="latest"
REGISTRY=""  # Set your registry here, e.g., "docker.io/username"

# Functions
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    print_info "Checking prerequisites..."

    # Check if kubectl is installed
    if ! command -v kubectl &> /dev/null; then
        print_error "kubectl is not installed. Please install kubectl first."
        exit 1
    fi

    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi

    # Check if kubectl can connect to cluster
    if ! kubectl cluster-info &> /dev/null; then
        print_error "Cannot connect to Kubernetes cluster. Please check your kubeconfig."
        exit 1
    fi

    print_info "Prerequisites check passed ✓"
}

build_image() {
    print_info "Building Docker image..."

    cd "$(dirname "$0")/.."

    if [ -n "$REGISTRY" ]; then
        FULL_IMAGE="${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}"
    else
        FULL_IMAGE="${IMAGE_NAME}:${IMAGE_TAG}"
    fi

    docker build -t "$FULL_IMAGE" .

    print_info "Docker image built successfully: $FULL_IMAGE ✓"
}

push_image() {
    if [ -z "$REGISTRY" ]; then
        print_warning "No registry configured. Skipping push. Update REGISTRY variable if needed."
        return
    fi

    print_info "Pushing image to registry..."

    FULL_IMAGE="${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}"
    docker push "$FULL_IMAGE"

    print_info "Image pushed successfully ✓"
}

deploy_kubernetes() {
    print_info "Deploying to Kubernetes..."

    cd "$(dirname "$0")"

    # Create namespace
    print_info "Creating namespace..."
    kubectl apply -f namespace.yaml

    # Apply ConfigMap
    print_info "Applying ConfigMap..."
    kubectl apply -f configmap.yaml

    # Apply PVCs
    print_info "Creating Persistent Volume Claims..."
    kubectl apply -f pvc.yaml

    # Wait for PVCs to be bound
    print_info "Waiting for PVCs to be bound..."
    kubectl wait --for=jsonpath='{.status.phase}'=Bound pvc/quizmaster-quizzes-pvc -n "$NAMESPACE" --timeout=60s || print_warning "PVC not bound yet"
    kubectl wait --for=jsonpath='{.status.phase}'=Bound pvc/quizmaster-results-pvc -n "$NAMESPACE" --timeout=60s || print_warning "PVC not bound yet"
    kubectl wait --for=jsonpath='{.status.phase}'=Bound pvc/quizmaster-uploads-pvc -n "$NAMESPACE" --timeout=60s || print_warning "PVC not bound yet"

    # Apply Deployment
    print_info "Deploying application..."
    kubectl apply -f deployment.yaml

    # Apply Service
    print_info "Creating Service..."
    kubectl apply -f service.yaml

    print_info "Deployment completed ✓"
}

wait_for_ready() {
    print_info "Waiting for deployment to be ready..."

    kubectl rollout status deployment/quizmaster-pro -n "$NAMESPACE" --timeout=300s

    print_info "Deployment is ready ✓"
}

show_status() {
    print_info "Current deployment status:"
    echo ""

    echo "Pods:"
    kubectl get pods -n "$NAMESPACE" -l app=quizmaster-pro
    echo ""

    echo "Services:"
    kubectl get svc -n "$NAMESPACE"
    echo ""

    echo "PVCs:"
    kubectl get pvc -n "$NAMESPACE"
    echo ""

    echo "Logs (last 10 lines):"
    kubectl logs -n "$NAMESPACE" -l app=quizmaster-pro --tail=10 || print_warning "No logs available yet"
}

show_access_info() {
    print_info "Access information:"
    echo ""
    echo "To access the application locally, run:"
    echo "  kubectl port-forward -n $NAMESPACE svc/quizmaster-pro 3000:3000"
    echo ""
    echo "Then visit: http://localhost:3000"
    echo ""
    echo "To view logs:"
    echo "  kubectl logs -n $NAMESPACE -l app=quizmaster-pro -f"
    echo ""
}

# Main script
main() {
    echo "========================================"
    echo "QuizMaster Pro - Kubernetes Deployment"
    echo "========================================"
    echo ""

    # Parse arguments
    BUILD_IMAGE=true
    PUSH_IMAGE=false
    DEPLOY=true

    while [[ $# -gt 0 ]]; do
        case $1 in
            --no-build)
                BUILD_IMAGE=false
                shift
                ;;
            --push)
                PUSH_IMAGE=true
                shift
                ;;
            --registry)
                REGISTRY="$2"
                shift 2
                ;;
            --tag)
                IMAGE_TAG="$2"
                shift 2
                ;;
            --help)
                echo "Usage: $0 [options]"
                echo ""
                echo "Options:"
                echo "  --no-build         Skip building Docker image"
                echo "  --push             Push image to registry"
                echo "  --registry REPO    Docker registry (e.g., docker.io/username)"
                echo "  --tag TAG          Image tag (default: latest)"
                echo "  --help             Show this help message"
                echo ""
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                echo "Use --help for usage information"
                exit 1
                ;;
        esac
    done

    # Execute steps
    check_prerequisites

    if [ "$BUILD_IMAGE" = true ]; then
        build_image
    fi

    if [ "$PUSH_IMAGE" = true ]; then
        push_image
    fi

    if [ "$DEPLOY" = true ]; then
        deploy_kubernetes
        wait_for_ready
        show_status
        show_access_info
    fi

    print_info "All done! 🚀"
}

# Run main function
main "$@"
