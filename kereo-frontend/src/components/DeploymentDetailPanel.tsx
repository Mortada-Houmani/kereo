import { useState, useEffect } from 'react';
import {
  ExternalLink, GitCommit, Clock, Hash,
  ChevronDown, ChevronUp, AlertTriangle, Database,
} from 'lucide-react';
import type { DeploymentSummary, DeploymentDetail } from '../lib/api';
import { deploymentsApi } from '../lib/api';
import { StatusBadge } from './StatusBadge';
import { getPhaseMeta, formatDuration, shortSha, timeAgo, errorSummary } from '../lib/utils';
import './DeploymentDetailPanel.css';

const PHASES = ['queued', 'build', 'database', 'secrets', 'logging', 'ecs', 'live'] as const;

interface Props {
  dep: DeploymentSummary;
}

export function DeploymentDetailPanel({ dep }: Props) {
  const [detail, setDetail] = useState<DeploymentDetail | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    setDetail(null);
    setLogsOpen(false);
    setLoadingDetail(true);
    deploymentsApi.get(dep.id)
      .then(r => setDetail(r.data))
      .catch(() => null)
      .finally(() => setLoadingDetail(false));
  }, [dep.id]);

  const currentPhaseStep = getPhaseMeta(dep.phase).step;
  const errSummary = errorSummary(dep.errorMessage);

  return (
    <div className="dep-detail-panel card fade-in">
      <div className="dep-detail-header">
        <div>
          <StatusBadge status={dep.status} />
          <span className="dep-detail-id mono">#{dep.id.slice(0, 8)}</span>
        </div>
        <div className="dep-detail-times">
          <span className="mono">
            <Clock size={11} strokeWidth={2} />
            {timeAgo(dep.createdAt)}
          </span>
          <span className="mono">
            {formatDuration(dep.durationMs)}
          </span>
        </div>
      </div>

      {/* Phase timeline */}
      <div className="phase-timeline">
        {PHASES.map((phase, idx) => {
          const meta = getPhaseMeta(phase);
          let state: 'done' | 'active' | 'pending' | 'failed' = 'pending';
          if (dep.status === 'failed' && dep.phase === phase) state = 'failed';
          else if (dep.status === 'failed' && idx > currentPhaseStep) state = 'pending';
          else if (idx < currentPhaseStep || dep.status === 'success') state = 'done';
          else if (idx === currentPhaseStep) state = 'active';

          return (
            <div key={phase} className={`phase-item phase-${state}`}>
              <div className="phase-dot" />
              {idx < PHASES.length - 1 && <div className="phase-connector" />}
              <span className="phase-label">{meta.label}</span>
            </div>
          );
        })}
      </div>

      {/* Error summary */}
      {dep.status === 'failed' && errSummary && (
        <div className="dep-error-box">
          <div className="dep-error-title">
            <AlertTriangle size={13} strokeWidth={2} />
            Failure reason
          </div>
          <p className="dep-error-text">{errSummary}</p>
        </div>
      )}

      {/* Metadata */}
      <div className="dep-detail-meta">
        {dep.commitSha && (
          <div className="dep-meta-row">
            <span className="dep-meta-label"><GitCommit size={11} /> Commit</span>
            <span className="dep-meta-value mono">{shortSha(dep.commitSha)}</span>
          </div>
        )}
        {dep.liveUrl && (
          <div className="dep-meta-row">
            <span className="dep-meta-label"><ExternalLink size={11} /> Live URL</span>
            <a href={dep.liveUrl} target="_blank" rel="noopener noreferrer" className="dep-meta-link">
              {dep.liveUrl.replace(/^https?:\/\//, '')}
            </a>
          </div>
        )}
        {dep.codebuildBuildId && (
          <div className="dep-meta-row">
            <span className="dep-meta-label"><Hash size={11} /> Build ID</span>
            <span className="dep-meta-value mono">{dep.codebuildBuildId.split(':').pop()}</span>
          </div>
        )}
        {dep.codebuildStatus && (
          <div className="dep-meta-row">
            <span className="dep-meta-label"><Hash size={11} /> Build Status</span>
            <span className="dep-meta-value mono">{dep.codebuildStatus}</span>
          </div>
        )}
        {dep.taskDefinitionArn && (
          <div className="dep-meta-row">
            <span className="dep-meta-label"><Hash size={11} /> Task Def</span>
            <span className="dep-meta-value mono" title={dep.taskDefinitionArn}>
              {dep.taskDefinitionArn.split('/').pop()}
            </span>
          </div>
        )}
        {dep.databaseName && (
          <div className="dep-meta-row">
            <span className="dep-meta-label"><Database size={11} /> DB Name</span>
            <span className="dep-meta-value mono">{dep.databaseName}</span>
          </div>
        )}
      </div>

      {/* Logs expander */}
      <div className="dep-logs-section">
        <button
          className="dep-logs-toggle"
          onClick={() => setLogsOpen(o => !o)}
        >
          {logsOpen ? <ChevronUp size={14} strokeWidth={2} /> : <ChevronDown size={14} strokeWidth={2} />}
          {logsOpen ? 'Hide logs' : 'Show logs'}
          {loadingDetail && <span className="spinner" style={{ width: 12, height: 12, marginLeft: 6 }} />}
        </button>
        {logsOpen && (
          <div className="log-block" style={{ marginTop: 10 }}>
            {detail?.logs
              ? detail.logs
              : loadingDetail
                ? 'Loading logs…'
                : dep.status === 'failed' && dep.errorMessage
                  ? dep.errorMessage
                  : 'No logs available.'}
          </div>
        )}
      </div>
    </div>
  );
}
