resource "aws_security_group" "ecs_tasks" {
  name        = "${var.project_name}-frontend-ecs-sg"
  description = "Security group for frontend ECS tasks"
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

resource "aws_cloudwatch_log_group" "service" {
  name              = "/ecs/${var.project_name}-frontend"
  retention_in_days = 7

  tags = {
    Project = var.project_name
  }
}

resource "aws_ecs_task_definition" "this" {
  family                   = "${var.project_name}-frontend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"

  execution_role_arn = var.task_execution_role_arn

  container_definitions = jsonencode([
    {
      name      = "${var.project_name}-frontend"
      image     = var.container_image
      essential = true

      portMappings = [
        {
          containerPort = var.container_port
          hostPort      = var.container_port
          protocol      = "tcp"
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.service.name
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
  name            = "${var.project_name}-frontend-service"
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
      task_definition,
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
    container_name   = "${var.project_name}-frontend"
    container_port   = var.container_port
  }

  depends_on = [
    aws_ecs_task_definition.this
  ]

  tags = {
    Project = var.project_name
  }
}
