#!/bin/bash

# =============================================================================
# Self-Service Catalog Platform - Stop Script
# =============================================================================
# Stops the backend and frontend servers.
# Port-forwards and DNS entries are preserved for quick restart.
# For full cleanup, use cleanup.sh instead.
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

log_header() {
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# =============================================================================
# Stop Services
# =============================================================================

stop_backend() {
    log_header "Stopping Backend Server"
    
    # Kill by PID file
    if [[ -f "$SCRIPT_DIR/.backend.pid" ]]; then
        local pid=$(cat "$SCRIPT_DIR/.backend.pid")
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
            log_info "Stopped backend (PID: $pid)"
        fi
        rm -f "$SCRIPT_DIR/.backend.pid"
    fi
    
    # Also kill any uvicorn processes on port 8000
    local pids=$(lsof -ti :8000 2>/dev/null || true)
    if [[ -n "$pids" ]]; then
        echo "$pids" | xargs kill 2>/dev/null || true
        log_info "Killed processes on port 8000"
    fi
    
    log_success "Backend stopped"
}

stop_frontend() {
    log_header "Stopping Frontend Server"
    
    # Kill by PID file
    if [[ -f "$SCRIPT_DIR/.frontend.pid" ]]; then
        local pid=$(cat "$SCRIPT_DIR/.frontend.pid")
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
            log_info "Stopped frontend (PID: $pid)"
        fi
        rm -f "$SCRIPT_DIR/.frontend.pid"
    fi
    
    # Also kill any node processes on port 3000
    local pids=$(lsof -ti :3000 2>/dev/null || true)
    if [[ -n "$pids" ]]; then
        echo "$pids" | xargs kill 2>/dev/null || true
        log_info "Killed processes on port 3000"
    fi
    
    log_success "Frontend stopped"
}

cleanup_logs() {
    log_header "Cleaning Up Log Files"
    
    rm -f "$SCRIPT_DIR/.backend.log"
    rm -f "$SCRIPT_DIR/.frontend.log"
    
    log_success "Log files cleaned up"
}

# =============================================================================
# Main
# =============================================================================

main() {
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║     🛑 Self-Service Catalog Platform - Stopping...               ║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    
    stop_backend
    stop_frontend
    cleanup_logs
    
    log_header "Shutdown Complete!"
    
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                    ✅ Platform Stopped                            ║${NC}"
    echo -e "${GREEN}╠═══════════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║  To start again:     ${NC}./start.sh${GREEN}                                  ║${NC}"
    echo -e "${GREEN}║  For full cleanup:   ${NC}./cleanup.sh${GREEN}                                ║${NC}"
    echo -e "${GREEN}╠═══════════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║  Note: Port-forwards and DNS entries are preserved.              ║${NC}"
    echo -e "${GREEN}║        Running workspaces continue in Kubernetes.                ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

main "$@"
