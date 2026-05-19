data "aws_caller_identity" "current" {}

locals {
  database_url = "postgresql://${var.db_username}:${urlencode(var.db_password)}@${module.rds.db_endpoint}/${module.rds.db_name}?sslmode=require"
}

module "network" {
  source = "./modules/network"

  project_name         = var.project_name
  vpc_cidr             = var.vpc_cidr
  availability_zones   = var.availability_zones
  public_subnet_cidrs  = var.public_subnet_cidrs
  private_subnet_cidrs = var.private_subnet_cidrs
}

module "ecr" {
  source       = "./modules/ecr"
  project_name = var.project_name
}

module "codebuild" {
  source = "./modules/codebuild"

  project_name                   = var.project_name
  aws_region                     = var.aws_region
  ecr_repository_url             = module.ecr.repository_url
  dockerhub_username             = var.dockerhub_username
  dockerhub_token_parameter_name = length(aws_ssm_parameter.dockerhub_token) > 0 ? aws_ssm_parameter.dockerhub_token[0].name : null
}

module "ecs" {
  source       = "./modules/ecs"
  project_name = var.project_name
}

module "alb" {
  source = "./modules/alb"

  project_name      = var.project_name
  vpc_id            = module.network.vpc_id
  public_subnet_ids = module.network.public_subnet_ids
  certificate_arn   = var.certificate_arn
  hosted_zone_id    = var.hosted_zone_id
  domain_name       = var.domain_name
}

module "iam" {
  source       = "./modules/iam"
  project_name = var.project_name
}

module "rds" {
  source = "./modules/rds"

  project_name        = var.project_name
  vpc_id              = module.network.vpc_id
  private_subnet_ids  = module.network.private_subnet_ids
  allowed_cidr_blocks = [var.vpc_cidr]
  db_username         = var.db_username
  db_password         = var.db_password
}

module "redis" {
  source = "./modules/redis"

  project_name        = var.project_name
  vpc_id              = module.network.vpc_id
  private_subnet_ids  = module.network.private_subnet_ids
  allowed_cidr_blocks = [var.vpc_cidr]
}

resource "aws_ssm_parameter" "database_url" {
  name  = "/${var.project_name}/prod/DATABASE_URL"
  type  = "SecureString"
  value = local.database_url

  tags = {
    Project = var.project_name
  }
}

resource "aws_ssm_parameter" "jwt_secret" {
  name  = "/${var.project_name}/prod/JWT_SECRET"
  type  = "SecureString"
  value = var.jwt_secret

  tags = {
    Project = var.project_name
  }
}

resource "aws_ssm_parameter" "github_webhook_secret" {
  name  = "/${var.project_name}/prod/GITHUB_WEBHOOK_SECRET"
  type  = "SecureString"
  value = var.github_webhook_secret

  tags = {
    Project = var.project_name
  }
}

resource "aws_ssm_parameter" "github_app_private_key" {
  name  = "/${var.project_name}/prod/GITHUB_APP_PRIVATE_KEY"
  type  = "SecureString"
  value = var.github_app_private_key

  tags = {
    Project = var.project_name
  }
}

resource "aws_ssm_parameter" "github_client_secret" {
  name  = "/${var.project_name}/prod/GITHUB_CLIENT_SECRET"
  type  = "SecureString"
  value = var.github_client_secret

  tags = {
    Project = var.project_name
  }
}

resource "aws_ssm_parameter" "smtp_password" {
  name  = "/${var.project_name}/prod/SMTP_PASSWORD"
  type  = "SecureString"
  value = var.smtp_password

  tags = {
    Project = var.project_name
  }
}

resource "aws_ssm_parameter" "dockerhub_token" {
  count = length(trimspace(var.dockerhub_token)) > 0 ? 1 : 0

  name  = "/${var.project_name}/prod/DOCKERHUB_TOKEN"
  type  = "SecureString"
  value = var.dockerhub_token

  tags = {
    Project = var.project_name
  }
}

module "ecs_service" {
  source = "./modules/ecs-service"

  project_name            = var.project_name
  cluster_id              = module.ecs.cluster_arn
  task_execution_role_arn = module.iam.ecs_task_execution_role_arn
  task_role_arn           = module.iam.ecs_task_role_arn

  container_image = var.container_image
  database_url    = local.database_url

  database_url_param_arn           = aws_ssm_parameter.database_url.arn
  jwt_secret_param_arn             = aws_ssm_parameter.jwt_secret.arn
  github_webhook_secret_param_arn  = aws_ssm_parameter.github_webhook_secret.arn
  github_app_private_key_param_arn = aws_ssm_parameter.github_app_private_key.arn
  github_client_secret_param_arn   = aws_ssm_parameter.github_client_secret.arn

  vpc_id                = module.network.vpc_id
  subnet_ids            = module.network.public_subnet_ids
  alb_security_group_id = module.alb.alb_security_group_id
  target_group_arn      = module.alb.api_target_group_arn
  alb_dns_name          = module.alb.alb_dns_name
  alb_listener_arn      = module.alb.listener_arn
  public_base_url       = var.public_base_url

  aws_region                  = var.aws_region
  aws_account_id              = data.aws_caller_identity.current.account_id
  ecr_repository              = module.ecr.repository_name
  ecs_cluster_name            = module.ecs.cluster_name
  ecs_task_execution_role_arn = module.iam.ecs_task_execution_role_arn
  ecs_subnet_ids              = module.network.public_subnet_ids
  codebuild_project_name      = module.codebuild.project_name
  github_app_id               = var.github_app_id
  github_app_slug             = var.github_app_slug
  github_client_id            = var.github_client_id
  redis_host                  = module.redis.host
  redis_port                  = module.redis.port
  log_group_name              = module.ecs.log_group_name
  typeorm_synchronize         = var.typeorm_synchronize
  smtp_host                   = var.smtp_host
  smtp_port                   = var.smtp_port
  smtp_user                   = var.smtp_user
  smtp_password_param_arn     = aws_ssm_parameter.smtp_password.arn
  smtp_from_email             = var.smtp_from_email
  smtp_from_name              = var.smtp_from_name

  container_port = 3000
  desired_count  = 1
}

module "frontend_service" {
  source = "./modules/frontend-service"

  project_name            = var.project_name
  cluster_id              = module.ecs.cluster_arn
  task_execution_role_arn = module.iam.ecs_task_execution_role_arn

  container_image       = var.frontend_container_image
  vpc_id                = module.network.vpc_id
  subnet_ids            = module.network.public_subnet_ids
  alb_security_group_id = module.alb.alb_security_group_id
  target_group_arn      = module.alb.frontend_target_group_arn
  aws_region            = var.aws_region

  container_port = 80
  desired_count  = 1
}
