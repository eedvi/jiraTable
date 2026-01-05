import { useState, useEffect } from 'react'

interface WorklogData {
  period: string
  totalSeconds: number
  totalHours: number
  worklogsByIssue: {
    issueKey: string
    summary: string
    totalSeconds: number
    worklogs: {
      id: string
      timeSpentSeconds: number
      started: string
      comment?: any
    }[]
  }[]
}

function formatHours(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${hours}h ${minutes}m`
}

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr)
  const dateFormatted = date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
  const timeFormatted = date.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit'
  })
  return `${dateFormatted} ${timeFormatted}`
}

export default function WorklogSummary() {
  const [period, setPeriod] = useState<'week' | 'month' | 'all'>('week')
  const [data, setData] = useState<WorklogData | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const fetchWorklogs = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/worklogs?period=${period}`)
      const result = await res.json()
      setData(result)
    } catch (err) {
      console.error('Error fetching worklogs:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchWorklogs()
  }, [period])

  const getPeriodLabel = () => {
    switch (period) {
      case 'week': return 'Esta semana (Lun-Dom)'
      case 'month': return 'Este mes'
      case 'all': return 'Último año'
    }
  }

  return (
    <div className="worklog-summary window">
      <div className="title-bar">
        <button aria-label="Close" className="close"></button>
        <h1 className="title">Tiempo Logeado</h1>
        <button aria-label="Resize" className="resize"></button>
      </div>
      <div className="separator"></div>

      <div className="window-pane worklog-content">
        <div className="worklog-header">
          <div className="period-selector">
            <button
              className={`btn ${period === 'week' ? 'btn-default' : ''}`}
              onClick={() => setPeriod('week')}
            >
              Semana
            </button>
            <button
              className={`btn ${period === 'month' ? 'btn-default' : ''}`}
              onClick={() => setPeriod('month')}
            >
              Mes
            </button>
            <button
              className={`btn ${period === 'all' ? 'btn-default' : ''}`}
              onClick={() => setPeriod('all')}
            >
              Todo
            </button>
          </div>
        </div>

        {loading ? (
          <div className="loading">Cargando...</div>
        ) : data ? (
          <>
            <div className="worklog-total">
              <div className="total-label">{getPeriodLabel()}</div>
              <div className="total-hours">{data.totalHours.toFixed(2)} horas</div>
              <div className="total-time">{formatHours(data.totalSeconds)}</div>
            </div>

            {data.worklogsByIssue.length > 0 && (
              <div className="worklog-details">
                <button
                  className="btn toggle-details"
                  onClick={() => setExpanded(!expanded)}
                >
                  {expanded ? '▲ Ocultar detalles' : '▼ Ver detalles'}
                </button>

                {expanded && (
                  <div className="worklog-list">
                    {data.worklogsByIssue.map((item) => (
                      <div key={item.issueKey} className="worklog-issue">
                        <div className="issue-header">
                          <a
                            href={`https://tribal-mnc.atlassian.net/browse/${item.issueKey}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="issue-link"
                          >
                            {item.issueKey}
                          </a>
                          <span className="issue-summary">{item.summary}</span>
                          <span className="issue-total">{formatHours(item.totalSeconds)}</span>
                        </div>
                        <div className="worklog-entries">
                          {item.worklogs.map((log) => (
                            <div key={log.id} className="worklog-entry">
                              <span className="worklog-datetime">
                                {formatDateTime(log.started)}
                              </span>
                              <span className="worklog-time">{formatHours(log.timeSpentSeconds)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="no-data">No hay datos disponibles</div>
        )}
      </div>
    </div>
  )
}
