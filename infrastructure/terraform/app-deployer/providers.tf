# Terraform Providers Configuration
# This module requires kubernetes and helm providers to be configured

terraform {
  required_version = ">= 1.0.0"

  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = ">= 2.20.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = ">= 2.10.0"
    }
  }
}

# Kubernetes Provider
# Uses default kubeconfig or can be configured via variables
provider "kubernetes" {
  # Default: Uses ~/.kube/config or KUBECONFIG environment variable
  # For production, configure explicitly:
  # config_path    = var.kubeconfig_path
  # config_context = var.kubeconfig_context
}

# Helm Provider
# Automatically inherits Kubernetes connection settings from kubeconfig
provider "helm" {
  # Default: Uses ~/.kube/config or KUBECONFIG environment variable
  # For explicit configuration, uncomment:
  # registry {
  #   url      = "oci://registry.example.com"
  #   username = "username"
  #   password = "password"
  # }
}

