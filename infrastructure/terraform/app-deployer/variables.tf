# Input Variables for App Deployer Module
# This module bridges JSON manifests from the Catalog to Helm deployments

variable "app_manifest_json" {
  description = "The raw JSON manifest string from the Catalog defining the application components"
  type        = string

  validation {
    condition     = can(jsondecode(var.app_manifest_json))
    error_message = "The app_manifest_json must be valid JSON."
  }
}

variable "workspace_id" {
  description = "Unique identifier for this workspace/deployment (used for namespace naming)"
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]*[a-z0-9]$", var.workspace_id)) && length(var.workspace_id) >= 3 && length(var.workspace_id) <= 63
    error_message = "Workspace ID must be 3-63 characters, lowercase alphanumeric with hyphens, and cannot start/end with a hyphen."
  }
}

variable "image_registry" {
  description = "Container image registry URL"
  type        = string
  default     = "localhost:5000"
}

variable "image_tag" {
  description = "Default image tag to use for all components"
  type        = string
  default     = "latest"
}

variable "helm_chart_path" {
  description = "Path to the universal-app Helm chart"
  type        = string
  default     = "../../helm-charts/universal-app"
}

variable "ingress_enabled" {
  description = "Enable ingress for frontend components"
  type        = bool
  default     = true
}

variable "ingress_class_name" {
  description = "Ingress class name (e.g., nginx, traefik)"
  type        = string
  default     = "nginx"
}

variable "ingress_host" {
  description = "Override the default ingress host. If empty, uses {app-slug}.local"
  type        = string
  default     = ""
}

variable "enable_database" {
  description = "Enable a PostgreSQL database for the application"
  type        = bool
  default     = false
}

variable "database_storage_size" {
  description = "Storage size for the database PVC"
  type        = string
  default     = "5Gi"
}

variable "component_defaults" {
  description = "Default settings for components"
  type = object({
    replicas = optional(number, 1)
    resources = optional(object({
      requests = optional(object({
        memory = optional(string, "128Mi")
        cpu    = optional(string, "100m")
      }), {})
      limits = optional(object({
        memory = optional(string, "512Mi")
        cpu    = optional(string, "500m")
      }), {})
    }), {})
  })
  default = {}
}

variable "extra_labels" {
  description = "Additional labels to apply to all resources"
  type        = map(string)
  default     = {}
}

variable "extra_annotations" {
  description = "Additional annotations to apply to pods"
  type        = map(string)
  default     = {}
}

variable "helm_timeout" {
  description = "Timeout for Helm operations in seconds"
  type        = number
  default     = 300
}

variable "helm_atomic" {
  description = "If true, installation process purges chart on fail"
  type        = bool
  default     = true
}

variable "helm_wait" {
  description = "If true, wait until all resources are in a ready state"
  type        = bool
  default     = true
}

