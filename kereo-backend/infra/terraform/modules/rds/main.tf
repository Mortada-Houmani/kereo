resource "aws_db_subnet_group" "this" {
  name = "${var.project_name}-db-subnets"

  subnet_ids = var.private_subnet_ids

  tags = {
    Project = var.project_name
  }
}

resource "aws_security_group" "rds" {
  name        = "${var.project_name}-rds-sg"
  description = "RDS security group"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 5432
    to_port     = 5432
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

resource "aws_db_instance" "this" {
  identifier = "${var.project_name}-postgres"

  engine         = "postgres"
  engine_version = "17.4"

  instance_class = "db.t3.micro"

  allocated_storage = 20
  storage_type      = "gp3"

  username = var.db_username
  password = var.db_password

  db_name = "kereo"

  publicly_accessible = false
  skip_final_snapshot = true
  deletion_protection = false
  apply_immediately   = true

  vpc_security_group_ids = [
    aws_security_group.rds.id
  ]

  db_subnet_group_name = aws_db_subnet_group.this.name

  backup_retention_period = 0

  tags = {
    Project = var.project_name
  }
}
