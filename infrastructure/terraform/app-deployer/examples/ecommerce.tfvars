# Example: Deploying the E-Commerce Platform
# Usage: terraform apply -var-file=examples/ecommerce.tfvars

workspace_id = "ecommerce-prod-001"

app_manifest_json = <<-EOT
{
  "appName": "E-Commerce Platform",
  "description": "A full-stack e-commerce application with React frontend, FastAPI backend, and Celery workers",
  "components": [
    {
      "name": "web-ui",
      "type": "frontend",
      "path": "./frontend",
      "port": 3000
    },
    {
      "name": "api-server",
      "type": "backend",
      "path": "./backend",
      "port": 8080
    },
    {
      "name": "task-processor",
      "type": "worker",
      "path": "./worker",
      "port": 5555
    }
  ]
}
EOT

image_registry     = "localhost:5000"
image_tag          = "latest"
ingress_enabled    = true
ingress_class_name = "nginx"
enable_database    = true
database_storage_size = "10Gi"

component_defaults = {
  replicas = 2
  resources = {
    requests = {
      memory = "256Mi"
      cpu    = "200m"
    }
    limits = {
      memory = "1Gi"
      cpu    = "1000m"
    }
  }
}

extra_labels = {
  "environment" = "production"
  "team"        = "platform"
}

