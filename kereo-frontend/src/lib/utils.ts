import type { DeploymentStatus, DeploymentPhase } from '../lib/api';

/** Status → { label, badgeClass, color } */
export function getStatusMeta(status: DeploymentStatus) {
  switch (status) {
    case 'success':   return { label: 'Success',   cls: 'badge-success',   color: 'var(--teal)',   pulse: false };
    case 'failed':    return { label: 'Failed',    cls: 'badge-failed',    color: 'var(--red)',    pulse: false };
    case 'building':  return { label: 'Building',  cls: 'badge-building',  color: 'var(--yellow)', pulse: true  };
    case 'pushing':   return { label: 'Pushing',   cls: 'badge-building',  color: 'var(--yellow)', pulse: true  };
    case 'deploying': return { label: 'Deploying', cls: 'badge-deploying', color: 'var(--blue)',   pulse: true  };
    case 'cloning':   return { label: 'Cloning',   cls: 'badge-building',  color: 'var(--yellow)', pulse: true  };
    case 'queued':    return { label: 'Queued',    cls: 'badge-queued',    color: 'var(--purple)', pulse: false };
    default:          return { label: status,      cls: 'badge-neutral',   color: 'var(--text-secondary)', pulse: false };
  }
}

/** Phase → human label */
export function getPhaseMeta(phase: DeploymentPhase) {
  const map: Record<string, { label: string; step: number }> = {
    queued:   { label: 'Queued',           step: 0 },
    build:    { label: 'Build',            step: 1 },
    database: { label: 'Database',         step: 2 },
    secrets:  { label: 'Secrets',          step: 3 },
    logging:  { label: 'CloudWatch Logs',  step: 4 },
    ecs:      { label: 'ECS Deploy',       step: 5 },
    live:     { label: 'Live',             step: 6 },
    failed:   { label: 'Failed',           step: -1 },
  };
  return map[phase] ?? { label: phase, step: -1 };
}

/** ms → "1m 34s" */
export function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

/** ISO → "2 min ago" / "3 days ago" */
export function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Shorten commit SHA */
export function shortSha(sha: string | null) {
  return sha ? sha.slice(0, 7) : null;
}

/** GitHub repo → display name */
export function repoName(repoUrl: string) {
  return repoUrl.replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/\.git$/, '');
}

/** Extract error summary (first meaningful line) */
export function errorSummary(raw: string | null) {
  if (!raw) return null;
  const lines = raw.split('\n').filter(l => l.trim());
  return lines[0] ?? null;
}

export function errorRecommendation(raw: string | null) {
  if (!raw) return null;
  const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
  const recommendation = lines.find((line) =>
    line.toLowerCase().startsWith('what to do next:'),
  );
  return recommendation ?? null;
}
