import { useState, useEffect } from 'react';
import {
  ExternalLink, GitCommit,
  ChevronDown, ChevronUp, AlertCircle, Database,
  Terminal, ArrowRight, Server
} from 'lucide-react';
import type { DeploymentSummary, DeploymentDetail } from '../lib/api';
import { deploymentsApi } from '../lib/api';
import { StatusBadge } from './StatusBadge';
import {
  getPhaseMeta,
  formatDuration,
  shortSha,
  timeAgo,
  errorSummary,
  errorRecommendation,
} from '../lib/utils';
import './DeploymentDetailPanel.css';

const PHASES = ['queued', 'build', 'database', 'secrets', 'logging', 'ecs', 'live'] as const;

interface Props {
  dep: DeploymentSummary;
}

export function DeploymentDetailPanel({ dep }: Props) {
  const [detail, setDetail] = useState<DeploymentDetail | null>(null);
  const [logsOpen, setLogsOpen] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(true);

  useEffect(() => {
    let cancelled = false;

    deploymentsApi.get(dep.id)
      .then((r) => {
        if (!cancelled) {
          setDetail(r.data);
        }
      })
      .catch(() => null)
      .finally(() => {
        if (!cancelled) {
          setLoadingDetail(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [dep.id]);

  const currentPhaseStep = getPhaseMeta(dep.phase).step;
  const errSummary = errorSummary(dep.errorMessage);
  const errRecommendation = errorRecommendation(dep.errorMessage);

  return (
    <div className="dep-detail-panel scale-in">
      <div className="dep-detail-header-card card">
        <div className="dep-detail-header-top">
          <div className="dep-detail-id-group">
            <span className="section-label">Deployment</span>
            <div className="dep-id-row">
              <span className="dep-detail-id mono">#{dep.id.slice(0, 12)}</span>
              <StatusBadge status={dep.status} />
            </div>
          </div>
          <div className="dep-detail-stats">
            <div className="dep-stat-item">
              <span className="dep-stat-label">Duration</span>
              <span className="dep-stat-value mono">{formatDuration(dep.durationMs)}</span>
            </div>
            <div className="dep-stat-item">
              <span className="dep-stat-label">Created</span>
              <span className="dep-stat-value mono">{timeAgo(dep.createdAt)}</span>
            </div>
          </div>
        </div>

        {dep.status !== 'success' && dep.status !== 'failed' && (
          <div className="deploy-progress-bar">
            <div className="deploy-progress-fill" />
          </div>
        )}

        {/* Phase timeline — Horizontal & Product-grade */}
        <div className="timeline-container">
          <div className="timeline-progress">
            {PHASES.map((phase, idx) => {
              const meta = getPhaseMeta(phase);
              let state: 'done' | 'active' | 'pending' | 'failed' = 'pending';
              
              if (dep.status === 'failed' && dep.phase === phase) state = 'failed';
              else if (dep.status === 'failed' && idx > currentPhaseStep) state = 'pending';
              else if (idx < currentPhaseStep || dep.status === 'success') state = 'done';
              else if (idx === currentPhaseStep) state = 'active';

              return (
                <div key={phase} className={`timeline-step step-${state}`}>
                  <div className="step-dot">
                    {state === 'done' && <div className="step-check" />}
                  </div>
                  <span className="step-label">{meta.label}</span>
                  {idx < PHASES.length - 1 && <div className="step-line" />}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Error Summary — prominent but clean */}
      {dep.status === 'failed' && errSummary && (
        <div className="failure-summary fade-in">
          <div className="failure-summary-icon">
            <AlertCircle size={18} strokeWidth={2.5} />
          </div>
          <div className="failure-summary-content">
            <div className="failure-summary-title">Deployment failed</div>
            <p className="failure-summary-text">{errSummary}</p>
            {errRecommendation ? (
              <p className="failure-summary-text" style={{ marginTop: 8 }}>
                <strong>Suggested fix:</strong> {errRecommendation.replace(/^What to do next:\s*/i, '')}
              </p>
            ) : null}
          </div>
        </div>
      )}

      {/* Details Grid */}
      <div className="dep-meta-grid">
        <div className="dep-meta-card card">
          <span className="section-label" style={{ marginBottom: 12, display: 'block' }}>Infrastructure</span>
          <div className="dep-meta-list">
            {dep.codebuildBuildId && (
              <div className="dep-meta-entry">
                <span className="dep-meta-entry-label"><Terminal size={12} /> Build ID</span>
                <span className="dep-meta-entry-value mono">{dep.codebuildBuildId.split(':').pop()}</span>
              </div>
            )}
            {dep.taskDefinitionArn && (
              <div className="dep-meta-entry">
                <span className="dep-meta-entry-label"><Server size={12} /> Task Definition</span>
                <span className="dep-meta-entry-value mono" title={dep.taskDefinitionArn}>
                  {dep.taskDefinitionArn.split('/').pop()}
                </span>
              </div>
            )}
            {dep.databaseName && (
              <div className="dep-meta-entry">
                <span className="dep-meta-entry-label"><Database size={12} /> Database</span>
                <span className="dep-meta-entry-value mono">{dep.databaseName}</span>
              </div>
            )}
          </div>
        </div>

        <div className="dep-meta-card card">
          <span className="section-label" style={{ marginBottom: 12, display: 'block' }}>Source</span>
          <div className="dep-meta-list">
            {dep.commitSha && (
              <div className="dep-meta-entry">
                <span className="dep-meta-entry-label"><GitCommit size={12} /> Commit</span>
                <span className="dep-meta-entry-value mono">{shortSha(dep.commitSha)}</span>
              </div>
            )}
            {dep.liveUrl && (
              <div className="dep-meta-entry">
                <span className="dep-meta-entry-label"><ExternalLink size={12} /> Live URL</span>
                <a href={dep.liveUrl} target="_blank" rel="noopener noreferrer" className="dep-meta-entry-link">
                  Open Deployment <ArrowRight size={10} />
                </a>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Logs section — Terminal-like */}
      <div className="logs-container card">
        <div className="logs-header">
          <div className="logs-header-left">
            <Terminal size={14} strokeWidth={2} style={{ color: 'var(--text-secondary)' }} />
            <span className="section-label">Deployment Logs</span>
            {loadingDetail && <div className="spinner" style={{ width: 10, height: 10 }} />}
          </div>
          <button 
            className="btn btn-xs btn-ghost" 
            onClick={() => setLogsOpen(!logsOpen)}
          >
            {logsOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {logsOpen ? 'Collapse' : 'Expand'}
          </button>
        </div>

        {logsOpen && (
          <div className="logs-viewer-wrapper">
            <div className="log-block">
              {detail?.logs
                ? detail.logs
                : loadingDetail
                  ? 'Initializing log stream…'
                  : dep.status === 'failed' && dep.errorMessage
                    ? `[ERROR] ${dep.errorMessage}`
                    : 'Log buffer empty.'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
