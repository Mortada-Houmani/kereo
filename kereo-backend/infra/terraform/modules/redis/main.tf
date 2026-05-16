resource "aws_elasticache_subnet_group" "this" {
  name       = "${var.project_name}-redis-subnets"
  subnet_ids = var.private_subnet_ids

  tags = {
    Project = var.project_name
  }
}

resource "aws_security_group" "redis" {
  name        = "${var.project_name}-redis-sg"
  description = "Redis security group"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidr_blocks
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

resource "aws_elasticache_parameter_group" "this" {
  name   = "${var.project_name}-redis7"
  family = "redis7"

  parameter {
    name  = "maxmemory-policy"
    value = "noeviction"
  }

  tags = {
    Project = var.project_name
  }
}

resource "aws_elasticache_cluster" "this" {
  cluster_id           = "${var.project_name}-redis"
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.node_type
  num_cache_nodes      = 1
  port                 = 6379
  parameter_group_name = aws_elasticache_parameter_group.this.name
  subnet_group_name    = aws_elasticache_subnet_group.this.name
  security_group_ids   = [aws_security_group.redis.id]

  tags = {
    Project = var.project_name
  }
}
