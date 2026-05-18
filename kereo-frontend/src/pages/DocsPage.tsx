import {
  BookOpenText,
  Box,
  Database,
  ExternalLink,
  GitBranch,
  HeartPulse,
  KeyRound,
  Rocket,
} from 'lucide-react';

const dockerExamples = {
  vite: `FROM public.ecr.aws/docker/library/node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM public.ecr.aws/nginx/nginx:alpine AS production

COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]`,
  nest: `FROM public.ecr.aws/docker/library/node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM public.ecr.aws/docker/library/node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/main.js"]`,
};

function DocSection({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof BookOpenText;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card docs-section">
      <div className="docs-section-head">
        <div className="docs-section-icon">
          <Icon size={15} strokeWidth={2} />
        </div>
        <h2>{title}</h2>
      </div>
      <div className="docs-section-body">{children}</div>
    </section>
  );
}

export function DocsPage() {
  return (
    <div className="projects-page docs-page">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Docs</h1>
          <div className="page-header-meta">
            <span>Setup patterns, deployment examples, and the small gotchas that matter.</span>
          </div>
        </div>
      </div>

      <div className="docs-grid">
        <DocSection icon={Rocket} title="How Kereo deploys">
          <p>
            Kereo clones your repo in CodeBuild, builds the Docker image you point to, pushes it to ECR,
            then updates the ECS service behind your project domain.
          </p>
          <ul className="docs-list">
            <li><strong>Dockerfile path</strong> and <strong>Build context</strong> are both relative to the repo root.</li>
            <li><strong>Frontend env vars</strong> like <code>VITE_API_URL</code> must exist at build time.</li>
            <li><strong>Backend env vars</strong> are injected into the running container at deploy time.</li>
          </ul>
        </DocSection>

        <DocSection icon={Box} title="Dockerfile examples">
          <p>These examples are safe defaults for the patterns we see most often.</p>
          <div className="docs-code-group">
            <div>
              <div className="section-label">Vite static frontend</div>
              <pre className="log-block"><code>{dockerExamples.vite}</code></pre>
            </div>
            <div>
              <div className="section-label">Nest backend</div>
              <pre className="log-block"><code>{dockerExamples.nest}</code></pre>
            </div>
          </div>
          <ul className="docs-list">
            <li>Use <code>public.ecr.aws/...</code> base images to avoid Docker Hub rate limits.</li>
            <li>If you use multi-stage builds, stage names must match lines like <code>COPY --from=build</code>.</li>
            <li>Vite builds to <code>dist</code>, not <code>build</code>.</li>
          </ul>
        </DocSection>

        <DocSection icon={KeyRound} title="Environment variables">
          <p>Kereo stores project env vars for you. Use the right names for the framework you are deploying.</p>
          <div className="docs-table">
            <div className="docs-table-row">
              <span className="mono">VITE_API_URL</span>
              <span>Frontend API base for Vite apps. Use the full URL, like <code>https://todo-api.kereo.online</code>.</span>
            </div>
            <div className="docs-table-row">
              <span className="mono">DATABASE_URL</span>
              <span>Used by your backend app when it talks to Postgres. Kereo injects this automatically for managed Postgres.</span>
            </div>
            <div className="docs-table-row">
              <span className="mono">PORT</span>
              <span>Kereo passes this into the Docker build and runtime. Your app should listen on it if needed.</span>
            </div>
          </div>
          <ul className="docs-list">
            <li>Frontend static apps need env vars at build time, so redeploy after changing them.</li>
            <li>If a URL env var misses <code>https://</code>, browsers treat it like a relative path.</li>
            <li>Use secret env vars for tokens, API keys, and external database URLs.</li>
          </ul>
        </DocSection>

        <DocSection icon={Database} title="Database modes">
          <p>You can choose the database model per project.</p>
          <div className="docs-table">
            <div className="docs-table-row">
              <span className="mono">No database</span>
              <span>Best for static frontends and apps that do not need persistence.</span>
            </div>
            <div className="docs-table-row">
              <span className="mono">Managed Postgres</span>
              <span>Kereo creates a dedicated database and injects <code>DATABASE_URL</code>.</span>
            </div>
            <div className="docs-table-row">
              <span className="mono">Existing DATABASE_URL</span>
              <span>You provide your own database URL as a secret env var.</span>
            </div>
          </div>
          <p>
            Kereo provisions the database, but your app still needs to run migrations or create tables itself.
          </p>
        </DocSection>

        <DocSection icon={GitBranch} title="GitHub setup">
          <ul className="docs-list">
            <li>Connect your GitHub account from the <strong>Integrations</strong> tab.</li>
            <li>Grant repository access to the Kereo GitHub App for the repos you want to deploy.</li>
            <li>Repos appear only when both are true: <strong>you can access them</strong> and <strong>the app can access them</strong>.</li>
          </ul>
          <p>
            Private repos need a fresh GitHub OAuth login with the right scopes. After changing GitHub auth config,
            sign out and sign in with GitHub again.
          </p>
        </DocSection>

        <DocSection icon={HeartPulse} title="Health checks and common paths">
          <div className="docs-table">
            <div className="docs-table-row">
              <span className="mono">Nest with app.setGlobalPrefix('api')</span>
              <span>Use <code>/api/health</code>.</span>
            </div>
            <div className="docs-table-row">
              <span className="mono">Express route app.get('/health')</span>
              <span>Use <code>/health</code>.</span>
            </div>
            <div className="docs-table-row">
              <span className="mono">Static frontend on nginx</span>
              <span>Use <code>/</code>.</span>
            </div>
          </div>
          <p>
            The health path should match the actual path your container serves after any global prefixes or reverse proxy rules.
          </p>
        </DocSection>

        <DocSection icon={ExternalLink} title="Troubleshooting quick hits">
          <ul className="docs-list">
            <li><strong>405 on API requests from frontend:</strong> check <code>VITE_API_URL</code> and include <code>https://</code>.</li>
            <li><strong>Dockerfile not found:</strong> verify Dockerfile path and build context from the repo root.</li>
            <li><strong>Docker Hub 429 rate limit:</strong> use public ECR base images, or configure Docker Hub auth in platform Terraform.</li>
            <li><strong>Frontend env change did nothing:</strong> redeploy the frontend so the bundle is rebuilt.</li>
            <li><strong>Managed Postgres app boots but tables are missing:</strong> your app still needs migrations.</li>
          </ul>
        </DocSection>
      </div>
    </div>
  );
}
