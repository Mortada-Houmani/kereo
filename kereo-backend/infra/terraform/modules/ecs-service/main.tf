resource "aws_security_group" "ecs_tasks" {
  name        = "${var.project_name}-ecs-tasks-sg"
  description = "Security group for ECS tasks"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = var.container_port
    to_port         = var.container_port
    protocol        = "tcp"
    security_groups = [var.alb_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Project = var.project_name
  }
}

# resource "aws_cloudwatch_log_group" "service" {
#   name              = "/ecs/todo-server"
#   retention_in_days = 7

#   tags = {
#     Project = var.project_name
#   }
# }

resource "aws_ecs_task_definition" "this" {
  family                   = "${var.project_name}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"

  cpu    = "256"
  memory = "512"

  execution_role_arn = var.task_execution_role_arn
  task_role_arn      = var.task_role_arn

  container_definitions = jsonencode([
    {
      name      = "${var.project_name}-api"
      image     = var.container_image
      essential = true

      portMappings = [
        {
          containerPort = var.container_port
          hostPort      = var.container_port
          protocol      = "tcp"
        }
      ]

      environment = [
        {
          name  = "NODE_ENV"
          value = "production"
        },
        {
          name  = "PORT"
          value = tostring(var.container_port)
        },
        {
          name  = "TYPEORM_SYNCHRONIZE"
          value = tostring(var.typeorm_synchronize)
        },
        {
          name  = "REDIS_HOST"
          value = var.redis_host
        },
        {
          name  = "REDIS_PORT"
          value = tostring(var.redis_port)
        },
        {
          name  = "AWS_REGION"
          value = var.aws_region
        },
        {
          name  = "AWS_ACCOUNT_ID"
          value = var.aws_account_id
        },
        {
          name  = "ECR_REPOSITORY"
          value = var.ecr_repository
        },
        {
          name  = "PROJECT_NAME"
          value = var.project_name
        },
        {
          name  = "ECS_CLUSTER_NAME"
          value = var.ecs_cluster_name
        },
        {
          name  = "ECS_TASK_EXECUTION_ROLE_ARN"
          value = var.ecs_task_execution_role_arn
        },
        {
          name  = "ECS_SUBNET_IDS"
          value = join(",", var.ecs_subnet_ids)
        },
        {
          name  = "CODEBUILD_PROJECT_NAME"
          value = var.codebuild_project_name
        },
        {
          name  = "ECS_SECURITY_GROUP_ID"
          value = aws_security_group.ecs_tasks.id
        },
        {
          name  = "DATABASE_URL_PARAM_ARN"
          value = var.database_url_param_arn
        },
        {
          name  = "JWT_SECRET_PARAM_ARN"
          value = var.jwt_secret_param_arn
        },
        {
          name  = "VPC_ID"
          value = var.vpc_id
        },
        {
          name  = "ALB_DNS_NAME"
          value = var.alb_dns_name
        },
        {
          name  = "ALB_LISTENER_ARN"
          value = var.alb_listener_arn
        },
        {
          name  = "PUBLIC_BASE_URL"
          value = var.public_base_url
        }
      ]

      secrets = [
        {
          name      = "DATABASE_URL"
          valueFrom = var.database_url_param_arn
        },
        {
          name      = "JWT_SECRET"
          valueFrom = var.jwt_secret_param_arn
        },
        {
          name      = "GITHUB_WEBHOOK_SECRET"
          valueFrom = var.github_webhook_secret_param_arn
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = var.log_group_name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
    }
  ])

  tags = {
    Project = var.project_name
  }
}

resource "aws_ecs_service" "this" {
  name            = "${var.project_name}-api-service"
  cluster         = var.cluster_id
  task_definition = aws_ecs_task_definition.this.arn
  desired_count   = var.desired_count

  capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
  }

  force_new_deployment = true

  lifecycle {
    ignore_changes = [
      desired_count,
      health_check_grace_period_seconds,
      deployment_controller,
      deployment_circuit_breaker,
      wait_for_steady_state,
      triggers,
      tags,
      tags_all,
    ]
  }

  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = var.target_group_arn
    container_name   = "${var.project_name}-api"
    container_port   = var.container_port
  }

  depends_on = [
    aws_ecs_task_definition.this
  ]

  tags = {
    Project = var.project_name
  }
}
