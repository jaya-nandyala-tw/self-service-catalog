#!/bin/bash

# =============================================================================
# Self-Service Catalog Platform - Start Script
# =============================================================================
# Starts the backend and frontend servers.
# Run setup.sh first if this is your first time.
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/catalog-backend"
FRONTEND_DIR="$SCRIPT_DIR/catalog-ui"

# =============================================================================
# Helper Functions
# =============================================================================

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

log_header() {
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# =============================================================================
# Quick Checks
# =============================================================================

check_setup() {
    log_header "Checking Setup"
    
    local issues=()
    
    # Check if venv exists
    if [[ ! -d "$BACKEND_DIR/venv" ]]; then
        issues+=("Python venv not found - run ./setup.sh first")
    fi
    
    # Check if node_modules exists
    if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
        issues+=("Node modules not found - run ./setup.sh first")
    fi
    
    # Check if PostgreSQL is running
    if ! docker ps --format '{{.Names}}' | grep -q "catalog-postgres"; then
        issues+=("PostgreSQL not running - run ./setup.sh first")
    fi
    
    # Check if minikube is running
    if ! minikube status >/dev/null 2>&1; then
        issues+=("Minikube not running - run ./setup.sh or 'minikube start'")
    fi
    
    if [[ ${#issues[@]} -gt 0 ]]; then
        log_error "Setup issues found:"
        for issue in "${issues[@]}"; do
            echo -e "  ${RED}✗${NC} $issue"
        done
        echo ""
        log_info "Run ${CYAN}./setup.sh${NC} to complete the setup."
        exit 1
    fi
    
    log_success "Setup verified"
}

# =============================================================================
# Service Management
# =============================================================================

run_migrations() {
    log_info "Running database migrations..."
    source "$BACKEND_DIR/venv/bin/activate"
    cd "$BACKEND_DIR"
    alembic upgrade head >/dev/null 2>&1 || log_warning "Migration check completed"
    cd "$SCRIPT_DIR"
    deactivate
}

start_backend() {
    log_header "Starting Catalog Backend"
    
    # Run migrations first
    run_migrations
    
    cd "$BACKEND_DIR"
    
    # Check if backend is already running
    if lsof -i :8000 >/dev/null 2>&1; then
        log_success "Backend already running on port 8000"
    else
        log_info "Starting backend server..."
        source venv/bin/activate
        export DEBUG=true
        nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload > "$SCRIPT_DIR/.backend.log" 2>&1 &
        echo $! > "$SCRIPT_DIR/.backend.pid"
        deactivate
        sleep 2
        log_success "Backend started on http://localhost:8000"
    fi
    
    cd "$SCRIPT_DIR"
}

start_frontend() {
    log_header "Starting Catalog UI"
    
    cd "$FRONTEND_DIR"
    
    # Check if frontend is already running
    if lsof -i :3000 >/dev/null 2>&1; then
        log_success "Frontend already running on port 3000"
    else
        log_info "Starting frontend dev server..."
        nohup npm run dev > "$SCRIPT_DIR/.frontend.log" 2>&1 &
        echo $! > "$SCRIPT_DIR/.frontend.pid"
        sleep 3
        log_success "Frontend started on http://localhost:3000"
    fi
    
    cd "$SCRIPT_DIR"
}

check_registry() {
    log_header "Checking Docker Registry"
    
    if docker ps --format '{{.Names}}' | grep -q "^registry$"; then
        log_success "Docker registry running on port 5000"
    else
        log_info "Starting Docker registry..."
        docker run -d \
            --name registry \
            -p 5000:5000 \
            --restart unless-stopped \
            registry:2 >/dev/null 2>&1 || true
        log_success "Docker registry started"
    fi
}

# =============================================================================
# Main
# =============================================================================

main() {
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║     🚀 Self-Service Catalog Platform - Starting...               ║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    
    check_setup
    check_registry
    start_backend
    start_frontend
    
    log_header "Startup Complete!"
    
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                    🎉 Platform is Ready!                          ║${NC}"
    echo -e "${GREEN}╠═══════════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║  Catalog UI:      ${NC}http://localhost:3000${GREEN}                           ║${NC}"
    echo -e "${GREEN}║  Backend API:     ${NC}http://localhost:8000${GREEN}                           ║${NC}"
    echo -e "${GREEN}║  API Docs:        ${NC}http://localhost:8000/docs${GREEN}                      ║${NC}"
    echo -e "${GREEN}╠═══════════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║  To stop:         ${NC}./stop.sh${GREEN}                                       ║${NC}"
    echo -e "${GREEN}║  View logs:       ${NC}tail -f .backend.log${GREEN}                            ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

main "$@"
