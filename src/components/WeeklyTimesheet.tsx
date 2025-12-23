import { useState, useEffect } from 'react'

interface DailyData {
  date: string
  dayName: string
  totalSeconds: number
  totalHours: number
  goalHours: number
  progress: number
  worklogs: {
    issueKey: string
    summary: string
    timeSpentSeconds: number
    started: string
    from: string
    to: string
  }[]
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

// function formatDate(dateStr: string): string {
//   const date = new Date(dateStr)
//   const day = date.getDate()
//   const month = date.getMonth() + 1
//   return `${day}/${month}`
// }

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-')
  return `${day}/${Number(month)}`
}


export default function WeeklyTimesheet() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [data, setData] = useState<TimesheetData | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedDay, setExpandedDay] = useState<string | null>(null)

  const fetchTimesheet = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/worklogs/daily?weekOffset=${weekOffset}`)
      const result = await res.json()
      setData(result)
    } catch (err) {
      console.error('Error fetching timesheet:', err)
    } finally {
      setLoading(false)
    }
  }

  // useEffect(() => {
  //   fetchTimesheet()
  // }, [])

  useEffect(() => {
  fetchTimesheet()
}, [weekOffset])

  const getProgressColor = (progress: number): string => {
    if (progress >= 100) return 'success'
    if (progress >= 75) return 'warning'
    return 'danger'
  }

  const todayKey = (): string =>
  new Date().toLocaleDateString('sv-SE')

  const isToday = (dateStr: string): boolean => {
    // const today = new Date().toISOString().split('T')[0]
    // return dateStr === today
    return dateStr === todayKey()
  }

  const isPastDay = (dateStr: string): boolean => {
    // const today = new Date().toISOString().split('T')[0]
    // return dateStr < today
    return dateStr < todayKey()
  }

  return (
    <div className="timesheet window">
      <div className="title-bar">
        <button aria-label="Close" className="close"></button>
        <h1 className="title">Control Semanal</h1>
        <button aria-label="Resize" className="resize"></button>
      </div>
      <div className="separator"></div>

      {/* <div className="week-navigation">
        <button onClick={() => setWeekOffset(w => w - 1)}>⬅️</button>

        {data && (
          <span className="week-range">
            {formatDate(data.weekStart)} – {formatDate(data.weekEnd)}
          </span>
        )}

        <button
          onClick={() => setWeekOffset(w => w + 1)}
          disabled={weekOffset === 0}
        >
          ➡️
        </button>
      </div> */}

      <div className="week-navigation">
        <button
          className="nav-btn"
          onClick={() => setWeekOffset(w => w - 1)}
          title="Semana anterior"
        >
          ⬅️
        </button>

        {data && (
          <span className="week-range">
            {formatDate(data.weekStart)} – {formatDate(data.weekEnd)}
          </span>
        )}

        <button
          className="nav-btn"
          onClick={() => setWeekOffset(w => w + 1)}
          disabled={weekOffset === 0}
          title="Semana siguiente"
        >
          ➡️
        </button>
        {weekOffset !== 0 && (
          <button
            className="nav-btn"
            onClick={() => setWeekOffset(0)}
            disabled={weekOffset === 0}
            title="Ir a la semana actual"
          >
            Hoy
          </button>
        )}
      </div>



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

                return (
                  <div
                    key={day.date}
                    className={`day-card ${today ? 'today' : ''} ${past && day.totalHours < day.goalHours ? 'incomplete' : ''}`}
                  >
                    <div className="day-header">
                      <div className="day-info">
                        <span className="day-name">{day.dayName}</span>
                        <span className="day-date">{formatDate(day.date)}</span>
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
                        {isExpanded ? '▲' : '▼'} {day.worklogs.length} {day.worklogs.length === 1 ? 'registro' : 'registros'}
                      </button>
                    )}

                    {isExpanded && hasWorklogs && (
                      <div className="day-worklogs">
                        {day.worklogs.map((log, idx) => (
                          <div key={idx} className="worklog-item">
                            <div className="worklog-main">
                              <a
                                href={`https://tribal-mnc.atlassian.net/browse/${log.issueKey}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="worklog-issue"
                              >
                                {log.issueKey}
                              </a>
                              <span className="worklog-range">
                                {log.from} – {log.to}
                              </span>
                            </div>

                            <span className="worklog-time">
                              {formatHours(log.timeSpentSeconds)}
                            </span>
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
