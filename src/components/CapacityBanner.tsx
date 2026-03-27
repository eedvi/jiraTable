import { CapacityData } from '../types'

function getEstimatedColor(percent: number): string {
  if (percent > 100) return 'var(--color-error)'
  if (percent > 80) return 'var(--color-warning, #f59e0b)'
  return 'var(--color-success)'
}

function getEstimatedLabel(percent: number): string {
  if (percent > 100) return 'Sobrecarga'
  if (percent > 80) return 'Cerca del limite'
  return 'OK'
}

interface CapacityBannerProps {
  data: CapacityData | null
}

export default function CapacityBanner({ data }: CapacityBannerProps) {
  if (!data) return null

  const estimatedColor = getEstimatedColor(data.estimatedPercent)
  const estimatedLabel = getEstimatedLabel(data.estimatedPercent)

  return (
    <div className="capacity-banner">
      <div className="capacity-row">
        <span className="capacity-label">Estimado</span>
        <div className="capacity-bar-track">
          <div
            className="capacity-bar-fill capacity-bar-estimated"
            style={{
              width: `${Math.min(data.estimatedPercent, 100)}%`,
              backgroundColor: estimatedColor
            }}
          />
        </div>
        <span className="capacity-value">{data.estimatedHours}h / {data.weeklyGoalHours}h</span>
        <span className="capacity-status" style={{ color: estimatedColor }}>
          {estimatedLabel}
        </span>
      </div>
      <div className="capacity-row">
        <span className="capacity-label">Registrado</span>
        <div className="capacity-bar-track">
          <div
            className="capacity-bar-fill capacity-bar-logged"
            style={{
              width: `${Math.min(data.loggedPercent, 100)}%`
            }}
          />
        </div>
        <span className="capacity-value">{data.loggedHours}h / {data.weeklyGoalHours}h</span>
        <span className="capacity-status capacity-status-tickets">
          {data.ticketCount} tickets
        </span>
      </div>
    </div>
  )
}
