#!/bin/bash
# Kubernetes Cleanup Script for QuizMaster Pro

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE="quizmaster"

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

confirm_cleanup() {
    echo ""
    print_warning "This will delete the following resources in namespace '$NAMESPACE':"
    echo "  - Deployment: quizmaster-pro"
    echo "  - Service: quizmaster-pro"
    echo "  - ConfigMap: quizmaster-config"
    echo ""

    if [ "$DELETE_PVC" = true ]; then
        print_warning "PersistentVolumeClaims will be DELETED (data will be lost!):"
        echo "  - quizmaster-quizzes-pvc"
        echo "  - quizmaster-results-pvc"
        echo "  - quizmaster-uploads-pvc"
    else
        print_info "PersistentVolumeClaims will be PRESERVED (use --delete-data to remove)"
    fi

    echo ""
    read -p "Are you sure you want to continue? (yes/no): " -r
    echo ""

    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        print_info "Cleanup cancelled."
        exit 0
    fi
}

delete_deployment() {
    print_info "Deleting deployment..."

    if kubectl get deployment quizmaster-pro -n "$NAMESPACE" &> /dev/null; then
        kubectl delete deployment quizmaster-pro -n "$NAMESPACE"
        print_info "Deployment deleted ✓"
    else
        print_warning "Deployment not found, skipping"
    fi
}

delete_service() {
    print_info "Deleting service..."

    if kubectl get service quizmaster-pro -n "$NAMESPACE" &> /dev/null; then
        kubectl delete service quizmaster-pro -n "$NAMESPACE"
        print_info "Service deleted ✓"
    else
        print_warning "Service not found, skipping"
    fi
}

delete_configmap() {
    print_info "Deleting ConfigMap..."

    if kubectl get configmap quizmaster-config -n "$NAMESPACE" &> /dev/null; then
        kubectl delete configmap quizmaster-config -n "$NAMESPACE"
        print_info "ConfigMap deleted ✓"
    else
        print_warning "ConfigMap not found, skipping"
    fi
}

delete_pvcs() {
    if [ "$DELETE_PVC" = false ]; then
        print_info "Preserving PersistentVolumeClaims (data retained)"
        return
    fi

    print_warning "Deleting PersistentVolumeClaims (data will be lost)..."

    for pvc in quizmaster-quizzes-pvc quizmaster-results-pvc quizmaster-uploads-pvc; do
        if kubectl get pvc "$pvc" -n "$NAMESPACE" &> /dev/null; then
            kubectl delete pvc "$pvc" -n "$NAMESPACE"
            print_info "PVC $pvc deleted ✓"
        else
            print_warning "PVC $pvc not found, skipping"
        fi
    done
}

delete_namespace() {
    if [ "$DELETE_NAMESPACE" = false ]; then
        print_info "Preserving namespace '$NAMESPACE'"
        return
    fi

    print_warning "Deleting namespace '$NAMESPACE'..."

    if kubectl get namespace "$NAMESPACE" &> /dev/null; then
        kubectl delete namespace "$NAMESPACE"
        print_info "Namespace deleted ✓"
    else
        print_warning "Namespace not found, skipping"
    fi
}

show_remaining() {
    echo ""
    print_info "Checking for remaining resources..."

    if kubectl get namespace "$NAMESPACE" &> /dev/null; then
        echo ""
        echo "Resources in namespace '$NAMESPACE':"
        kubectl get all,pvc,configmap -n "$NAMESPACE" 2>/dev/null || echo "No resources found"
    else
        print_info "Namespace '$NAMESPACE' does not exist"
    fi
}

# Main script
main() {
    echo "======================================"
    echo "QuizMaster Pro - Kubernetes Cleanup"
    echo "======================================"
    echo ""

    # Parse arguments
    DELETE_PVC=false
    DELETE_NAMESPACE=false
    SKIP_CONFIRM=false

    while [[ $# -gt 0 ]]; do
        case $1 in
            --delete-data)
                DELETE_PVC=true
                shift
                ;;
            --delete-namespace)
                DELETE_NAMESPACE=true
                shift
                ;;
            --yes|-y)
                SKIP_CONFIRM=true
                shift
                ;;
            --help)
                echo "Usage: $0 [options]"
                echo ""
                echo "Options:"
                echo "  --delete-data        Delete PersistentVolumeClaims (WARNING: data loss!)"
                echo "  --delete-namespace   Delete the namespace entirely"
                echo "  --yes, -y            Skip confirmation prompt"
                echo "  --help               Show this help message"
                echo ""
                echo "By default, PVCs are preserved to prevent data loss."
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

    # Check if kubectl is installed
    if ! command -v kubectl &> /dev/null; then
        print_error "kubectl is not installed. Please install kubectl first."
        exit 1
    fi

    # Check if namespace exists
    if ! kubectl get namespace "$NAMESPACE" &> /dev/null; then
        print_warning "Namespace '$NAMESPACE' does not exist. Nothing to clean up."
        exit 0
    fi

    # Confirm cleanup
    if [ "$SKIP_CONFIRM" = false ]; then
        confirm_cleanup
    fi

    # Execute cleanup
    delete_deployment
    delete_service
    delete_configmap
    delete_pvcs

    if [ "$DELETE_NAMESPACE" = true ]; then
        delete_namespace
    fi

    # Show remaining resources
    if [ "$DELETE_NAMESPACE" = false ]; then
        show_remaining
    fi

    echo ""
    print_info "Cleanup completed! ✓"

    if [ "$DELETE_PVC" = false ]; then
        echo ""
        print_info "Your data is preserved in PersistentVolumeClaims."
        print_info "To delete data, run: $0 --delete-data"
    fi
}

# Run main function
main "$@"
