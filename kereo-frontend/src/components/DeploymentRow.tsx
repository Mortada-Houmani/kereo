import { GitCommit, Clock } from 'lucide-react';
import type { DeploymentSummary } from '../lib/api';
import { StatusBadge } from './StatusBadge';
import { timeAgo, shortSha, formatDuration, getPhaseMeta } from '../lib/utils';
import './DeploymentRow.css';

interface Props {
  dep: DeploymentSummary;
  active: boolean;
  onClick: () => void;
}

export function DeploymentRow({ dep, active, onClick }: Props) {
  const phase = getPhaseMeta(dep.phase);

  return (
    <button
      className={`deployment-row ${active ? 'active' : ''}`}
      onClick={onClick}
    >
      <div className="dep-row-top">
        <StatusBadge status={dep.status} size="sm" />
        <span className="dep-phase-label">{dep.phaseLabel ?? phase.label}</span>
        <span className="dep-duration mono">{formatDuration(dep.durationMs)}</span>
      </div>
      <div className="dep-row-bottom">
        {dep.commitSha && (
          <span className="mono dep-meta">
            <GitCommit size={10} strokeWidth={2} />
            {shortSha(dep.commitSha)}
          </span>
        )}
        <span className="dep-meta mono">
          <Clock size={10} strokeWidth={2} />
          {timeAgo(dep.createdAt)}
        </span>
        <span className="dep-id mono">#{dep.id.slice(0, 6)}</span>
      </div>
    </button>
  );
}
