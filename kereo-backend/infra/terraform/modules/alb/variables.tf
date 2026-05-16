variable "project_name" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "public_subnet_ids" {
  type = list(string)
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
  default = null
}
