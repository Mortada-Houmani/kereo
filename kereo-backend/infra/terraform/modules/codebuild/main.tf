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
          "ssm:GetParameter",
          "ssm:GetParameters",
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

    dynamic "environment_variable" {
      for_each = trimspace(var.dockerhub_username) != "" ? [var.dockerhub_username] : []
      content {
        name  = "DOCKERHUB_USERNAME"
        value = environment_variable.value
      }
    }

    dynamic "environment_variable" {
      for_each = var.dockerhub_token_parameter_name != null ? [var.dockerhub_token_parameter_name] : []
      content {
        name  = "DOCKERHUB_TOKEN"
        value = environment_variable.value
        type  = "PARAMETER_STORE"
      }
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
            - |
              if [ -n "$${GITHUB_TOKEN:-}" ] && echo "$REPO_URL" | grep -qi 'github.com'; then
                AUTH_REPO_URL=$(echo "$REPO_URL" | sed -E 's#https://github.com/#https://x-access-token:'"$${GITHUB_TOKEN}"'@github.com/#')
                git clone --branch "$REPO_BRANCH" --single-branch "$AUTH_REPO_URL" source
              else
                git clone --branch "$REPO_BRANCH" --single-branch "$REPO_URL" source
              fi
            - |
              if [ -n "$${DOCKERHUB_USERNAME:-}" ] && [ -n "$${DOCKERHUB_TOKEN:-}" ]; then
                echo "$${DOCKERHUB_TOKEN}" | docker login --username "$${DOCKERHUB_USERNAME}" --password-stdin
              else
                echo "Docker Hub auth not configured; continuing with anonymous pulls."
              fi
            - aws ecr get-login-password --region "$AWS_DEFAULT_REGION" | docker login --username AWS --password-stdin "$ECR_REGISTRY"
        build:
          commands:
            - |
              BUILD_ARGS=""
              for key in $${DOCKER_BUILD_ARG_KEYS:-}; do
                BUILD_ARGS="$${BUILD_ARGS} --build-arg $${key}"
              done
              eval docker build $${BUILD_ARGS} -t "$IMAGE_URI" --build-arg "PORT=$APP_PORT" --build-arg "APP_BASE_PATH=$APP_BASE_PATH" -f "source/$DOCKERFILE_PATH" "source/$BUILD_CONTEXT"
        post_build:
          commands:
            - docker push "$IMAGE_URI"
      EOT
  }

  tags = {
    Project = var.project_name
  }
}
