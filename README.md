# Kereo

Deployment platform monorepo.

## Services

- `kereo-backend`: NestJS API and deployment control plane
- `kereo-frontend`: Vite dashboard served as a static container on ECS

## Project Runtime Types

Kereo supports two Dockerized project runtime presets:

- `web-server`
  - for containers that run their own web server process
  - default port: `3000`
  - default health check path: `/`
- `static-site`
  - for containers that serve built files through nginx or another static web server
  - default port: `80`
  - default health check path: `/`

This is infrastructure-level support only. Kereo will provision the right target-group defaults, but static SPA frameworks may still need their own base-path configuration when hosted under:

```text
/apps/<slug>
```

For example, Vite/React SPAs may need their framework `base` value set explicitly for subpath hosting.

## Production URLs

- Frontend: `https://kereo.online/`
- Backend API: `https://kereo.online/api`
- GitHub webhook endpoint: `https://kereo.online/api/webhooks/github`

## Frontend Deployment

The frontend is built as a static Vite app and packaged into an Nginx container. ECS serves that container behind the shared ALB, while `/api` routes stay pinned to the backend service.

### Build and push the frontend image

```bash
cd kereo-frontend

export AWS_REGION=eu-central-1
export AWS_ACCOUNT_ID=774281170440
export ECR_REPO=kereo-v2-apps
export IMAGE_TAG=frontend-$(date +%Y%m%d%H%M%S)
export IMAGE_URI="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:$IMAGE_TAG"

aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

docker build \
  --build-arg VITE_API_URL=https://kereo.online/api \
  -t "$IMAGE_URI" .

docker push "$IMAGE_URI"
```

### Roll out through Terraform

Set `frontend_container_image` in [`kereo-backend/infra/terraform/terraform.tfvars`](/home/mortada0t/Projects/kereo/kereo-backend/infra/terraform/terraform.tfvars), then apply:

```bash
cd kereo-backend/infra/terraform
terraform apply
```

After apply:

- `https://kereo.online/` should serve the frontend
- `https://kereo.online/api/health` should still serve the backend API

## GitHub Webhook Setup

Kereo can redeploy a project automatically when GitHub sends a `push` event for the repo and branch linked to that project.

### What the user needs before setup

- A project already created in Kereo
- The project `repoUrl` must match the GitHub repository exactly
- The project `branch` must match the branch you want GitHub to deploy from
- The GitHub webhook secret must match the value configured in Kereo backend

### GitHub setup steps

In the GitHub repository, open:

```text
Settings -> Webhooks -> Add webhook
```

Use these values:

```text
Payload URL: https://kereo.online/api/webhooks/github
Content type: application/json
Secret: same value as GITHUB_WEBHOOK_SECRET
Events: Just the push event
Active: checked
```

### How matching works

Kereo will trigger a deployment only when both match:

```text
repository.full_name == project.repoUrl owner/repo
ref branch == project.branch
```

Example:

```text
GitHub repository: Mortada-Houmani/aws-terraform-fullstack-todo-app
Project repoUrl:   https://github.com/Mortada-Houmani/aws-terraform-fullstack-todo-app
Project branch:    main
```

### Expected result

After a push to the configured branch:

- GitHub sends a `push` webhook to Kereo
- Kereo verifies the signature using `GITHUB_WEBHOOK_SECRET`
- Kereo finds the matching project by repo + branch
- A new deployment is created automatically

### Troubleshooting

- `404 Not Found`: make sure the payload URL includes `/api/webhooks/github`
- `401 Unauthorized`: webhook secret does not match `GITHUB_WEBHOOK_SECRET`
- No deployment created: check that the GitHub repo and branch exactly match the Kereo project
- Webhook delivered but nothing changed: verify the project exists in Kereo and targets the pushed branch
