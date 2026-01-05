import { useState, useEffect } from 'react'
import '../styles/index.css'

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
  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${day} ${monthNames[month - 1]}`
}

function getWeekLabel(startStr: string, endStr: string): string {
  return `${formatDate(startStr)} - ${formatDate(endStr)}`
}

function getProgressColor(hours: number, goalHours: number = 40): string {
  const percentage = (hours / goalHours) * 100
  if (percentage >= 100) return '#10b981' // green
  if (percentage >= 80) return '#3b82f6' // blue
  if (percentage >= 50) return '#f59e0b' // amber
  return '#ef4444' // red
}

function getProgressLabel(hours: number, goalHours: number = 40): string {
  const percentage = (hours / goalHours) * 100
  if (percentage >= 100) return 'Excelente'
  if (percentage >= 80) return 'Muy bien'
  if (percentage >= 50) return 'Regular'
  return 'Por debajo'
}

export default function WeeklySummary() {
  const [data, setData] = useState<WeeklySummaryResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [weeksBack, setWeeksBack] = useState(12)
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'daily' | 'tasks'>('daily')

  const fetchWeeklySummary = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/worklogs/weeks?weeksBack=${weeksBack}`)
      const result = await res.json()
      setData(result)
      console.log('Weekly summary data:', result)
    } catch (error) {
      console.error('Error fetching weekly summary:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchWeeklySummary()
  }, [weeksBack])

  if (loading) {
    return (
      <div className="weekly-summary-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Cargando historial de semanas...</p>
        </div>
      </div>
    )
  }

  if (!data || data.totalWeeks === 0) {
    return (
      <div className="weekly-summary-container">
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <h3>No hay datos registrados</h3>
          <p>Comienza a registrar tus horas para ver el historial</p>
        </div>
      </div>
    )
  }

  const totalHours = data.weeks.reduce((sum, week) => sum + week.totalHours, 0)
  const averageHours = data.totalWeeks > 0 ? totalHours / data.totalWeeks : 0
  const weeksAtGoal = data.weeks.filter(w => w.totalHours >= 40).length
  const goalPercentage = data.totalWeeks > 0 ? (weeksAtGoal / data.totalWeeks) * 100 : 0

  return (
    <div className="weekly-summary-container">
      <div className="weekly-summary-header">
        <div className="header-content">
          <h2 className="summary-title">
            <span className="title-icon">📈</span>
            Historial Semanal de Horas
          </h2>
          <p className="summary-subtitle">Análisis detallado de tu registro de tiempo</p>
        </div>
        
        <div className="period-selector">
          <label className="selector-label">Período:</label>
          <select
            value={weeksBack}
            onChange={(e) => setWeeksBack(Number(e.target.value))}
            className="period-select"
          >
            <option value={4}>Último mes (4 semanas)</option>
            <option value={8}>Últimos 2 meses (8 semanas)</option>
            <option value={12}>Últimos 3 meses (12 semanas)</option>
            <option value={24}>Últimos 6 meses (24 semanas)</option>
            <option value={52}>Último año (52 semanas)</option>
          </select>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card stat-primary">
          <div className="stat-icon">⏱️</div>
          <div className="stat-content">
            <div className="stat-label">Total Acumulado</div>
            <div className="stat-value">{totalHours.toFixed(1)}<span className="stat-unit">hrs</span></div>
            <div className="stat-sublabel">{data.totalWeeks} semanas registradas</div>
          </div>
        </div>

        <div className="stat-card stat-secondary">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <div className="stat-label">Promedio Semanal</div>
            <div className="stat-value">{averageHours.toFixed(1)}<span className="stat-unit">hrs</span></div>
            <div className="stat-sublabel">Meta: 40 hrs/semana</div>
          </div>
        </div>

        <div className="stat-card stat-success">
          <div className="stat-icon">🎯</div>
          <div className="stat-content">
            <div className="stat-label">Cumplimiento</div>
            <div className="stat-value">{goalPercentage.toFixed(0)}<span className="stat-unit">%</span></div>
            <div className="stat-sublabel">{weeksAtGoal} de {data.totalWeeks} semanas</div>
          </div>
        </div>
      </div>

      <div className="weeks-list">
        <div className="list-header">
          <h3>Desglose por Semana</h3>
          <span className="list-subtitle">{data.weeks.length} semanas con registro</span>
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
                      <div className="week-meta">{dayCount} día{dayCount !== 1 ? 's' : ''} trabajado{dayCount !== 1 ? 's' : ''}</div>
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
                      <span className="details-header">Desglose Detallado</span>
                      <div className="view-mode-toggle">
                        <button
                          className={`toggle-btn ${viewMode === 'daily' ? 'active' : ''}`}
                          onClick={() => setViewMode('daily')}
                        >
                          📅 Por Día
                        </button>
                        <button
                          className={`toggle-btn ${viewMode === 'tasks' ? 'active' : ''}`}
                          onClick={() => setViewMode('tasks')}
                        >
                          📋 Por Tarea
                        </button>
                      </div>
                    </div>

                    {viewMode === 'daily' ? (
                      <div className="daily-grid">
                        {Object.entries(week.dailyBreakdown)
                          .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
                          .map(([date, hours]) => {
                            const dateObj = new Date(date + 'T00:00:00')
                            const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
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
                          <div className="empty-tasks">No hay tareas registradas</div>
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
