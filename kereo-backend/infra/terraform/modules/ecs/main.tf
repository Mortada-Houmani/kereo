resource "aws_ecs_cluster" "this" {
  name = "${var.project_name}-cluster"
  lifecycle {
    ignore_changes = [
      configuration
    ]
  }

  tags = {
    Project = var.project_name
  }
}

resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/${var.project_name}-api"
  retention_in_days = 7

  tags = {
    Project = var.project_name
  }
}
