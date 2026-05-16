resource "aws_iam_role" "codebuild" {
  name = "${var.project_name}-codebuild-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "codebuild.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy" "codebuild" {
  name = "${var.project_name}-codebuild-policy"
  role = aws_iam_role.codebuild.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:CompleteLayerUpload",
          "ecr:GetAuthorizationToken",
          "ecr:InitiateLayerUpload",
          "ecr:PutImage",
          "ecr:UploadLayerPart"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_codebuild_project" "this" {
  name          = "${var.project_name}-image-builder"
  service_role  = aws_iam_role.codebuild.arn
  build_timeout = 30

  artifacts {
    type = "NO_ARTIFACTS"
  }

  environment {
    compute_type                = "BUILD_GENERAL1_SMALL"
    image                       = "aws/codebuild/standard:7.0"
    type                        = "LINUX_CONTAINER"
    image_pull_credentials_type = "CODEBUILD"
    privileged_mode             = true

    environment_variable {
      name  = "AWS_DEFAULT_REGION"
      value = var.aws_region
    }

    environment_variable {
      name  = "ECR_REPOSITORY_URL"
      value = var.ecr_repository_url
    }
  }

  logs_config {
    cloudwatch_logs {
      group_name = "/aws/codebuild/${var.project_name}-image-builder"
    }
  }

  source {
    type      = "NO_SOURCE"
    buildspec = <<-EOT
      version: 0.2
      phases:
        pre_build:
          commands:
            - set -eu
            - git --version
            - aws --version
            - docker --version
            - git clone --branch "$REPO_BRANCH" --single-branch "$REPO_URL" source
            - cd "source/$BUILD_CONTEXT"
            - aws ecr get-login-password --region "$AWS_DEFAULT_REGION" | docker login --username AWS --password-stdin "$ECR_REGISTRY"
        build:
          commands:
            - docker build -t "$IMAGE_URI" --build-arg "PORT=$APP_PORT" --build-arg "APP_BASE_PATH=$APP_BASE_PATH" -f "$DOCKERFILE_PATH" .
        post_build:
          commands:
            - docker push "$IMAGE_URI"
      EOT
  }

  tags = {
    Project = var.project_name
  }
}
