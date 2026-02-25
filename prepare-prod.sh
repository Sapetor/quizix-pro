#!/bin/bash

# ============================================================================
# Quizix Pro - Production Build Script
# ============================================================================
# Prepares the application for production deployment by:
# 1. Building optimized CSS bundle
# 2. Cache-busting version numbers
# 3. Updating service worker version
# 4. Staging files for git commit
#
# Usage: ./prepare-prod.sh [--skip-git]
#   --skip-git: Skip git staging (for local testing)
# ============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SKIP_GIT=false

# Parse arguments
for arg in "$@"; do
    case $arg in
        --skip-git)
            SKIP_GIT=true
            shift
            ;;
        *)
            echo -e "${RED}Unknown argument: $arg${NC}"
            echo "Usage: $0 [--skip-git]"
            exit 1
            ;;
    esac
done

# ============================================================================
# Helper Functions
# ============================================================================

print_header() {
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

print_step() {
    echo -e "${BLUE}▶${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# ============================================================================
# Pre-flight Checks
# ============================================================================

print_header "🚀 Quizix Pro Production Build"

print_step "Running pre-flight checks..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "package.json not found. Are you in the project root?"
    exit 1
fi

if [ ! -f "server.js" ]; then
    print_error "server.js not found. Are you in the project root?"
    exit 1
fi

print_success "In correct directory"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    print_warning "node_modules not found. Running npm install..."
    npm install
fi

print_success "Dependencies installed"

# ============================================================================
# Build Production Assets
# ============================================================================

print_header "📦 Building Production Assets"

print_step "Running npm run build:prod..."
echo ""

# Run the production build
if npm run build:prod; then
    echo ""
    print_success "Production build completed successfully"
else
    print_error "Production build failed"
    exit 1
fi

# ============================================================================
# Verify Build Output
# ============================================================================

print_header "✅ Verifying Build Output"

# Check if main.bundle.css was generated
if [ -f "public/css/main.bundle.css" ]; then
    CSS_SIZE=$(du -h public/css/main.bundle.css | cut -f1)
    print_success "CSS bundle generated (${CSS_SIZE})"
else
    print_error "CSS bundle not found at public/css/main.bundle.css"
    exit 1
fi

# Check service worker version
if SW_VERSION=$(grep -o "CACHE_VERSION = '[^']*'" public/sw.js | sed "s/CACHE_VERSION = '//;s/'//"); then
    print_success "Service worker version: ${SW_VERSION}"
else
    print_warning "Could not extract service worker version"
fi

# Check index.html version
if grep -q "main.bundle.css?v=" public/index.html; then
    CSS_VERSION=$(grep -o "main.bundle.css?v=[0-9]*" public/index.html | head -1 | sed 's/main.bundle.css?v=//')
    print_success "CSS cache version in index.html: v${CSS_VERSION}"
else
    print_warning "Could not find CSS version in index.html"
fi

# ============================================================================
# Git Staging (Optional)
# ============================================================================

if [ "$SKIP_GIT" = false ]; then
    print_header "📝 Staging Files for Git Commit"

    # Check if git is available
    if ! command -v git &> /dev/null; then
        print_warning "Git not found, skipping git operations"
    else
        # Check if this is a git repository
        if git rev-parse --git-dir > /dev/null 2>&1; then
            print_step "Staging modified files..."

            # Stage the build artifacts
            git add public/sw.js public/index.html public/css/main.bundle.css 2>/dev/null || true

            # Show what was staged
            if git diff --cached --name-only | grep -q .; then
                echo ""
                echo -e "${BLUE}Staged files:${NC}"
                git diff --cached --name-only | sed 's/^/  /'
                echo ""
                print_success "Files staged for commit"
                echo ""
                echo -e "${YELLOW}Suggested commit message:${NC}"
                if [ -n "$SW_VERSION" ]; then
                    echo "  git commit -m \"build: production ${SW_VERSION}\""
                else
                    echo "  git commit -m \"build: production $(date +%Y%m%d-%H%M)\""
                fi
            else
                print_warning "No changes to stage (files already committed or unchanged)"
            fi
        else
            print_warning "Not a git repository, skipping git operations"
        fi
    fi
else
    print_warning "Git staging skipped (--skip-git flag)"
fi

# ============================================================================
# Summary
# ============================================================================

print_header "🎉 Production Build Complete"

echo -e "${GREEN}Your application is ready for deployment!${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "  1. Test locally: npm start"
echo "  2. Commit changes: git commit -m \"build: production build\""
echo "  3. Push to remote: git push"
echo "  4. Deploy to K8s: kubectl apply -f k8s/deployment.yaml"
echo ""
echo -e "${YELLOW}For more details, see DEPLOYMENT.md${NC}"
echo ""

exit 0
