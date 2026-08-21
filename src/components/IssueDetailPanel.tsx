import { useState, useEffect } from 'react'
import { IssueDetail } from '../types'

interface Props {
  issue: IssueDetail
  loading: boolean
  onClose: () => void
  onUpdate: () => void
}

function formatTime(seconds: number | undefined): string {
  if (!seconds) return '-'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
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

function parseTimeToSeconds(timeStr: string): number | null {
  const regex = /(?:(\d+)w\s*)?(?:(\d+)d\s*)?(?:(\d+)h\s*)?(?:(\d+)m)?/
  const match = timeStr.trim().match(regex)
  if (!match) return null

  const weeks = parseInt(match[1] || '0')
  const days = parseInt(match[2] || '0')
  const hours = parseInt(match[3] || '0')
  const minutes = parseInt(match[4] || '0')

  return (weeks * 5 * 8 * 3600) + (days * 8 * 3600) + (hours * 3600) + (minutes * 60)
}

function renderDescription(description: any): string {
  if (!description) return 'No description'
  if (typeof description === 'string') return description

  // Handle Atlassian Document Format
  try {
    const extractText = (node: any): string => {
      if (!node) return ''
      if (typeof node === 'string') return node
      if (node.text) return node.text
      if (node.content && Array.isArray(node.content)) {
        return node.content.map(extractText).join('')
      }
      return ''
    }
    return extractText(description) || 'No description'
  } catch {
    return 'No description'
  }
}

interface Worklog {
  id: string
  author: {
    displayName: string
    avatarUrls: { [key: string]: string }
  }
  timeSpentSeconds: number
  started: string
  comment?: any
}

export default function IssueDetailPanel({ issue, loading, onClose, onUpdate }: Props) {
  const [editing, setEditing] = useState<string | null>(null)
  const [timeSpent, setTimeSpent] = useState('')
  const [originalEstimate, setOriginalEstimate] = useState('')
  const [storyPoints, setStoryPoints] = useState('')
  const [newComment, setNewComment] = useState('')
  const [newSubtaskSummary, setNewSubtaskSummary] = useState('')
  const [saving, setSaving] = useState(false)
  const [worklogs, setWorklogs] = useState<Worklog[]>([])
  const [worklogsLoading, setWorklogsLoading] = useState(false)

  const { fields } = issue

  const fetchWorklogs = async () => {
    setWorklogsLoading(true)
    try {
      const res = await fetch(`/api/issues/${issue.key}/worklogs`)
      const data = await res.json()
      if (data.worklogs) {
        setWorklogs(data.worklogs)
      }
    } catch (err) {
      console.error('Failed to fetch worklogs:', err)
    } finally {
      setWorklogsLoading(false)
    }
  }

  const handleLogTime = async () => {
    if (!timeSpent.trim()) return
    setSaving(true)
    try {
      const seconds = parseTimeToSeconds(timeSpent)
      if (!seconds) {
        alert('Invalid time format. Use format like: 1h 30m')
        return
      }
      await fetch(`/api/issues/${issue.key}/worklog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeSpentSeconds: seconds })
      })
      setTimeSpent('')
      setEditing(null)
      await fetchWorklogs()
      onUpdate()
    } catch (err) {
      console.error('Failed to log time:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateEstimate = async () => {
    if (!originalEstimate.trim()) return
    setSaving(true)
    try {
      await fetch(`/api/issues/${issue.key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: { timetracking: { originalEstimate: originalEstimate.trim() } }
        })
      })
      setOriginalEstimate('')
      setEditing(null)
      onUpdate()
    } catch (err) {
      console.error('Failed to update estimate:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateStoryPoints = async () => {
    setSaving(true)
    try {
      await fetch(`/api/issues/${issue.key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: { customfield_10016: parseFloat(storyPoints) || null }
        })
      })
      setStoryPoints('')
      setEditing(null)
      onUpdate()
    } catch (err) {
      console.error('Failed to update story points:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleAddComment = async () => {
    if (!newComment.trim()) return
    setSaving(true)
    try {
      await fetch(`/api/issues/${issue.key}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: newComment.trim() })
      })
      setNewComment('')
      onUpdate()
    } catch (err) {
      console.error('Failed to add comment:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleCreateSubtask = async () => {
    if (!newSubtaskSummary.trim()) return
    setSaving(true)
    try {
      await fetch(`/api/issues/${issue.key}/subtasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: newSubtaskSummary.trim(),
          projectName: fields.project.name
        })
      })
      setNewSubtaskSummary('')
      setEditing(null)
      onUpdate()
    } catch (err) {
      console.error('Failed to create subtask:', err)
    } finally {
      setSaving(false)
    }
  }

  // Load worklogs on mount
  useEffect(() => {
    fetchWorklogs()
  }, [issue.key])

  if (loading) {
    return (
      <div className="detail-panel window">
        <div className="title-bar">
          <button aria-label="Close" className="close" onClick={onClose}></button>
          <h1 className="title">Loading...</h1>
          </div>
      </div>
    )
  }

  return (
    <div className="detail-panel window">
      <div className="title-bar">
        <button aria-label="Close" className="close" onClick={onClose}></button>
        <h1 className="title">
          <img src={fields.issuetype?.iconUrl} alt="" className="type-icon" />
          <a
            href={`https://tribal-mnc.atlassian.net/browse/${issue.key}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {issue.key}
          </a>
        </h1>
      </div>
      <div className="separator"></div>

      <div className="window-pane panel-content">
        <h2 className="issue-summary">{fields.summary}</h2>

        <div className="issue-meta">
          <div className="meta-item">
            <span className="meta-label">Status</span>
            <span className={`status status-${fields.status.statusCategory?.key}`}>
              {fields.status.name}
            </span>
          </div>

          <div className="meta-item">
            <span className="meta-label">Priority</span>
            {fields.priority ? (
              <span className="priority">
                <img src={fields.priority.iconUrl} alt="" className="icon" />
                {fields.priority.name}
              </span>
            ) : '-'}
          </div>

          <div className="meta-item">
            <span className="meta-label">Assignee</span>
            {fields.assignee ? (
              <span className="assignee">
                <img src={fields.assignee.avatarUrls['24x24']} alt="" className="avatar" />
                {fields.assignee.displayName}
              </span>
            ) : <span className="unassigned">Unassigned</span>}
          </div>
        </div>

        <div className="section">
          <h3>Description</h3>
          <p className="description">{renderDescription(fields.description)}</p>
        </div>

        <div className="section">
          <h3>Story Points</h3>
          {editing === 'storyPoints' ? (
            <div className="edit-row">
              <input
                type="number"
                value={storyPoints}
                onChange={(e) => setStoryPoints(e.target.value)}
                placeholder="ej. 3"
                step="0.5"
              />
              <button className="btn btn-default" onClick={handleUpdateStoryPoints} disabled={saving}>Save</button>
              <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          ) : (
            <div className="value-row">
              <span>{fields.customfield_10016 ?? '-'}</span>
              <button className="btn" onClick={() => {
                setStoryPoints(String(fields.customfield_10016 || ''))
                setEditing('storyPoints')
              }}>Edit</button>
            </div>
          )}
        </div>

        <div className="section">
          <h3>Registro de tiempo</h3>
          <div className="time-grid">
            <div className="time-item">
              <span className="time-label">Original Estimate</span>
              {editing === 'estimate' ? (
                <div className="edit-row">
                  <input
                    type="text"
                    value={originalEstimate}
                    onChange={(e) => setOriginalEstimate(e.target.value)}
                    placeholder="ej. 2h 30m"
                  />
                  <button className="btn btn-default" onClick={handleUpdateEstimate} disabled={saving}>Save</button>
                  <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              ) : (
                <div className="value-row">
                  <span>{fields.timetracking?.originalEstimate || formatTime(fields.timeoriginalestimate)}</span>
                  <button className="btn" onClick={() => {
                    setOriginalEstimate(fields.timetracking?.originalEstimate || '')
                    setEditing('estimate')
                  }}>Edit</button>
                </div>
              )}
            </div>
            <div className="time-item">
              <span className="time-label">Time Spent</span>
              <span>{fields.timetracking?.timeSpent || formatTime(fields.timespent)}</span>
            </div>
            <div className="time-item">
              <span className="time-label">Remaining</span>
              <span>{fields.timetracking?.remainingEstimate || formatTime(fields.timeestimate)}</span>
            </div>
          </div>

          <div className="log-time">
            <h4>Log Time</h4>
            {editing === 'logTime' ? (
              <div className="edit-row">
                <input
                  type="text"
                  value={timeSpent}
                  onChange={(e) => setTimeSpent(e.target.value)}
                  placeholder="ej. 1h 30m"
                />
                <button className="btn btn-default" onClick={handleLogTime} disabled={saving}>Log</button>
                <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
              </div>
            ) : (
              <button className="btn add-btn" onClick={() => setEditing('logTime')}>+ Log Time</button>
            )}
          </div>
        </div>

        <div className="section">
          <h3>Worklog History ({worklogs.length})</h3>
          {worklogsLoading ? (
            <div className="loading">Loading worklogs...</div>
          ) : worklogs.length > 0 ? (
            <div className="worklogs-history">
              {[...worklogs]
                .sort((a, b) => new Date(b.started).getTime() - new Date(a.started).getTime())
                .map((worklog) => (
                  <div key={worklog.id} className="worklog-history-item">
                    <div className="worklog-header-info">
                      <img
                        src={worklog.author.avatarUrls['24x24']}
                        alt=""
                        className="avatar"
                      />
                      <span className="worklog-author">{worklog.author.displayName}</span>
                      <span className="worklog-datetime">{formatDateTime(worklog.started)}</span>
                      <span className="worklog-duration">{formatTime(worklog.timeSpentSeconds)}</span>
                    </div>
                    {worklog.comment && (
                      <div className="worklog-comment">
                        {renderDescription(worklog.comment)}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          ) : (
            <div className="no-worklogs">No time logged yet</div>
          )}
        </div>

        <div className="section">
          <h3>Subtasks ({fields.subtasks?.length || 0})</h3>

          <div className="subtasks-create">
            {editing === 'createSubtask' ? (
              <div className="edit-row">
                <input
                  type="text"
                  value={newSubtaskSummary}
                  onChange={(e) => setNewSubtaskSummary(e.target.value)}
                  placeholder="Subtask name..."
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateSubtask()}
                />
                <button className="btn btn-default" onClick={handleCreateSubtask} disabled={saving || !newSubtaskSummary.trim()}>
                  Create
                </button>
                <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
              </div>
            ) : (
              <button className="btn add-btn" onClick={() => setEditing('createSubtask')}>+ New Subtask</button>
            )}
          </div>

          {fields.subtasks && fields.subtasks.length > 0 && (
            <div className="subtasks-list">
              {fields.subtasks.map((subtask) => (
                <div key={subtask.id} className="subtask-item">
                  <img src={subtask.fields.issuetype?.iconUrl} alt="" className="type-icon" />
                  <span
                    className="subtask-key clickable"
                    onClick={() => window.open(`https://tribal-mnc.atlassian.net/browse/${subtask.key}`, '_blank', 'noopener,noreferrer')}
                    title="Abrir en Jira"
                  >
                    {subtask.key}
                  </span>
                  <span className="subtask-summary">{subtask.fields.summary}</span>
                  <span className={`status status-${subtask.fields.status.statusCategory?.key}`}>
                    {subtask.fields.status.name}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="section">
          <h3>Comments ({fields.comment?.total || 0})</h3>

          <div className="add-comment">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              rows={3}
            />
            <button className="btn btn-default" onClick={handleAddComment} disabled={saving || !newComment.trim()}>
              Add Comment
            </button>
          </div>

          <div className="comments-list">
            {fields.comment?.comments.map((comment) => (
              <div key={comment.id} className="comment">
                <div className="comment-header">
                  <img
                    src={comment.author.avatarUrls['24x24']}
                    alt=""
                    className="avatar"
                  />
                  <span className="comment-author">{comment.author.displayName}</span>
                  <span className="comment-date">
                    {new Date(comment.created).toLocaleDateString()}
                  </span>
                </div>
                <div className="comment-body">
                  {renderDescription(comment.body)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
