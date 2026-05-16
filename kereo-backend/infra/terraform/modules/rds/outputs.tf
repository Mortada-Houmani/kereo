output "db_endpoint" {
  value = aws_db_instance.this.endpoint
}

output "db_name" {
  value = aws_db_instance.this.db_name
}

output "db_security_group_id" {
  value = aws_security_group.rds.id
}