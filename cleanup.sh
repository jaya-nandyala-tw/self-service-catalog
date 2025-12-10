#!/bin/bash

# =============================================================================
# Self-Service Catalog Platform - Full Cleanup
# =============================================================================
# Performs complete cleanup including:
# - Stop all services
# - Remove DNS entries from /etc/hosts
# - Delete all Kubernetes workspaces
# - Optionally stop Docker containers
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
HOSTS_MARKER="# IDP-MANAGED"

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
# Cleanup Functions
# =============================================================================

stop_services() {
    log_header "Stopping Services"
    
    # Stop backend
    if [[ -f "$SCRIPT_DIR/.backend.pid" ]]; then
        local pid=$(cat "$SCRIPT_DIR/.backend.pid")
        kill "$pid" 2>/dev/null || true
        rm -f "$SCRIPT_DIR/.backend.pid"
    fi
    lsof -ti :8000 2>/dev/null | xargs kill 2>/dev/null || true
    log_info "Backend stopped"
    
    # Stop frontend
    if [[ -f "$SCRIPT_DIR/.frontend.pid" ]]; then
        local pid=$(cat "$SCRIPT_DIR/.frontend.pid")
        kill "$pid" 2>/dev/null || true
        rm -f "$SCRIPT_DIR/.frontend.pid"
    fi
    lsof -ti :3000 2>/dev/null | xargs kill 2>/dev/null || true
    log_info "Frontend stopped"
    
    log_success "Services stopped"
}

stop_port_forwards() {
    log_header "Stopping Port Forwards"
    
    pkill -f "kubectl port-forward" 2>/dev/null || true
    
    log_success "All port-forwards stopped"
}

cleanup_dns() {
    log_header "Cleaning Up DNS Entries"
    
    local hosts_file="/etc/hosts"
    
    if grep -q "$HOSTS_MARKER" "$hosts_file" 2>/dev/null; then
        log_info "Removing IDP-managed entries from /etc/hosts (requires sudo)..."
        
        # Create backup and remove marked lines
        sudo cp "$hosts_file" "$hosts_file.backup"
        sudo sed -i '' "/$HOSTS_MARKER/d" "$hosts_file" 2>/dev/null || \
        sudo sed -i "/$HOSTS_MARKER/d" "$hosts_file" 2>/dev/null || \
        log_warning "Could not clean /etc/hosts automatically"
        
        log_success "DNS entries removed"
    else
        log_info "No IDP-managed DNS entries found"
    fi
}

cleanup_kubernetes() {
    log_header "Cleaning Up Kubernetes Workspaces"
    
    if ! kubectl cluster-info >/dev/null 2>&1; then
        log_warning "Kubernetes cluster not accessible, skipping"
        return
    fi
    
    # Get workspace namespaces
    local namespaces=$(kubectl get namespaces -o jsonpath='{.items[*].metadata.name}' 2>/dev/null | tr ' ' '\n' | grep "^ws-" || true)
    
    if [[ -n "$namespaces" ]]; then
        log_info "Deleting workspace namespaces..."
        for ns in $namespaces; do
            log_info "  Deleting: $ns"
            kubectl delete namespace "$ns" --ignore-not-found --wait=false >/dev/null 2>&1 &
        done
        wait
        log_success "Workspace namespaces deleted"
    else
        log_info "No workspace namespaces found"
    fi
}

cleanup_terraform_state() {
    log_header "Cleaning Up Terraform State"
    
    local tf_path="$SCRIPT_DIR/infrastructure/terraform/app-deployer"
    
    rm -f "$tf_path/terraform.tfstate"
    rm -f "$tf_path/terraform.tfstate.backup"
    rm -f "$tf_path"/workspace-*.tfvars
    
    log_success "Terraform state cleaned"
}

cleanup_port_mappings() {
    log_header "Cleaning Up Port Mappings"
    
    rm -f "$BACKEND_DIR/port_mappings.json"
    
    log_success "Port mappings cleaned"
}

cleanup_logs() {
    log_header "Cleaning Up Logs"
    
    rm -f "$SCRIPT_DIR/.backend.log"
    rm -f "$SCRIPT_DIR/.frontend.log"
    rm -f "$SCRIPT_DIR/.backend.pid"
    rm -f "$SCRIPT_DIR/.frontend.pid"
    
    log_success "Logs cleaned"
}

cleanup_docker() {
    log_header "Docker Containers (Optional)"
    
    echo ""
    echo "The following Docker containers are used by the platform:"
    echo "  - catalog-postgres (PostgreSQL database)"
    echo "  - registry (Docker image registry)"
    echo ""
    
    read -p "Stop and remove these containers? (y/N) " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker stop catalog-postgres registry 2>/dev/null || true
        docker rm catalog-postgres registry 2>/dev/null || true
        log_success "Docker containers removed"
    else
        log_info "Docker containers preserved"
    fi
}

# =============================================================================
# Main
# =============================================================================

show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Performs full cleanup of the Self-Service Catalog platform."
    echo ""
    echo "Options:"
    echo "  --all       Include Docker containers (PostgreSQL, registry)"
    echo "  --force     Skip confirmation prompts"
    echo "  -h, --help  Show this help message"
    echo ""
}

main() {
    local include_docker=false
    local force=false
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --all)
                include_docker=true
                shift
                ;;
            --force)
                force=true
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    echo ""
    echo -e "${RED}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║     🧹 Self-Service Catalog Platform - Full Cleanup              ║${NC}"
    echo -e "${RED}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    
    if [[ "$force" != "true" ]]; then
        echo ""
        echo -e "${YELLOW}This will:${NC}"
        echo "  • Stop all running services"
        echo "  • Remove DNS entries from /etc/hosts"
        echo "  • Delete all Kubernetes workspaces"
        echo "  • Clean up Terraform state"
        echo "  • Remove port mappings and logs"
        if [[ "$include_docker" == "true" ]]; then
            echo "  • Stop Docker containers (PostgreSQL, registry)"
        fi
        echo ""
        read -p "Continue? (y/N) " -n 1 -r
        echo
        
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Cleanup cancelled"
            exit 0
        fi
    fi
    
    stop_services
    stop_port_forwards
    cleanup_kubernetes
    cleanup_terraform_state
    cleanup_port_mappings
    cleanup_logs
    cleanup_dns
    
    if [[ "$include_docker" == "true" ]]; then
        docker stop catalog-postgres registry 2>/dev/null || true
        docker rm catalog-postgres registry 2>/dev/null || true
        log_success "Docker containers removed"
    fi
    
    log_header "Cleanup Complete!"
    
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                    ✅ Cleanup Complete                            ║${NC}"
    echo -e "${GREEN}╠═══════════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║  To set up again:   ${NC}./setup.sh${GREEN}                                   ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

main "$@"

