variable "project_name" {
  type = string
}

variable "cluster_id" {
  type = string
}

variable "task_execution_role_arn" {
  type = string
}

variable "container_image" {
  type = string
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

variable "aws_region" {
  type = string
}

variable "desired_count" {
  type    = number
  default = 1
}

variable "container_port" {
  type    = number
  default = 80
}
