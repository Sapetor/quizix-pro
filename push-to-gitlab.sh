#!/bin/bash

# Manual GitLab Container Registry Upload Script
# Use this if GitLab has container registry but no CI/CD

set -e

# Configuration
GITLAB_REGISTRY="registry.k8s"
USERNAME="jane.doe"  # Your GitLab username
PROJECT_NAME="quizix-pro"  # Your GitLab project name
IMAGE_NAME="$GITLAB_REGISTRY/$USERNAME/$PROJECT_NAME:latest"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    log_error "Docker not found. Please install Docker first."
    exit 1
fi

log_info "GitLab Container Registry Deployment"
echo "Registry: $GITLAB_REGISTRY"
echo "Image: $IMAGE_NAME"
echo ""

# Step 1: Build the image
log_info "Building Docker image..."
if docker build -t $IMAGE_NAME .; then
    log_success "Image built successfully"
else
    log_error "Failed to build image"
    exit 1
fi

# Step 2: Login to GitLab registry
log_info "Please login to GitLab container registry..."
echo "Use your GitLab username and password (or personal access token)"
if docker login $GITLAB_REGISTRY; then
    log_success "Logged in to GitLab registry"
else
    log_error "Failed to login to GitLab registry"
    exit 1
fi

# Step 3: Push the image
log_info "Pushing image to GitLab registry..."
if docker push $IMAGE_NAME; then
    log_success "Image pushed successfully"
else
    log_error "Failed to push image"
    exit 1
fi

log_success "Container uploaded to GitLab registry!"
echo ""
echo "Next steps:"
echo "1. Ask your GitLab admin to pull and run the container:"
echo "   docker pull $IMAGE_NAME"
echo "   docker run -d -p 3000:3000 --name quizix-pro $IMAGE_NAME"
echo ""
echo "2. Or check if GitLab has deployment features in the web interface"