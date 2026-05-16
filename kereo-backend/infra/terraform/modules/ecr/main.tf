resource "aws_ecr_repository" "this" {
  name = "${var.project_name}-apps"

  image_scanning_configuration {
    scan_on_push = true
  }

  force_delete = true

  tags = {
    Project = var.project_name
  }
}