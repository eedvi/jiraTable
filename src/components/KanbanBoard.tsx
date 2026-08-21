import { useMemo, useState } from 'react'
import { JiraIssue } from '../types'

interface Transition {
  id: string
  name: string
  to: {
    id: string
    name: string
  }
}

interface Props {
  issues: JiraIssue[]
  loading: boolean
  onIssueClick?: (issueKey: string) => void
  onStatusChange?: () => void
}

interface StatusColumn {
  key: string
  name: string
  issues: JiraIssue[]
}

export default function KanbanBoard({ issues, loading, onIssueClick, onStatusChange }: Props) {
  const columns = useMemo(() => {
    const statusMap = new Map<string, StatusColumn>()

    issues.forEach((issue) => {
      const status = issue.fields.status
      const key = status.statusCategory?.key || 'new'
      const name = status.name

      if (!statusMap.has(name)) {
        statusMap.set(name, {
          key,
          name,
          issues: [],
        })
      }
      statusMap.get(name)!.issues.push(issue)
    })

    // Sort columns: To Do -> In Progress -> Done
    const order = ['new', 'indeterminate', 'done']
    return Array.from(statusMap.values()).sort(
      (a, b) => order.indexOf(a.key) - order.indexOf(b.key)
    )
  }, [issues])

  // Only blank the board on a cold load — a refresh dims what is already there.
  if (loading && issues.length === 0) {
    return <div className="loading">Loading issues...</div>
  }

  if (issues.length === 0) {
    return <div className="no-issues">No issues found</div>
  }

  return (
    <div className={`kanban-board ${loading ? 'is-refreshing' : ''}`} aria-busy={loading}>
      {columns.map((column) => (
        <div key={column.name} className="kanban-column outer-border">
          <div className="kanban-column-header">
            <span className="column-name">{column.name}</span>
            <span className="column-count">{column.issues.length}</span>
          </div>
          <div className="separator"></div>
          <div className="kanban-column-body sunken-panel">
            {column.issues.map((issue) => (
              <KanbanCard
                key={issue.id}
                issue={issue}
                onClick={() => onIssueClick?.(issue.key)}
                onStatusChange={onStatusChange}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

interface CardProps {
  issue: JiraIssue
  onClick?: () => void
  onStatusChange?: () => void
}

function KanbanCard({ issue, onClick, onStatusChange }: CardProps) {
  const { fields } = issue
  const [transitions, setTransitions] = useState<Transition[]>([])
  const [loadingTransitions, setLoadingTransitions] = useState(false)
  const [changing, setChanging] = useState(false)
  const [showStatusSelect, setShowStatusSelect] = useState(false)

  const fetchTransitions = async () => {
    if (transitions.length > 0) return // Already fetched
    setLoadingTransitions(true)
    try {
      const res = await fetch(`/api/issues/${issue.key}/transitions`)
      const data = await res.json()
      setTransitions(data.transitions || [])
    } catch (err) {
      console.error('Failed to fetch transitions:', err)
    } finally {
      setLoadingTransitions(false)
    }
  }

  const handleShowStatus = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowStatusSelect(!showStatusSelect)
    if (!showStatusSelect) {
      fetchTransitions()
    }
  }

  const handleStatusChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    e.stopPropagation()
    const transitionId = e.target.value
    if (!transitionId) return

    setChanging(true)
    try {
      const res = await fetch(`/api/issues/${issue.key}/transitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transitionId })
      })
      if (res.ok) {
        setShowStatusSelect(false)
        onStatusChange?.()
      }
    } catch (err) {
      console.error('Failed to change status:', err)
    } finally {
      setChanging(false)
    }
  }

  const handleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.tagName === 'SELECT' || target.closest('.card-status-select')) {
      return
    }
    e.preventDefault()
    onClick?.()
  }

  const handleCardKeyDown = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick?.()
    }
  }

  return (
    <div
      className="kanban-card"
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleCardKeyDown}
    >
      <div className="card-header">
        <img
          src={fields.issuetype?.iconUrl}
          alt={fields.issuetype?.name}
          className="card-type-icon"
        />
        <span className="card-key">{issue.key}</span>
        {fields.priority && (
          <img
            src={fields.priority.iconUrl}
            alt={fields.priority.name}
            className="card-priority-icon"
            title={fields.priority.name}
          />
        )}
      </div>
      <div className="card-summary">{fields.summary}</div>
      <div className="card-footer">
        {fields.labels && fields.labels.length > 0 && (
          <div className="card-labels">
            {fields.labels.slice(0, 2).map((label) => (
              <span key={label} className="card-label">
                {label}
              </span>
            ))}
          </div>
        )}
        {fields.assignee ? (
          <img
            src={fields.assignee.avatarUrls['24x24']}
            alt={fields.assignee.displayName}
            title={fields.assignee.displayName}
            className="card-avatar"
          />
        ) : (
          <span className="card-unassigned" title="Unassigned">?</span>
        )}
      </div>
      <div className="card-status-select" onClick={(e) => e.stopPropagation()}>
        {!showStatusSelect ? (
          <button
            className="btn status-toggle-btn"
            onClick={handleShowStatus}
            aria-expanded={showStatusSelect}
            aria-label={`Change status of ${issue.key}, currently ${fields.status.name}`}
          >
            → {fields.status.name}
          </button>
        ) : (
          <select
            onChange={handleStatusChange}
            disabled={changing || loadingTransitions}
            defaultValue=""
            autoFocus
            aria-label={`Move ${issue.key} to another status`}
            onKeyDown={(e) => e.key === 'Escape' && setShowStatusSelect(false)}
          >
            <option value="" disabled>
              {loadingTransitions ? 'Loading...' : changing ? 'Changing...' : 'Move to...'}
            </option>
            {transitions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  )
}
