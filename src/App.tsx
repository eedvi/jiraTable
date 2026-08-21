import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import KanbanBoard from './components/KanbanBoard'
import IssueDetailPanel from './components/IssueDetailPanel'
import WorklogSummary from './components/WorklogSummary'
import WeeklyTimesheet from './components/WeeklyTimesheet'
import WeeklySummary from './components/WeeklySummary'
import CapacityBanner from './components/CapacityBanner'
import { JiraIssue, Project, IssueDetail, CapacityData } from './types'

const PRESET_FILTERS = [
  { label: 'My Issues', jql: 'assignee = currentUser() ORDER BY updated DESC' },
  { label: 'My Open Issues', jql: 'assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC' },
  { label: 'Recently Updated', jql: 'updated >= -7d ORDER BY updated DESC' },
  { label: 'Created This Week', jql: 'created >= -7d ORDER BY created DESC' },
]

type Theme = 'light' | 'dark'
type View = 'kanban' | 'weekly' | 'history' | 'summary'

const VIEWS: { id: View; label: string }[] = [
  { id: 'kanban', label: 'Kanban Board' },
  { id: 'weekly', label: 'Current Week' },
  { id: 'history', label: 'Weekly History' },
  { id: 'summary', label: 'Overview' },
]

function App() {
  const [issues, setIssues] = useState<JiraIssue[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [customJql, setCustomJql] = useState<string>('assignee = currentUser() ORDER BY updated DESC')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedIssue, setSelectedIssue] = useState<IssueDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [starredProjects, setStarredProjects] = useState<string[]>(() => {
    const saved = localStorage.getItem('starredProjects')
    return saved ? JSON.parse(saved) : []
  })
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme')
    return (saved as Theme) || 'light'
  })
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false)
  const [projectSearch, setProjectSearch] = useState('')
  const [activeView, setActiveView] = useState<View>('kanban')

  // Capacity banner
  const [capacityData, setCapacityData] = useState<CapacityData | null>(null)

  // Auto-refresh
  const [refreshKey, setRefreshKey] = useState(0)
  const [silentRefresh, setSilentRefresh] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const lastFetchedRef = useRef<Record<string, number>>({ kanban: Date.now() })

  useEffect(() => {
    fetchProjects()
    fetchIssues()
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem('starredProjects', JSON.stringify(starredProjects))
  }, [starredProjects])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.project-selector')) {
        setProjectDropdownOpen(false)
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setProjectDropdownOpen(false)
    }
    document.addEventListener('click', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('click', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  const sortedProjects = useMemo(() => {
    const searchLower = projectSearch.toLowerCase()
    const filtered = projects.filter(p =>
      p.name.toLowerCase().includes(searchLower) ||
      p.key.toLowerCase().includes(searchLower)
    )
    const starred = filtered.filter(p => starredProjects.includes(p.key))
    const unstarred = filtered.filter(p => !starredProjects.includes(p.key))
    return [...starred, ...unstarred]
  }, [projects, starredProjects, projectSearch])

  const toggleStar = (projectKey: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setStarredProjects(prev =>
      prev.includes(projectKey)
        ? prev.filter(k => k !== projectKey)
        : [...prev, projectKey]
    )
  }

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light')
  }

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const i = VIEWS.findIndex(v => v.id === activeView)
    const next = VIEWS[(i + delta + VIEWS.length) % VIEWS.length]
    setActiveView(next.id)
    document.getElementById(`tab-${next.id}`)?.focus()
  }

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects')
      const data = await res.json()
      setProjects(data)
    } catch (err) {
      console.error('Failed to fetch projects:', err)
    }
  }

  const fetchIssues = async (jqlOverride?: string) => {
    setLoading(true)
    setError(null)
    try {
      let jql = jqlOverride || customJql

      if (selectedProject) {
        jql = `project = "${selectedProject}" AND (${jql.replace(/ ORDER BY.*$/i, '')}) ORDER BY updated DESC`
      }

      const res = await fetch(`/api/issues?jql=${encodeURIComponent(jql)}&maxResults=100`)
      const data = await res.json()

      if (data.error) {
        throw new Error(data.details?.errorMessages?.join(', ') || data.error)
      }

      setIssues(data.issues || [])
      setLastUpdated(Date.now())
    } catch (err: any) {
      setError(err.message)
      setIssues([])
    } finally {
      setLoading(false)
    }
  }

  const fetchCapacity = useCallback(async () => {
    try {
      const res = await fetch('/api/capacity')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (!data.error) {
        setCapacityData(data)
      }
    } catch (err) {
      console.error('Failed to fetch capacity:', err)
    }
  }, [])

  const fetchIssuesSilent = useCallback(async () => {
    try {
      let jql = customJql
      if (selectedProject) {
        jql = `project = "${selectedProject}" AND (${jql.replace(/ ORDER BY.*$/i, '')}) ORDER BY updated DESC`
      }
      const res = await fetch(`/api/issues?jql=${encodeURIComponent(jql)}&maxResults=100`)
      const data = await res.json()
      if (!data.error) {
        setIssues(data.issues || [])
      }
    } catch (err) {
      console.error('Silent issue refresh failed:', err)
    }
  }, [customJql, selectedProject])

  // One silent refresh of the active view's live data (today / current week +
  // capacity, and kanban issues). History views revalidate from cache on mount.
  const doSilentRefresh = useCallback(() => {
    setSilentRefresh(true)
    setRefreshKey(prev => prev + 1)
    fetchCapacity()
    if (activeView === 'kanban') fetchIssuesSilent()
    lastFetchedRef.current[activeView] = Date.now()
    setLastUpdated(Date.now())
  }, [activeView, fetchCapacity, fetchIssuesSilent])

  // Refresh only if the active view's data is older than maxAgeMs (dedup guard).
  const refreshIfStale = useCallback((maxAgeMs = 30000) => {
    const last = lastFetchedRef.current[activeView] || 0
    if (Date.now() - last > maxAgeMs) doSilentRefresh()
  }, [activeView, doSilentRefresh])

  // Auto-refresh when switching into a view (30s dedup; no double-fetch on mount)
  useEffect(() => {
    refreshIfStale(30000)
  }, [activeView, refreshIfStale])

  // Background floor: poll every 10 min so the current day stays current
  // while the tab sits open.
  useEffect(() => {
    const interval = setInterval(doSilentRefresh, 10 * 60 * 1000)
    return () => clearInterval(interval)
  }, [doSilentRefresh])

  // Snap fresh the moment the user returns to the tab / window (30s dedup),
  // covering long-idle tabs and the midnight day rollover without waiting for
  // the next poll.
  useEffect(() => {
    const refreshOnReturn = () => {
      if (document.visibilityState === 'visible') refreshIfStale(30000)
    }
    document.addEventListener('visibilitychange', refreshOnReturn)
    window.addEventListener('focus', refreshOnReturn)
    return () => {
      document.removeEventListener('visibilitychange', refreshOnReturn)
      window.removeEventListener('focus', refreshOnReturn)
    }
  }, [refreshIfStale])

  // Fetch capacity on mount
  useEffect(() => {
    fetchCapacity()
  }, [fetchCapacity])

  // Manual refresh works on every view: kanban refetches issues, the
  // time-tracking views react to the refreshKey bump.
  const handleManualRefresh = () => {
    setSilentRefresh(false)
    setRefreshKey(prev => prev + 1)
    fetchCapacity()
    if (activeView === 'kanban') fetchIssues()
    lastFetchedRef.current[activeView] = Date.now()
    setLastUpdated(Date.now())
  }

  const handlePresetClick = (jql: string) => {
    setCustomJql(jql)
    fetchIssues(jql)
  }

  const handleProjectChange = (projectKey: string) => {
    setSelectedProject(projectKey)
    setTimeout(() => fetchIssues(), 0)
  }

  const handleIssueClick = async (issueKey: string) => {
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/issues/${issueKey}`)
      const data = await res.json()
      if (data.error) {
        throw new Error(data.error)
      }
      setSelectedIssue(data)
    } catch (err: any) {
      console.error('Failed to fetch issue details:', err)
    } finally {
      setDetailLoading(false)
    }
  }

  const handleCloseDetail = () => {
    setSelectedIssue(null)
  }

  const handleIssueUpdate = async () => {
    await fetchIssues()
    if (selectedIssue) {
      handleIssueClick(selectedIssue.key)
    }
    // Action-based refresh bypasses dedup
    fetchCapacity()
  }

  const selectedProjectName = projects.find(p => p.key === selectedProject)?.name || 'All Projects'

  return (
    <div className="app">
      <div className="window">
        <div className="title-bar">
          <h1 className="title">Jira Tickets</h1>
        </div>

        <div className="window-pane">
          <div className="main-navigation">
            <div className="nav-tabs" role="tablist" aria-label="Views">
              {VIEWS.map(view => (
                <button
                  key={view.id}
                  id={`tab-${view.id}`}
                  role="tab"
                  type="button"
                  aria-selected={activeView === view.id}
                  aria-controls={`panel-${view.id}`}
                  tabIndex={activeView === view.id ? 0 : -1}
                  className={`nav-tab ${activeView === view.id ? 'active' : ''}`}
                  onClick={() => setActiveView(view.id)}
                  onKeyDown={handleTabKeyDown}
                >
                  {view.label}
                </button>
              ))}
            </div>
            <div className="nav-actions">
              {lastUpdated && (
                <span className="updated-at">
                  Updated {new Date(lastUpdated).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              <button
                type="button"
                className="btn btn-icon"
                onClick={toggleTheme}
                title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              >
                {theme === 'light' ? 'Dark' : 'Light'}
              </button>
              <button type="button" className="btn" onClick={handleManualRefresh} disabled={loading}>
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
          </div>

          <CapacityBanner data={capacityData} />

          {activeView === 'kanban' && (
            <div className="filters">
              <div className="field-row">
                <label>Project:</label>
                <div className="project-selector">
                <button
                  type="button"
                  className="btn project-selector-btn"
                  aria-expanded={projectDropdownOpen}
                  aria-haspopup="listbox"
                  onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}
                >
                  <span>{selectedProjectName}</span>
                  <span className="dropdown-arrow" aria-hidden="true">{projectDropdownOpen ? '▲' : '▼'}</span>
                </button>
            {projectDropdownOpen && (
              <div className="project-dropdown" role="listbox" aria-label="Projects">
                <div className="project-search">
                  <input
                    type="text"
                    placeholder="Search projects..."
                    value={projectSearch}
                    onChange={(e) => setProjectSearch(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                  />
                </div>
                {!projectSearch && (
                  <button
                    type="button"
                    role="option"
                    aria-selected={selectedProject === ''}
                    className={`project-option ${selectedProject === '' ? 'selected' : ''}`}
                    onClick={() => { handleProjectChange(''); setProjectDropdownOpen(false); setProjectSearch('') }}
                  >
                    <span className="star-placeholder"></span>
                    <span>All Projects</span>
                  </button>
                )}
                {starredProjects.length > 0 && sortedProjects.some(p => starredProjects.includes(p.key)) && (
                  <div className="project-divider">Starred</div>
                )}
                {sortedProjects.map((p, idx) => {
                  const isStarred = starredProjects.includes(p.key)
                  const showDivider = idx > 0 &&
                    starredProjects.includes(sortedProjects[idx - 1].key) &&
                    !isStarred
                  return (
                    <div key={p.id}>
                      {showDivider && <div className="project-divider">Other Projects</div>}
                      <div className="project-option-row">
                        <button
                          type="button"
                          className={`star-btn ${isStarred ? 'starred' : ''}`}
                          onClick={(e) => toggleStar(p.key, e)}
                          aria-pressed={isStarred}
                          aria-label={isStarred ? `Unstar ${p.name}` : `Star ${p.name}`}
                          title={isStarred ? 'Unstar project' : 'Star project'}
                        >
                          {isStarred ? '★' : '☆'}
                        </button>
                        <button
                          type="button"
                          role="option"
                          aria-selected={selectedProject === p.key}
                          className={`project-option ${selectedProject === p.key ? 'selected' : ''}`}
                          onClick={() => { handleProjectChange(p.key); setProjectDropdownOpen(false); setProjectSearch('') }}
                        >
                          <span>{p.name}</span>
                          <span className="project-key">{p.key}</span>
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
              </div>
            </div>

            <div className="field-row">
              <label>Quick Filters:</label>
              <div className="preset-buttons">
                {PRESET_FILTERS.map((filter) => (
                  <button
                    key={filter.label}
                    onClick={() => handlePresetClick(filter.jql)}
                    className={`btn ${customJql === filter.jql ? 'btn-default' : ''}`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="field-row jql-row">
              <label>JQL:</label>
              <input
                type="text"
                value={customJql}
                onChange={(e) => setCustomJql(e.target.value)}
                placeholder="Enter JQL query..."
                onKeyDown={(e) => e.key === 'Enter' && fetchIssues()}
              />
              <button onClick={() => fetchIssues()} disabled={loading} className="btn btn-default">
                {loading ? 'Loading...' : 'Search'}
              </button>
            </div>
          </div>
          )}

          {activeView === 'kanban' && error && (
            <div className="standard-dialog" role="alert">
              <div className="dialog-text">{error}</div>
            </div>
          )}

          <main className={selectedIssue && activeView === 'kanban' ? 'with-panel' : ''}>
            {activeView === 'kanban' && (
              <>
                <div className="content" id="panel-kanban" role="tabpanel" aria-labelledby="tab-kanban">
                  <KanbanBoard
                    issues={issues}
                    loading={loading}
                    onIssueClick={handleIssueClick}
                    onStatusChange={() => fetchIssues()}
                  />
                </div>

                {selectedIssue && (
                  <IssueDetailPanel
                    issue={selectedIssue}
                    loading={detailLoading}
                    onClose={handleCloseDetail}
                    onUpdate={handleIssueUpdate}
                  />
                )}
              </>
            )}

            {activeView === 'weekly' && (
              <div className="full-view" id="panel-weekly" role="tabpanel" aria-labelledby="tab-weekly">
                <WeeklyTimesheet refreshKey={refreshKey} silent={silentRefresh} />
              </div>
            )}

            {activeView === 'history' && (
              <div className="full-view" id="panel-history" role="tabpanel" aria-labelledby="tab-history">
                <WeeklySummary refreshKey={refreshKey} silent={silentRefresh} />
              </div>
            )}

            {activeView === 'summary' && (
              <div className="full-view" id="panel-summary" role="tabpanel" aria-labelledby="tab-summary">
                <WorklogSummary refreshKey={refreshKey} silent={silentRefresh} />
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}

export default App
