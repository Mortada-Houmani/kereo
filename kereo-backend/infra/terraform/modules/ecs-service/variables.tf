variable "project_name" {
  type = string
}

variable "cluster_id" {
  type = string
}

variable "task_execution_role_arn" {
  type = string
}

variable "task_role_arn" {
  type = string
}

variable "container_image" {
  type = string
}

variable "container_port" {
  type    = number
  default = 3000
}

variable "subnet_ids" {
  type = list(string)
}

variable "vpc_id" {
  type = string
}

variable "alb_security_group_id" {
  type = string
}

variable "target_group_arn" {
  type = string
}

variable "desired_count" {
  type    = number
  default = 1
}

variable "database_url" {
  type      = string
  sensitive = true
}
variable "database_url_param_arn" {
  type = string
}

variable "jwt_secret_param_arn" {
  type = string
}

variable "github_webhook_secret_param_arn" {
  type = string
}

variable "alb_dns_name" {
  type = string
}

variable "alb_listener_arn" {
  type = string
}

variable "alb_security_group_id" {
  type = string
}

variable "public_base_url" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "aws_account_id" {
  type = string
}

variable "ecr_repository" {
  type = string
}

variable "ecs_cluster_name" {
  type = string
}

variable "ecs_task_execution_role_arn" {
  type = string
}

variable "ecs_subnet_ids" {
  type = list(string)
}

variable "codebuild_project_name" {
  type = string
}

variable "redis_host" {
  type = string
}

variable "redis_port" {
  type = number
}

variable "log_group_name" {
  type = string
}

variable "typeorm_synchronize" {
  type    = bool
  default = false
}
