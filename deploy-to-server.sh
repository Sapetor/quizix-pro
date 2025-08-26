#!/bin/bash

# QuizMaster Pro Server Deployment Script
# Deploys the containerized application to the GitLab server

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration - EDIT THESE VALUES
GITLAB_SERVER="10.80.21.11"
GITLAB_USER="your-username"  # Replace with your SSH username
PROJECT_DIR="/opt/quizix-pro"

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

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if SSH is available
    if ! command -v ssh > /dev/null 2>&1; then
        log_error "SSH not found. Please install OpenSSH client."
        exit 1
    fi
    
    # Check if scp is available
    if ! command -v scp > /dev/null 2>&1; then
        log_error "SCP not found. Please install OpenSSH client."
        exit 1
    fi
    
    # Test SSH connection
    if ! ssh -o ConnectTimeout=5 -o BatchMode=yes "$GITLAB_USER@$GITLAB_SERVER" exit 2>/dev/null; then
        log_warning "Cannot connect to $GITLAB_SERVER with SSH key authentication."
        log_info "You may need to:"
        log_info "1. Set up SSH key authentication"
        log_info "2. Update GITLAB_USER in this script"
        log_info "3. Ensure the server allows SSH connections"
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
    
    log_success "Prerequisites checked"
}

# Build Docker image locally
build_local() {
    log_info "Building Docker image locally..."
    
    if ! docker build -t quizix-pro:latest .; then
        log_error "Failed to build Docker image locally"
        exit 1
    fi
    
    log_success "Docker image built successfully"
}

# Deploy via file copy method
deploy_copy_files() {
    log_info "Deploying by copying project files..."
    
    # Create project directory on server
    ssh "$GITLAB_USER@$GITLAB_SERVER" "sudo mkdir -p $PROJECT_DIR && sudo chown $USER:$USER $PROJECT_DIR"
    
    # Copy project files
    log_info "Copying project files to server..."
    scp -r . "$GITLAB_USER@$GITLAB_SERVER:$PROJECT_DIR/"
    
    # Build and run on server
    log_info "Building and starting container on server..."
    ssh "$GITLAB_USER@$GITLAB_SERVER" "
        cd $PROJECT_DIR
        
        # Stop existing container if running
        docker stop quizix-pro-app 2>/dev/null || true
        docker rm quizix-pro-app 2>/dev/null || true
        
        # Build and run
        docker-compose -f docker-compose.server.yml build
        docker-compose -f docker-compose.server.yml up -d
        
        # Show status
        docker ps | grep quizix-pro
    "
    
    log_success "Deployment completed via file copy"
}

# Deploy via Docker image export/import
deploy_image_transfer() {
    log_info "Deploying by transferring Docker image..."
    
    # Build locally
    build_local
    
    # Save image to file
    log_info "Saving Docker image to file..."
    docker save quizix-pro:latest > /tmp/quizix-pro.tar
    
    # Copy image to server
    log_info "Copying image to server..."
    scp /tmp/quizix-pro.tar "$GITLAB_USER@$GITLAB_SERVER:/tmp/"
    
    # Load and run on server
    log_info "Loading and starting container on server..."
    ssh "$GITLAB_USER@$GITLAB_SERVER" "
        # Load image
        docker load < /tmp/quizix-pro.tar
        
        # Stop existing container
        docker stop quizix-pro-app 2>/dev/null || true
        docker rm quizix-pro-app 2>/dev/null || true
        
        # Run container
        docker run -d \\
            --name quizix-pro-app \\
            --restart unless-stopped \\
            -p 3000:3000 \\
            -e NODE_ENV=production \\
            -e DEBUG_ENABLED=false \\
            -e GITLAB_URL=https://localhost:8080 \\
            -v \$HOME/quizmaster-data/results:/app/results \\
            -v \$HOME/quizmaster-data/uploads:/app/uploads \\
            quizix-pro:latest
        
        # Create data directories
        mkdir -p \$HOME/quizmaster-data/{results,uploads}
        
        # Show status
        docker ps | grep quizix-pro
        
        # Clean up
        rm /tmp/quizix-pro.tar
    "
    
    # Clean up local temp file
    rm /tmp/quizix-pro.tar
    
    log_success "Deployment completed via image transfer"
}

# Check deployment status
check_deployment() {
    log_info "Checking deployment status..."
    
    # Check if container is running
    if ssh "$GITLAB_USER@$GITLAB_SERVER" "docker ps | grep quizix-pro-app" > /dev/null; then
        log_success "Container is running on server"
    else
        log_error "Container is not running on server"
        return 1
    fi
    
    # Test application
    log_info "Testing application..."
    if ssh "$GITLAB_USER@$GITLAB_SERVER" "curl -f http://localhost:3000/api/ping" > /dev/null 2>&1; then
        log_success "Application is responding"
    else
        log_warning "Application health check failed"
    fi
    
    # Show access information
    log_success "QuizMaster Pro is accessible at: http://$GITLAB_SERVER:3000"
    log_info "Container logs: ssh $GITLAB_USER@$GITLAB_SERVER 'docker logs quizix-pro-app'"
}

# Show usage
show_usage() {
    echo "Usage: $0 [method]"
    echo "Methods:"
    echo "  copy     - Copy project files and build on server (default)"
    echo "  image    - Build locally and transfer Docker image"
    echo "  status   - Check deployment status"
    echo "  help     - Show this help"
    echo ""
    echo "Before running, edit this script to set:"
    echo "  GITLAB_USER (your SSH username for the server)"
}

# Update configuration
update_config() {
    log_warning "Please edit this script file and update these variables:"
    echo "  GITLAB_USER=\"$GITLAB_USER\"  # Your SSH username"
    echo ""
    echo "You may also need to set up SSH key authentication:"
    echo "  ssh-copy-id $GITLAB_USER@$GITLAB_SERVER"
}

# Main execution
case "${1:-copy}" in
    "copy")
        check_prerequisites
        deploy_copy_files
        check_deployment
        ;;
    "image")
        check_prerequisites
        deploy_image_transfer
        check_deployment
        ;;
    "status")
        check_deployment
        ;;
    "config")
        update_config
        ;;
    "help")
        show_usage
        ;;
    *)
        log_error "Unknown method: $1"
        show_usage
        exit 1
        ;;
esac