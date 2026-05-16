output "alb_dns_name" {
  value = aws_lb.this.dns_name
}

output "target_group_arn" {
  value = aws_lb_target_group.ecs.arn
}

output "api_target_group_arn" {
  value = aws_lb_target_group.ecs.arn
}

output "frontend_target_group_arn" {
  value = aws_lb_target_group.frontend.arn
}

output "alb_security_group_id" {
  value = aws_security_group.alb.id
}

output "listener_arn" {
  value = try(aws_lb_listener.https[0].arn, aws_lb_listener.http.arn)
}
