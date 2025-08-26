#!/bin/bash

# QuizMaster Pro Docker Build Script
# Builds and deploys the containerized application

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="quizix-pro"
CONTAINER_NAME="quizix-pro-app"
COMPOSE_FILE="docker-compose.yml"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        log_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
    log_success "Docker is running"
}

# Check if docker-compose is available
check_compose() {
    if command -v docker-compose > /dev/null 2>&1; then
        COMPOSE_CMD="docker-compose"
    elif docker compose version > /dev/null 2>&1; then
        COMPOSE_CMD="docker compose"
    else
        log_error "docker-compose not found. Please install Docker Compose."
        exit 1
    fi
    log_success "Docker Compose found: $COMPOSE_CMD"
}

# Build the Docker image
build_image() {
    log_info "Building QuizMaster Pro Docker image..."
    
    # Build with docker-compose to ensure network setup
    $COMPOSE_CMD build --no-cache
    
    if [ $? -eq 0 ]; then
        log_success "Docker image built successfully"
    else
        log_error "Failed to build Docker image"
        exit 1
    fi
}

# Deploy the application
deploy_app() {
    log_info "Deploying QuizMaster Pro..."
    
    # Stop existing containers
    $COMPOSE_CMD down
    
    # Start the application
    $COMPOSE_CMD up -d
    
    if [ $? -eq 0 ]; then
        log_success "QuizMaster Pro deployed successfully"
    else
        log_error "Failed to deploy QuizMaster Pro"
        exit 1
    fi
}

# Wait for application to be healthy
wait_for_health() {
    log_info "Waiting for application to be healthy..."
    
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if docker exec $CONTAINER_NAME curl -f http://localhost:3000/api/ping > /dev/null 2>&1; then
            log_success "Application is healthy and responding"
            return 0
        fi
        
        log_info "Attempt $attempt/$max_attempts - waiting for application..."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    log_warning "Application health check timed out"
    return 1
}

# Show application status
show_status() {
    log_info "Application Status:"
    $COMPOSE_CMD ps
    
    echo ""
    log_info "Application logs (last 20 lines):"
    $COMPOSE_CMD logs --tail=20 quizix-pro
    
    echo ""
    log_info "Network information:"
    docker network ls | grep quizmaster
    
    # Get container IP
    CONTAINER_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $CONTAINER_NAME 2>/dev/null)
    if [ ! -z "$CONTAINER_IP" ]; then
        log_info "Container IP: $CONTAINER_IP"
    fi
    
    # Get host IP for local network access
    HOST_IP=$(hostname -I | awk '{print $1}')
    if [ ! -z "$HOST_IP" ]; then
        log_success "QuizMaster Pro is accessible at: http://$HOST_IP:3000"
    fi
}

# Test GitLab connectivity
test_gitlab_connectivity() {
    log_info "Testing GitLab connectivity..."
    
    # Check if GITLAB_URL is set in environment
    if [ -f .env ]; then
        GITLAB_URL=$(grep GITLAB_URL .env | cut -d '=' -f2)
    fi
    
    if [ -z "$GITLAB_URL" ]; then
        log_warning "GITLAB_URL not configured. Skipping connectivity test."
        return 0
    fi
    
    log_info "Testing connection to: $GITLAB_URL"
    
    if docker exec $CONTAINER_NAME curl -f --connect-timeout 5 "$GITLAB_URL" > /dev/null 2>&1; then
        log_success "GitLab connectivity test passed"
    else
        log_warning "GitLab connectivity test failed. Check network configuration."
    fi
}

# Main execution
main() {
    log_info "Starting QuizMaster Pro Docker deployment..."
    
    # Pre-flight checks
    check_docker
    check_compose
    
    # Copy environment template if .env doesn't exist
    if [ ! -f .env ]; then
        log_info "Copying environment template..."
        cp .env.docker .env
        log_warning "Please edit .env file to configure your environment"
    fi
    
    # Build and deploy
    build_image
    deploy_app
    
    # Wait for application to start
    sleep 5
    wait_for_health
    
    # Test GitLab connectivity
    test_gitlab_connectivity
    
    # Show status
    show_status
    
    log_success "QuizMaster Pro deployment completed!"
    echo ""
    echo "Next steps:"
    echo "1. Edit .env file to configure GitLab URL and other settings"
    echo "2. Access the application via your local network"
    echo "3. Check logs with: $COMPOSE_CMD logs -f"
    echo "4. Stop with: $COMPOSE_CMD down"
}

# Handle script arguments
case "${1:-deploy}" in
    "build")
        check_docker
        check_compose
        build_image
        ;;
    "deploy")
        main
        ;;
    "status")
        check_compose
        show_status
        ;;
    "test")
        check_compose
        test_gitlab_connectivity
        ;;
    "help")
        echo "Usage: $0 [build|deploy|status|test|help]"
        echo "  build  - Build Docker image only"
        echo "  deploy - Full build and deployment (default)"
        echo "  status - Show application status"
        echo "  test   - Test GitLab connectivity"
        echo "  help   - Show this help"
        ;;
    *)
        log_error "Unknown command: $1"
        echo "Use '$0 help' for usage information"
        exit 1
        ;;
esac