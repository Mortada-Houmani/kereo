import { GitCommit, ChevronRight } from 'lucide-react';
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
      <div className="dep-row-main">
        <div className="dep-row-header">
          <StatusBadge status={dep.status} size="sm" />
          <span className="dep-row-id mono">#{dep.id.slice(0, 7)}</span>
          <span className="dep-row-time mono">
            {timeAgo(dep.createdAt)}
          </span>
        </div>
        
        <div className="dep-row-info">
          <span className="dep-phase-label">{dep.phaseLabel ?? phase.label}</span>
          <div className="dep-meta-group">
            {dep.commitSha && (
              <span className="chip chip-xs">
                <GitCommit size={10} strokeWidth={2} />
                {shortSha(dep.commitSha)}
              </span>
            )}
            <span className="dep-duration mono">{formatDuration(dep.durationMs)}</span>
          </div>
        </div>
      </div>
      
      <div className="dep-row-chevron">
        <ChevronRight size={14} strokeWidth={2} />
      </div>
    </button>
  );
}
