import type { DeploymentStatus } from '../lib/api';
import { getStatusMeta } from '../lib/utils';

interface StatusBadgeProps {
  status: DeploymentStatus;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const meta = getStatusMeta(status);
  return (
    <span
      className={`badge ${meta.cls}`}
      style={{ fontSize: size === 'sm' ? '.64rem' : undefined }}
    >
      {meta.pulse ? (
        <span className="pulse-dot" style={{ background: meta.color }} />
      ) : (
        <span
          style={{
            width: 6, height: 6,
            borderRadius: '50%',
            background: meta.color,
            display: 'inline-block',
            flexShrink: 0,
          }}
        />
      )}
      {meta.label}
    </span>
  );
}
