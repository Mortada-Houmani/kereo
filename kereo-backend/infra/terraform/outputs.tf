output "vpc_id" {
  value = module.network.vpc_id
}

output "public_subnet_ids" {
  value = module.network.public_subnet_ids
}

output "private_subnet_ids" {
  value = module.network.private_subnet_ids
}

output "ecr_repository_url" {
  value = module.ecr.repository_url
}

output "codebuild_project_name" {
  value = module.codebuild.project_name
}

output "ecs_cluster_name" {
  value = module.ecs.cluster_name
}

output "ecs_log_group" {
  value = module.ecs.log_group_name
}

output "alb_dns_name" {
  value = module.alb.alb_dns_name
}

output "alb_listener_arn" {
  value = module.alb.listener_arn
}

output "frontend_target_group_arn" {
  value = module.alb.frontend_target_group_arn
}

output "frontend_ecs_service_name" {
  value = module.frontend_service.service_name
}

output "rds_endpoint" {
  value = module.rds.db_endpoint
}

output "redis_host" {
  value = module.redis.host
}

output "ecs_task_execution_role_arn" {
  value = module.iam.ecs_task_execution_role_arn
}

output "ecs_task_role_arn" {
  value = module.iam.ecs_task_role_arn
}

output "ecs_task_role_name" {
  value = module.iam.ecs_task_role_name
}
