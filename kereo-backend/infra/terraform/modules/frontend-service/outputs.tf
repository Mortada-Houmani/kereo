output "service_name" {
  value = aws_ecs_service.this.name
}

output "task_definition_arn" {
  value = aws_ecs_task_definition.this.arn
}

output "security_group_id" {
  value = aws_security_group.ecs_tasks.id
}

output "log_group_name" {
  value = aws_cloudwatch_log_group.service.name
}
