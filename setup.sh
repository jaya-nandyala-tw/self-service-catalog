#!/bin/bash

# =============================================================================
# Self-Service Catalog Platform - One-Time Setup
# =============================================================================
# Run this script once when setting up the platform or adding new apps.
# Requires sudo for /etc/hosts configuration.
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
APPS_DIR="$SCRIPT_DIR/apps"
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
# Domain Discovery
# =============================================================================

discover_domains() {
    local domains=()
    
    # Read all app-manifest.json files and extract appName
    for manifest in "$APPS_DIR"/*/app-manifest.json; do
        if [[ -f "$manifest" ]]; then
            # Extract appName and convert to slug
            local app_name=$(cat "$manifest" | grep -o '"appName"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
            if [[ -n "$app_name" ]]; then
                # Convert to slug: lowercase, replace spaces with hyphens
                local slug=$(echo "$app_name" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr '_' '-')
                domains+=("${slug}.local")
            fi
        fi
    done
    
    # Return domains as newline-separated string
    printf '%s\n' "${domains[@]}"
}

# =============================================================================
# DNS Configuration
# =============================================================================

configure_hosts() {
    log_header "Configuring Local DNS (/etc/hosts)"
    
    local hosts_file="/etc/hosts"
    local all_domains=()
    
    # Discover domains from app manifests
    log_info "Discovering domains from app manifests..."
    while IFS= read -r domain; do
        if [[ -n "$domain" ]]; then
            all_domains+=("$domain")
            log_info "  Found: $domain"
        fi
    done < <(discover_domains)
    
    if [[ ${#all_domains[@]} -eq 0 ]]; then
        log_warning "No apps found in $APPS_DIR"
        return
    fi
    
    # Build the entries to add
    log_info "Configuring /etc/hosts (requires sudo)..."
    
    local entries_added=0
    for domain in "${all_domains[@]}"; do
        if ! grep -q "$domain" "$hosts_file" 2>/dev/null; then
            echo "127.0.0.1 $domain  $HOSTS_MARKER" | sudo tee -a "$hosts_file" > /dev/null
            log_info "  Added: $domain → 127.0.0.1"
            ((entries_added++))
        else
            log_info "  Already exists: $domain"
        fi
    done
    
    if [[ $entries_added -gt 0 ]]; then
        log_success "Added $entries_added DNS entries"
    else
        log_success "All DNS entries already configured"
    fi
    
    # Show configured domains
    echo ""
    log_info "Configured domains:"
    for domain in "${all_domains[@]}"; do
        echo -e "    ${GREEN}✓${NC} $domain"
    done
}

# =============================================================================
# Prerequisites Check
# =============================================================================

check_prerequisites() {
    log_header "Checking Prerequisites"
    
    local missing=()
    
    # Check for required commands
    command -v docker >/dev/null 2>&1 || missing+=("docker")
    command -v kubectl >/dev/null 2>&1 || missing+=("kubectl")
    command -v python3 >/dev/null 2>&1 || missing+=("python3")
    command -v npm >/dev/null 2>&1 || missing+=("npm")
    command -v minikube >/dev/null 2>&1 || missing+=("minikube")
    command -v terraform >/dev/null 2>&1 || missing+=("terraform")
    
    if [[ ${#missing[@]} -gt 0 ]]; then
        log_error "Missing required tools: ${missing[*]}"
        log_info "Please install them before continuing."
        exit 1
    fi
    
    log_success "All prerequisites met"
}

# =============================================================================
# Minikube Setup
# =============================================================================

setup_minikube() {
    log_header "Checking Minikube"
    
    if ! minikube status >/dev/null 2>&1; then
        log_info "Starting minikube..."
        minikube start
    else
        log_success "Minikube is running"
    fi
    
    # Enable ingress addon
    if ! minikube addons list | grep -q "ingress.*enabled"; then
        log_info "Enabling ingress addon..."
        minikube addons enable ingress
    else
        log_success "Ingress addon is enabled"
    fi
}

# =============================================================================
# Docker Registry Setup
# =============================================================================

setup_registry() {
    log_header "Setting Up Docker Registry"
    
    if docker ps --format '{{.Names}}' | grep -q "^registry$"; then
        log_success "Docker registry already running on port 5000"
    else
        log_info "Starting Docker registry on port 5000..."
        docker run -d \
            --name registry \
            -p 5000:5000 \
            --restart unless-stopped \
            registry:2 >/dev/null 2>&1 || true
        log_success "Docker registry started"
    fi
}

# =============================================================================
# Database Setup
# =============================================================================

setup_database() {
    log_header "Setting Up PostgreSQL Database"
    
    if docker ps --format '{{.Names}}' | grep -q "catalog-postgres"; then
        log_success "PostgreSQL already running"
    else
        log_info "Starting PostgreSQL container..."
        docker run -d \
            --name catalog-postgres \
            -e POSTGRES_USER=catalog_user \
            -e POSTGRES_PASSWORD=catalog_password \
            -e POSTGRES_DB=catalog_db \
            -p 5432:5432 \
            --restart unless-stopped \
            postgres:15-alpine >/dev/null 2>&1 || true
        
        log_info "Waiting for PostgreSQL to be ready..."
        sleep 3
        log_success "PostgreSQL started"
    fi
}

# =============================================================================
# Python Environment Setup
# =============================================================================

setup_python_env() {
    log_header "Setting Up Python Environment"
    
    local backend_dir="$SCRIPT_DIR/catalog-backend"
    
    if [[ ! -d "$backend_dir/venv" ]]; then
        log_info "Creating Python virtual environment..."
        python3 -m venv "$backend_dir/venv"
        source "$backend_dir/venv/bin/activate"
        pip install --upgrade pip >/dev/null 2>&1
        pip install -r "$backend_dir/requirements.txt" >/dev/null 2>&1
        deactivate
        log_success "Python environment created"
    else
        log_success "Python environment already exists"
    fi
}

# =============================================================================
# Database Migrations
# =============================================================================

run_migrations() {
    log_header "Running Database Migrations"
    
    local backend_dir="$SCRIPT_DIR/catalog-backend"
    
    log_info "Waiting for database to be ready..."
    sleep 2
    
    log_info "Running Alembic migrations..."
    cd "$backend_dir"
    source venv/bin/activate
    
    # Run migrations
    if alembic upgrade head 2>&1 | grep -q "FAILED\|Error"; then
        log_warning "Migration may have encountered issues, but continuing..."
    else
        log_success "Database migrations complete"
    fi
    
    deactivate
    cd "$SCRIPT_DIR"
}

# =============================================================================
# Node.js Dependencies
# =============================================================================

setup_node_deps() {
    log_header "Setting Up Node.js Dependencies"
    
    local frontend_dir="$SCRIPT_DIR/catalog-ui"
    
    if [[ ! -d "$frontend_dir/node_modules" ]]; then
        log_info "Installing npm dependencies..."
        cd "$frontend_dir"
        npm install >/dev/null 2>&1
        cd "$SCRIPT_DIR"
        log_success "Node.js dependencies installed"
    else
        log_success "Node.js dependencies already installed"
    fi
}

# =============================================================================
# Terraform Init
# =============================================================================

setup_terraform() {
    log_header "Initializing Terraform"
    
    local tf_dir="$SCRIPT_DIR/infrastructure/terraform/app-deployer"
    
    if [[ ! -d "$tf_dir/.terraform" ]]; then
        log_info "Running terraform init..."
        cd "$tf_dir"
        terraform init >/dev/null 2>&1
        cd "$SCRIPT_DIR"
        log_success "Terraform initialized"
    else
        log_success "Terraform already initialized"
    fi
}

# =============================================================================
# Main
# =============================================================================

main() {
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║     🔧 Self-Service Catalog Platform - One-Time Setup            ║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    
    check_prerequisites
    setup_minikube
    setup_registry
    setup_database
    setup_python_env
    run_migrations
    setup_node_deps
    setup_terraform
    configure_hosts
    
    log_header "Setup Complete!"
    
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                    ✅ Setup Complete!                             ║${NC}"
    echo -e "${GREEN}╠═══════════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║  Next steps:                                                      ║${NC}"
    echo -e "${GREEN}║    1. Run ${NC}./start.sh${GREEN} to start the platform                       ║${NC}"
    echo -e "${GREEN}║    2. Open ${NC}http://localhost:3000${GREEN} in your browser                 ║${NC}"
    echo -e "${GREEN}╠═══════════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║  If you add new apps, run ${NC}./setup.sh${GREEN} again to update DNS.        ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

main "$@"

