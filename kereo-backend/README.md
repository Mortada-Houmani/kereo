# Kereo Backend

Kereo is a NestJS deployment backend that builds project repositories into Docker images, pushes them to ECR, and deploys them to per-project ECS Fargate services behind an ALB.

## Environment Variables

```env
DATABASE_HOST=
DATABASE_PORT=5432
DATABASE_USER=
DATABASE_PASSWORD=
DATABASE_NAME=

REDIS_HOST=localhost
REDIS_PORT=6379

JWT_SECRET=
JWT_EXPIRES_IN=7d

AWS_REGION=eu-central-1
AWS_ACCOUNT_ID=
ECR_REPOSITORY=kereo-apps

VPC_ID=
PUBLIC_BASE_URL=https://kereo.online
ALB_LISTENER_ARN=<HTTPS listener ARN>
ALB_DNS_NAME=

ECS_CLUSTER_NAME=
ECS_TASK_EXECUTION_ROLE_ARN=
ECS_SUBNET_IDS=subnet-a,subnet-b
ECS_SECURITY_GROUP_ID=sg-xxxxxxxx

DATABASE_URL_PARAM_ARN=arn:aws:ssm:eu-central-1:123456789012:parameter/kereo/prod/DATABASE_URL
JWT_SECRET_PARAM_ARN=arn:aws:ssm:eu-central-1:123456789012:parameter/kereo/prod/JWT_SECRET

GITHUB_WEBHOOK_SECRET=
```

`DATABASE_URL_PARAM_ARN` and `JWT_SECRET_PARAM_ARN` are used in ECS task definitions through the container `secrets` field. Do not pass these values as plaintext ECS environment variables.

## ECS Task Execution Role Permissions

The role referenced by `ECS_TASK_EXECUTION_ROLE_ARN` must be able to pull images, write logs, and read SSM Parameter Store values during task startup.

At minimum, it needs the usual ECS task execution permissions plus:

```json
{
  "Effect": "Allow",
  "Action": ["ssm:GetParameter", "ssm:GetParameters"],
  "Resource": [
    "arn:aws:ssm:eu-central-1:123456789012:parameter/kereo/prod/DATABASE_URL",
    "arn:aws:ssm:eu-central-1:123456789012:parameter/kereo/prod/JWT_SECRET"
  ]
}
```

If the SSM parameters are encrypted with a customer-managed KMS key, also grant `kms:Decrypt` for that key.

## GitHub Webhooks

Kereo can auto-deploy a project when GitHub sends a push webhook.

In your GitHub repository, open:

```text
Settings -> Webhooks -> Add webhook
```

Use:

```text
Payload URL: https://kereo.online/webhooks/github
Content type: application/json
Secret: same value as GITHUB_WEBHOOK_SECRET
Events: Just the push event
```

GitHub signs deliveries with the `X-Hub-Signature-256` header. Kereo verifies this HMAC SHA-256 signature against the raw request body before processing the payload. Normal Postman requests without a valid signature should return `401 Unauthorized`.

The webhook matches projects by:

```text
repository.full_name == project.repoUrl GitHub owner/repo
ref branch == project.branch
```

For example:

```text
repository.full_name: Mortada-Houmani/aws-terraform-fullstack-todo-app
project.repoUrl: https://github.com/Mortada-Houmani/aws-terraform-fullstack-todo-app
```
