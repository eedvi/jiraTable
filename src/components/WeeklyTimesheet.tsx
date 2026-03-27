import { useState, useEffect } from 'react'

interface Worklog {
  issueKey: string
  summary: string
  timeSpentSeconds: number
  started: string
}

interface WorklogWithConflict extends Worklog {
  hasConflict: boolean
  conflictsWith: number[]
  startTime: Date
  endTime: Date
}

interface DailyData {
  date: string
  dayName: string
  totalSeconds: number
  totalHours: number
  goalHours: number
  progress: number
  worklogs: Worklog[]
}

interface TimesheetData {
  weekStart: string
  weekEnd: string
  dailyData: DailyData[]
  totalSeconds: number
  totalHours: number
  weeklyGoalHours: number
  weeklyProgress: number
}

function formatHours(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${hours}h ${minutes}m`
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const day = date.getDate()
  const month = date.getMonth() + 1
  return `${day}/${month}`
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

function detectTimeConflicts(worklogs: Worklog[]): WorklogWithConflict[] {
  const worklogsWithTimes: WorklogWithConflict[] = worklogs.map(log => {
    const startTime = new Date(log.started)
    const endTime = new Date(startTime.getTime() + log.timeSpentSeconds * 1000)
    return {
      ...log,
      startTime,
      endTime,
      hasConflict: false,
      conflictsWith: []
    }
  })

  // Check for conflicts
  for (let i = 0; i < worklogsWithTimes.length; i++) {
    for (let j = i + 1; j < worklogsWithTimes.length; j++) {
      const log1 = worklogsWithTimes[i]
      const log2 = worklogsWithTimes[j]

      // Check if times overlap
      const hasOverlap = (
        (log1.startTime < log2.endTime && log1.endTime > log2.startTime) ||
        (log2.startTime < log1.endTime && log2.endTime > log1.startTime)
      )

      if (hasOverlap) {
        log1.hasConflict = true
        log2.hasConflict = true
        log1.conflictsWith.push(j)
        log2.conflictsWith.push(i)
      }
    }
  }

  return worklogsWithTimes
}

interface WeeklyTimesheetProps {
  refreshKey?: number
  silent?: boolean
}

export default function WeeklyTimesheet({ refreshKey, silent }: WeeklyTimesheetProps) {
  const [data, setData] = useState<TimesheetData | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedDay, setExpandedDay] = useState<string | null>(null)

  const fetchTimesheet = async (isSilent: boolean = false) => {
    if (!isSilent) setLoading(true)
    try {
      const res = await fetch('/api/worklogs/daily')
      const result = await res.json()
      setData(result)
    } catch (err) {
      console.error('Error fetching timesheet:', err)
    } finally {
      if (!isSilent) setLoading(false)
    }
  }

  useEffect(() => {
    fetchTimesheet()
  }, [])

  useEffect(() => {
    if (refreshKey !== undefined && refreshKey > 0) {
      fetchTimesheet(silent ?? false)
    }
  }, [refreshKey])

  const getProgressColor = (progress: number): string => {
    if (progress >= 100) return 'success'
    if (progress >= 75) return 'warning'
    return 'danger'
  }

  const isToday = (dateStr: string): boolean => {
    const today = new Date().toISOString().split('T')[0]
    return dateStr === today
  }

  const isPastDay = (dateStr: string): boolean => {
    const today = new Date().toISOString().split('T')[0]
    return dateStr < today
  }

  return (
    <div className="timesheet window">
      <div className="title-bar">
        <button aria-label="Close" className="close"></button>
        <h1 className="title">Control Semanal</h1>
        <button aria-label="Resize" className="resize"></button>
      </div>
      <div className="separator"></div>

      <div className="window-pane timesheet-content">
        {loading ? (
          <div className="loading">Cargando...</div>
        ) : data ? (
          <>
            <div className="timesheet-header">
              <div className="week-info">
                <span className="week-label">Semana:</span>
                <span className="week-dates">{formatDate(data.weekStart)} - {formatDate(data.weekEnd)}</span>
              </div>
              <div className="week-summary">
                <div className="summary-item">
                  <span className="label">Total:</span>
                  <span className="value">{data.totalHours}h / {data.weeklyGoalHours}h</span>
                </div>
                <div className="progress-bar">
                  <div
                    className={`progress-fill ${getProgressColor(data.weeklyProgress)}`}
                    style={{ width: `${Math.min(data.weeklyProgress, 100)}%` }}
                  >
                    {data.weeklyProgress}%
                  </div>
                </div>
              </div>
            </div>

            <div className="daily-grid">
              {data.dailyData.map((day) => {
                const isExpanded = expandedDay === day.date
                const today = isToday(day.date)
                const past = isPastDay(day.date)
                const hasWorklogs = day.worklogs.length > 0
                const worklogsWithConflicts = hasWorklogs ? detectTimeConflicts(day.worklogs) : []
                const hasAnyConflict = worklogsWithConflicts.some(w => w.hasConflict)

                return (
                  <div
                    key={day.date}
                    className={`day-card ${today ? 'today' : ''} ${past && day.totalHours < day.goalHours ? 'incomplete' : ''}`}
                  >
                    <div className="day-header">
                      <div className="day-info">
                        <span className="day-name">{day.dayName}</span>
                        <span className="day-date">{formatDate(day.date)}</span>
                        {hasAnyConflict && <span className="conflict-badge" title="Hay conflictos de horario">!</span>}
                      </div>
                      {today && <span className="today-badge">HOY</span>}
                    </div>

                    <div className="day-progress">
                      <div className="hours-display">
                        <span className={`hours ${day.progress >= 100 ? 'complete' : ''}`}>
                          {day.totalHours}h
                        </span>
                        <span className="goal">/ {day.goalHours}h</span>
                      </div>
                      <div className="progress-bar small">
                        <div
                          className={`progress-fill ${getProgressColor(day.progress)}`}
                          style={{ width: `${Math.min(day.progress, 100)}%` }}
                        />
                      </div>
                      <div className="progress-text">
                        <span className={getProgressColor(day.progress)}>
                          {day.progress}%
                        </span>
                        {day.progress < 100 && past && (
                          <span className="deficit">-{formatHours((day.goalHours * 3600) - day.totalSeconds)}</span>
                        )}
                      </div>
                    </div>

                    {hasWorklogs && (
                      <button
                        className="btn toggle-worklogs"
                        onClick={() => setExpandedDay(isExpanded ? null : day.date)}
                      >
                        {isExpanded ? '−' : '+'} {day.worklogs.length} {day.worklogs.length === 1 ? 'registro' : 'registros'}
                      </button>
                    )}

                    {isExpanded && hasWorklogs && (
                      <div className="day-worklogs">
                        {worklogsWithConflicts
                          .sort((a, b) => new Date(a.started).getTime() - new Date(b.started).getTime())
                          .map((log, idx) => (
                          <div key={idx} className={`worklog-item-compact ${log.hasConflict ? 'has-conflict' : ''}`}>
                            <span className="conflict-icon-space"></span>
                            <a
                              href={`https://tribal-mnc.atlassian.net/browse/${log.issueKey}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="worklog-issue-link"
                            >
                              {log.issueKey}
                            </a>
                            <span className="worklog-timerange">
                              {formatTime(log.started)} - {formatTime(log.endTime.toISOString())}
                            </span>
                            <span className="worklog-duration">{formatHours(log.timeSpentSeconds)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <div className="no-data">No hay datos disponibles</div>
        )}
      </div>
    </div>
  )
}
