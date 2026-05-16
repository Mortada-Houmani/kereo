output "service_name" {
  value = aws_ecs_service.this.name
}

output "task_definition_arn" {
  value = aws_ecs_task_definition.this.arn
}

output "ecs_tasks_security_group_id" {
  value = aws_security_group.ecs_tasks.id
}