# App Deployer - Main Terraform Configuration
# This module transforms JSON app manifests and deploys them via the Universal Helm Chart

#------------------------------------------------------------------------------
# Local Variables - Parse and Transform the JSON Manifest
#------------------------------------------------------------------------------

locals {
  # Parse the JSON manifest
  manifest = jsondecode(var.app_manifest_json)

  # Generate app slug from appName (e.g., "E-Commerce Platform" -> "e-commerce-platform")
  # First lowercase, then replace spaces with hyphens, then remove invalid chars
  app_slug = replace(replace(lower(local.manifest.appName), " ", "-"), "/[^a-z0-9-]/", "")

  # Namespace name based on workspace ID
  namespace = "ws-${var.workspace_id}"

  # Transform manifest components to Helm chart format
  # Maps component paths to container images following convention: {registry}/{app-slug}-{component-name}:{tag}
  helm_components = [
    for component in local.manifest.components : {
      name             = component.name
      image            = "${var.image_registry}/${local.app_slug}-${component.name}:${var.image_tag}"
      port             = component.port
      type             = component.type
      replicas         = try(component.replicas, var.component_defaults.replicas, 1)
      ingressPath      = component.type == "frontend" ? "/" : null
      ingressPathType  = component.type == "frontend" ? "Prefix" : null
      env              = try(component.env, [])
      resources = {
        requests = {
          memory = try(component.resources.requests.memory, var.component_defaults.resources.requests.memory, "128Mi")
          cpu    = try(component.resources.requests.cpu, var.component_defaults.resources.requests.cpu, "100m")
        }
        limits = {
          memory = try(component.resources.limits.memory, var.component_defaults.resources.limits.memory, "512Mi")
          cpu    = try(component.resources.limits.cpu, var.component_defaults.resources.limits.cpu, "500m")
        }
      }
      healthCheck = {
        enabled = try(component.healthCheck.enabled, true)
        path    = try(component.healthCheck.path, "/health")
      }
    }
  ]

  # Determine ingress host
  ingress_host = var.ingress_host != "" ? var.ingress_host : "${local.app_slug}.local"

  # Common labels for all resources
  common_labels = merge({
    "app.kubernetes.io/managed-by" = "terraform"
    "idp.platform/workspace-id"    = var.workspace_id
    "idp.platform/app-name"        = local.app_slug
  }, var.extra_labels)

  # Helm values structure
  helm_values = {
    global = {
      appName       = local.app_slug
      imageRegistry = var.image_registry
      labels        = local.common_labels
    }

    components = local.helm_components

    ingress = {
      enabled   = var.ingress_enabled
      className = var.ingress_class_name
      host      = local.ingress_host
      tls = {
        enabled = false
      }
    }

    databases = {
      postgresql = {
        enabled = false
      }
      simplePostgresql = {
        enabled  = var.enable_database
        image    = "postgres:15-alpine"
        storage  = var.database_storage_size
        auth = {
          username = "app"
          password = "changeme-${var.workspace_id}"
          database = replace(local.app_slug, "-", "_")
        }
      }
    }

    serviceAccount = {
      create = true
    }

    componentDefaults = {
      replicas = try(var.component_defaults.replicas, 1)
      resources = {
        requests = {
          memory = try(var.component_defaults.resources.requests.memory, "128Mi")
          cpu    = try(var.component_defaults.resources.requests.cpu, "100m")
        }
        limits = {
          memory = try(var.component_defaults.resources.limits.memory, "512Mi")
          cpu    = try(var.component_defaults.resources.limits.cpu, "500m")
        }
      }
    }
  }
}

#------------------------------------------------------------------------------
# Kubernetes Namespace
#------------------------------------------------------------------------------

resource "kubernetes_namespace_v1" "workspace" {
  metadata {
    name = local.namespace

    labels = merge(local.common_labels, {
      "kubernetes.io/metadata.name" = local.namespace
    })

    annotations = {
      "idp.platform/app-description" = try(local.manifest.description, "")
      "idp.platform/created-at"      = timestamp()
    }
  }

  lifecycle {
    ignore_changes = [
      metadata[0].annotations["idp.platform/created-at"]
    ]
  }
}

#------------------------------------------------------------------------------
# Helm Release - Deploy Universal App Chart
#------------------------------------------------------------------------------

resource "helm_release" "app" {
  name       = local.app_slug
  namespace  = kubernetes_namespace_v1.workspace.metadata[0].name
  chart      = var.helm_chart_path
  
  timeout    = var.helm_timeout
  atomic     = var.helm_atomic
  wait       = var.helm_wait
  
  # Pass the transformed values to the Helm chart
  values = [
    yamlencode(local.helm_values)
  ]

  # Ensure namespace exists before deploying
  depends_on = [kubernetes_namespace_v1.workspace]
}

#------------------------------------------------------------------------------
# Outputs
#------------------------------------------------------------------------------

output "namespace" {
  description = "The Kubernetes namespace where the application is deployed"
  value       = kubernetes_namespace_v1.workspace.metadata[0].name
}

output "app_name" {
  description = "The slugified application name"
  value       = local.app_slug
}

output "release_name" {
  description = "The Helm release name"
  value       = helm_release.app.name
}

output "release_status" {
  description = "The status of the Helm release"
  value       = helm_release.app.status
}

output "components" {
  description = "List of deployed components with their details"
  value = [
    for c in local.helm_components : {
      name  = c.name
      image = c.image
      port  = c.port
      type  = c.type
    }
  ]
}

output "ingress_host" {
  description = "The ingress hostname for the application"
  value       = var.ingress_enabled ? local.ingress_host : null
}

output "database_enabled" {
  description = "Whether a database was provisioned"
  value       = var.enable_database
}

output "service_urls" {
  description = "Internal service URLs for each component"
  value = {
    for c in local.helm_components : c.name => "http://${local.app_slug}-${c.name}.${local.namespace}.svc.cluster.local:${c.port}"
  }
}

