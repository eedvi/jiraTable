import { useState, useEffect } from 'react'
import { readCache, writeCache } from '../lib/cache'

interface DayBreakdown {
  [date: string]: number
}

interface IssueBreakdown {
  issueKey: string
  summary: string
  hours: number
}

interface WeekData {
  weekStart: string
  weekEnd: string
  totalSeconds: number
  totalHours: number
  dailyBreakdown: DayBreakdown
  issues: IssueBreakdown[]
}

interface WeeklySummaryResponse {
  weeksBack: number
  totalWeeks: number
  weeks: WeekData[]
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  const day = date.getDate()
  const month = date.getMonth() + 1
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${day} ${monthNames[month - 1]}`
}

function getWeekLabel(startStr: string, endStr: string): string {
  return `${formatDate(startStr)} - ${formatDate(endStr)}`
}

function getProgressColor(hours: number, goalHours: number = 40): string {
  const percentage = (hours / goalHours) * 100
  if (percentage >= 100) return 'var(--color-success)'
  if (percentage >= 80) return 'var(--color-accent)'
  if (percentage >= 50) return 'var(--color-warning)'
  return 'var(--color-danger)'
}

function getProgressLabel(hours: number, goalHours: number = 40): string {
  const percentage = (hours / goalHours) * 100
  if (percentage >= 100) return 'Excellent'
  if (percentage >= 80) return 'Good'
  if (percentage >= 50) return 'Fair'
  return 'Below'
}

interface WeeklySummaryProps {
  refreshKey?: number
  silent?: boolean
}

export default function WeeklySummary({ refreshKey, silent }: WeeklySummaryProps) {
  const [data, setData] = useState<WeeklySummaryResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [revalidating, setRevalidating] = useState(false)
  const [weeksBack, setWeeksBack] = useState(12)
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'daily' | 'tasks'>('daily')
  const [stale, setStale] = useState(false)

  const fetchWeeklySummary = async (isSilent: boolean = false) => {
    if (!isSilent) setLoading(true)
    else setRevalidating(true)
    try {
      const res = await fetch(`/api/worklogs/weeks?weeksBack=${weeksBack}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const result = await res.json()
      setData(result)
      setStale(false)
      writeCache(`weeks:${weeksBack}`, result)
    } catch (error) {
      // Offline / API down: keep what we have (likely the cache), flagged stale
      setStale(true)
      console.error('Error fetching weekly summary:', error)
    } finally {
      if (!isSilent) setLoading(false)
      else setRevalidating(false)
    }
  }

  useEffect(() => {
    // Paint the cached copy immediately, then revalidate in the background.
    const cached = readCache<WeeklySummaryResponse>(`weeks:${weeksBack}`)
    if (cached) setData(cached)
    fetchWeeklySummary(!!cached)
  }, [weeksBack])

  useEffect(() => {
    if (refreshKey !== undefined && refreshKey > 0) {
      fetchWeeklySummary(silent ?? false)
    }
  }, [refreshKey])

  if (loading && !data) {
    return (
      <div className="weekly-summary-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading week history...</p>
        </div>
      </div>
    )
  }

  if (!data || data.totalWeeks === 0) {
    return (
      <div className="weekly-summary-container">
        <div className="empty-state">
          <h3>No data recorded</h3>
          <p>Start logging your hours to see the history</p>
        </div>
      </div>
    )
  }

  const totalHours = data.weeks.reduce((sum, week) => sum + week.totalHours, 0)
  const averageHours = data.totalWeeks > 0 ? totalHours / data.totalWeeks : 0
  const weeksAtGoal = data.weeks.filter(w => w.totalHours >= 40).length
  const goalPercentage = data.totalWeeks > 0 ? (weeksAtGoal / data.totalWeeks) * 100 : 0

  return (
    <div className={`weekly-summary-container ${loading ? 'is-refreshing' : ''}`} aria-busy={loading || revalidating}>
      <div className="weekly-summary-header">
        <div className="header-content">
          <h2 className="summary-title">
            Weekly Hours History
          </h2>
          <p className="summary-subtitle">
            Detailed analysis of your time tracking
            {revalidating && <span className="sync-pill" role="status">updating…</span>}
            {stale && <span className="stale-pill" role="status">offline — cached</span>}
          </p>
        </div>
        
        <div className="period-selector">
          <label className="selector-label">Period:</label>
          <select
            value={weeksBack}
            onChange={(e) => setWeeksBack(Number(e.target.value))}
            className="period-select"
          >
            <option value={4}>Last month (4 weeks)</option>
            <option value={8}>Last 2 months (8 weeks)</option>
            <option value={12}>Last 3 months (12 weeks)</option>
            <option value={24}>Last 6 months (24 weeks)</option>
            <option value={52}>Last year (52 weeks)</option>
          </select>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card stat-primary">
          <div className="stat-content">
            <div className="stat-label">Total Accumulated</div>
            <div className="stat-value">{totalHours.toFixed(1)}<span className="stat-unit">hrs</span></div>
            <div className="stat-sublabel">{data.totalWeeks} weeks recorded</div>
          </div>
        </div>

        <div className="stat-card stat-secondary">
          <div className="stat-content">
            <div className="stat-label">Weekly Average</div>
            <div className="stat-value">{averageHours.toFixed(1)}<span className="stat-unit">hrs</span></div>
            <div className="stat-sublabel">Goal: 40 hrs/week</div>
          </div>
        </div>

        <div className="stat-card stat-success">
          <div className="stat-content">
            <div className="stat-label">Goal Completion</div>
            <div className="stat-value">{goalPercentage.toFixed(0)}<span className="stat-unit">%</span></div>
            <div className="stat-sublabel">{weeksAtGoal} of {data.totalWeeks} weeks</div>
          </div>
        </div>
      </div>

      <div className="weeks-list">
        <div className="list-header">
          <h3>Weekly Breakdown</h3>
          <span className="list-subtitle">{data.weeks.length} weeks with records</span>
        </div>

        <div className="weeks-container">
          {data.weeks.map((week, index) => {
            const progressPercentage = (week.totalHours / 40) * 100
            const isExpanded = expandedWeek === week.weekStart
            const dayCount = Object.keys(week.dailyBreakdown).length
            const progressColor = getProgressColor(week.totalHours)
            const progressLabel = getProgressLabel(week.totalHours)
            const isRecent = index < 2

            return (
              <div key={week.weekStart} className={`week-card ${isRecent ? 'week-recent' : ''}`}>
                <button
                  onClick={() => setExpandedWeek(isExpanded ? null : week.weekStart)}
                  className="week-header"
                >
                  <div className="week-info">
                    <div className="week-badge" style={{ backgroundColor: progressColor }}>
                      {progressLabel}
                    </div>
                    <div className="week-dates">
                      <div className="week-range">{getWeekLabel(week.weekStart, week.weekEnd)}</div>
                      <div className="week-meta">{dayCount} day{dayCount !== 1 ? 's' : ''} worked</div>
                    </div>
                  </div>

                  <div className="week-progress">
                    <div className="progress-info">
                      <span className="progress-hours">{week.totalHours.toFixed(1)} hrs</span>
                      <span className="progress-percent">{progressPercentage.toFixed(0)}%</span>
                    </div>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${Math.min(progressPercentage, 100)}%`,
                          backgroundColor: progressColor
                        }}
                      />
                    </div>
                  </div>

                  <span className={`expand-icon ${isExpanded ? 'expanded' : ''}`}>▶</span>
                </button>

                {isExpanded && (
                  <div className="week-details">
                    <div className="details-header-row">
                      <span className="details-header">Detailed Breakdown</span>
                      <div className="view-mode-toggle">
                        <button
                          className={`toggle-btn ${viewMode === 'daily' ? 'active' : ''}`}
                          onClick={() => setViewMode('daily')}
                        >
                          By Day
                        </button>
                        <button
                          className={`toggle-btn ${viewMode === 'tasks' ? 'active' : ''}`}
                          onClick={() => setViewMode('tasks')}
                        >
                          By Task
                        </button>
                      </div>
                    </div>

                    {viewMode === 'daily' ? (
                      <div className="daily-grid">
                        {Object.entries(week.dailyBreakdown)
                          .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
                          .map(([date, hours]) => {
                            const dateObj = new Date(date + 'T00:00:00')
                            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
                            const dayName = dayNames[dateObj.getDay()]
                            const dateFormatted = formatDate(date)
                            const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6

                            return (
                              <div key={date} className={`daily-item ${isWeekend ? 'weekend' : ''}`}>
                                <div className="daily-day">
                                  <span className="day-name">{dayName}</span>
                                  <span className="day-date">{dateFormatted}</span>
                                </div>
                                <div className="daily-hours">
                                  {hours.toFixed(2)} <span className="hours-label">hrs</span>
                                </div>
                              </div>
                            )
                          })}
                      </div>
                    ) : (
                      <div className="tasks-grid">
                        {week.issues && week.issues.length > 0 ? (
                          week.issues.map((issue) => (
                            <div key={issue.issueKey} className="task-item">
                              <div className="task-info">
                                <div className="task-key">{issue.issueKey}</div>
                                <div className="task-summary">{issue.summary}</div>
                              </div>
                              <div className="task-hours">
                                {issue.hours.toFixed(2)} <span className="hours-label">hrs</span>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="empty-tasks">No tasks recorded</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
