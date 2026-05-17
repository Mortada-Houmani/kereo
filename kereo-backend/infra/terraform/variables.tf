variable "aws_region" {
  type    = string
  default = "eu-central-1"
}

variable "project_name" {
  type    = string
  default = "kereo"
}

variable "vpc_cidr" {
  type    = string
  default = "10.42.0.0/16"
}

variable "availability_zones" {
  type    = list(string)
  default = ["eu-central-1a", "eu-central-1b"]
}

variable "public_subnet_cidrs" {
  type    = list(string)
  default = ["10.42.0.0/24", "10.42.1.0/24"]
}

variable "private_subnet_cidrs" {
  type    = list(string)
  default = ["10.42.10.0/24", "10.42.11.0/24"]
}

variable "db_username" {
  type    = string
  default = "postgres"
}

variable "db_password" {
  type      = string
  sensitive = true
}

variable "jwt_secret" {
  type      = string
  sensitive = true

  validation {
    condition     = length(var.jwt_secret) > 0
    error_message = "jwt_secret must be set before applying."
  }
}

variable "github_webhook_secret" {
  type      = string
  sensitive = true

  validation {
    condition     = length(var.github_webhook_secret) > 0
    error_message = "github_webhook_secret must be set before applying."
  }
}

variable "github_app_id" {
  type = string

  validation {
    condition     = length(var.github_app_id) > 0
    error_message = "github_app_id must be set before applying."
  }
}

variable "github_app_slug" {
  type = string

  validation {
    condition     = length(var.github_app_slug) > 0
    error_message = "github_app_slug must be set before applying."
  }
}

variable "github_app_private_key" {
  type      = string
  sensitive = true

  validation {
    condition     = length(var.github_app_private_key) > 0
    error_message = "github_app_private_key must be set before applying."
  }
}

variable "github_client_id" {
  type = string

  validation {
    condition     = length(var.github_client_id) > 0
    error_message = "github_client_id must be set before applying."
  }
}

variable "github_client_secret" {
  type      = string
  sensitive = true

  validation {
    condition     = length(var.github_client_secret) > 0
    error_message = "github_client_secret must be set before applying."
  }
}

variable "smtp_host" {
  type = string
}

variable "smtp_port" {
  type = number
}

variable "smtp_user" {
  type = string
}

variable "smtp_password" {
  type      = string
  sensitive = true
}

variable "smtp_from_email" {
  type = string
}

variable "smtp_from_name" {
  type    = string
  default = "Kereo"
}

variable "container_image" {
  type = string
}

variable "frontend_container_image" {
  type = string
}

variable "certificate_arn" {
  type    = string
  default = null
}

variable "hosted_zone_id" {
  type    = string
  default = null
}

variable "domain_name" {
  type    = string
  default = "kereo.online"
}

variable "public_base_url" {
  type    = string
  default = "https://kereo.online"
}

variable "typeorm_synchronize" {
  type    = bool
  default = false
}
