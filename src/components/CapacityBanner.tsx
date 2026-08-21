import { CapacityData } from '../types'

function getEstimatedColor(percent: number): string {
  if (percent > 100) return 'var(--color-error)'
  if (percent > 80) return 'var(--color-warning)'
  return 'var(--color-success)'
}

function getEstimatedLabel(percent: number): string {
  if (percent > 100) return 'Overloaded'
  if (percent > 80) return 'Near limit'
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
        <span className="capacity-label" id="capacity-estimated-label">Estimated</span>
        <div
          className="capacity-bar-track"
          role="progressbar"
          aria-labelledby="capacity-estimated-label"
          aria-valuenow={data.estimatedPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={`${data.estimatedHours} of ${data.weeklyGoalHours} hours — ${estimatedLabel}`}
        >
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
        <span className="capacity-label" id="capacity-logged-label">Logged</span>
        <div
          className="capacity-bar-track"
          role="progressbar"
          aria-labelledby="capacity-logged-label"
          aria-valuenow={data.loggedPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={`${data.loggedHours} of ${data.weeklyGoalHours} hours logged`}
        >
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
