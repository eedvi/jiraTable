import { useState, useEffect } from 'react'
import { readCache, writeCache } from '../lib/cache'

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
  const dateFormatted = date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
  const timeFormatted = date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit'
  })
  return `${dateFormatted} ${timeFormatted}`
}

interface WorklogSummaryProps {
  refreshKey?: number
  silent?: boolean
}

export default function WorklogSummary({ refreshKey, silent }: WorklogSummaryProps) {
  const [period, setPeriod] = useState<'week' | 'month' | 'all'>('week')
  const [data, setData] = useState<WorklogData | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [stale, setStale] = useState(false)

  const fetchWorklogs = async (isSilent: boolean = false) => {
    if (!isSilent) setLoading(true)
    try {
      const res = await fetch(`/api/worklogs?period=${period}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const result = await res.json()
      setData(result)
      setStale(false)
      writeCache(`worklogs:${period}`, result)
    } catch (error) {
      // Offline / API down: keep the cached copy on screen, flagged as stale
      setStale(true)
      console.error('Error fetching worklogs:', error)
    } finally {
      if (!isSilent) setLoading(false)
    }
  }

  useEffect(() => {
    // Paint cached period instantly, then revalidate silently.
    const cached = readCache<WorklogData>(`worklogs:${period}`)
    if (cached) setData(cached)
    fetchWorklogs(!!cached)
  }, [period])

  useEffect(() => {
    if (refreshKey !== undefined && refreshKey > 0) {
      fetchWorklogs(silent ?? false)
    }
  }, [refreshKey])

  const getPeriodLabel = () => {
    switch (period) {
      case 'week': return 'This week (Mon-Sun)'
      case 'month': return 'This month'
      case 'all': return 'Last year'
    }
  }

  return (
    <div className="worklog-summary window">
      <div className={`window-pane worklog-content ${loading && data ? 'is-refreshing' : ''}`} aria-busy={loading}>
        <div className="worklog-header">
          <div className="period-selector">
            <button
              className={`btn ${period === 'week' ? 'btn-default' : ''}`}
              onClick={() => setPeriod('week')}
            >
              Week
            </button>
            <button
              className={`btn ${period === 'month' ? 'btn-default' : ''}`}
              onClick={() => setPeriod('month')}
            >
              Month
            </button>
            <button
              className={`btn ${period === 'all' ? 'btn-default' : ''}`}
              onClick={() => setPeriod('all')}
            >
              All
            </button>
          </div>
        </div>

        {loading && !data ? (
          <div className="loading">Loading...</div>
        ) : data ? (
          <>
            <div className="worklog-total">
              <div className="total-label">
                {getPeriodLabel()}
                {stale && <span className="stale-pill" role="status">offline — cached</span>}
              </div>
              <div className="total-hours">{data.totalHours.toFixed(2)} hours</div>
              <div className="total-time">{formatHours(data.totalSeconds)}</div>
            </div>

            {data.worklogsByIssue.length > 0 && (
              <div className="worklog-details">
                <button
                  className="btn toggle-details"
                  onClick={() => setExpanded(!expanded)}
                >
                  {expanded ? '▲ Hide details' : '▼ View details'}
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
          <div className="no-data">No data available</div>
        )}
      </div>
    </div>
  )
}
