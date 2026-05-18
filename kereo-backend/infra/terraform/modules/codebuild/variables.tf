variable "project_name" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "ecr_repository_url" {
  type = string
}

variable "dockerhub_username" {
  type    = string
  default = ""
}

variable "dockerhub_token_parameter_name" {
  type    = string
  default = null
}
