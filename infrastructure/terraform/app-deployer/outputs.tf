# Outputs are defined in main.tf for cohesion with the resource definitions
# This file serves as documentation of available outputs

# Available outputs from this module:
#
# namespace          - The Kubernetes namespace where the application is deployed
# app_name           - The slugified application name
# release_name       - The Helm release name  
# release_status     - The status of the Helm release
# components         - List of deployed components with their details
# ingress_host       - The ingress hostname for the application
# database_enabled   - Whether a database was provisioned
# service_urls       - Internal service URLs for each component

