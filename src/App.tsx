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
  const [activeView, setActiveView] = useState<'kanban' | 'weekly' | 'history' | 'summary'>('kanban')

  // Capacity banner
  const [capacityData, setCapacityData] = useState<CapacityData | null>(null)

  // Auto-refresh
  const [refreshKey, setRefreshKey] = useState(0)
  const [silentRefresh, setSilentRefresh] = useState(false)
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
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
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

  // Auto-refresh on view switch (with 30s dedup)
  useEffect(() => {
    const last = lastFetchedRef.current[activeView] || 0
    if (Date.now() - last > 30000) {
      setSilentRefresh(true)
      setRefreshKey(prev => prev + 1)
      fetchCapacity()
      // For kanban, silently refresh issues
      if (activeView === 'kanban') {
        fetchIssuesSilent()
      }
      lastFetchedRef.current = { ...lastFetchedRef.current, [activeView]: Date.now() }
    }
  }, [activeView, fetchCapacity, fetchIssuesSilent])

  // Background polling every 10 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      setSilentRefresh(true)
      setRefreshKey(prev => prev + 1)
      fetchCapacity()
      if (activeView === 'kanban') {
        fetchIssuesSilent()
      }
    }, 10 * 60 * 1000)
    return () => clearInterval(interval)
  }, [activeView, fetchCapacity, fetchIssuesSilent])

  // Fetch capacity on mount
  useEffect(() => {
    fetchCapacity()
  }, [fetchCapacity])

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
          <button aria-label="Close" className="close"></button>
          <h1 className="title">Jira Tickets</h1>
          <button aria-label="Resize" className="resize"></button>
        </div>
        <div className="separator"></div>

        <div className="window-pane">
          <div className="main-navigation">
            <div className="nav-tabs">
              <button
                className={`nav-tab ${activeView === 'kanban' ? 'active' : ''}`}
                onClick={() => setActiveView('kanban')}
              >
                Tablero Kanban
              </button>
              <button
                className={`nav-tab ${activeView === 'weekly' ? 'active' : ''}`}
                onClick={() => setActiveView('weekly')}
              >
                Semana Actual
              </button>
              <button
                className={`nav-tab ${activeView === 'history' ? 'active' : ''}`}
                onClick={() => setActiveView('history')}
              >
                Historial Semanal
              </button>
              <button
                className={`nav-tab ${activeView === 'summary' ? 'active' : ''}`}
                onClick={() => setActiveView('summary')}
              >
                Resumen General
              </button>
            </div>
            <div className="nav-actions">
              <button className="btn btn-icon" onClick={toggleTheme} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
                {theme === 'light' ? 'Dark' : 'Light'}
              </button>
              {activeView === 'kanban' && (
                <button className="btn" onClick={() => { fetchIssues(); fetchCapacity(); }} disabled={loading}>
                  {loading ? 'Loading...' : 'Refresh'}
                </button>
              )}
            </div>
          </div>

          <CapacityBanner data={capacityData} />

          {activeView === 'kanban' && (
            <div className="filters">
              <div className="field-row">
                <label>Project:</label>
                <div className="project-selector">
                <button
                  className="btn project-selector-btn"
                  onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}
                >
                  <span>{selectedProjectName}</span>
                  <span className="dropdown-arrow">{projectDropdownOpen ? '▲' : '▼'}</span>
                </button>
            {projectDropdownOpen && (
              <div className="project-dropdown">
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
                  <div
                    className={`project-option ${selectedProject === '' ? 'selected' : ''}`}
                    onClick={() => { handleProjectChange(''); setProjectDropdownOpen(false); setProjectSearch('') }}
                  >
                    <span className="star-placeholder"></span>
                    <span>All Projects</span>
                  </div>
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
                      <div
                        className={`project-option ${selectedProject === p.key ? 'selected' : ''}`}
                        onClick={() => { handleProjectChange(p.key); setProjectDropdownOpen(false); setProjectSearch('') }}
                      >
                        <button
                          className={`star-btn ${isStarred ? 'starred' : ''}`}
                          onClick={(e) => toggleStar(p.key, e)}
                          title={isStarred ? 'Unstar project' : 'Star project'}
                        >
                          {isStarred ? '★' : '☆'}
                        </button>
                        <span>{p.name}</span>
                        <span className="project-key">{p.key}</span>
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
            <div className="standard-dialog">
              <div className="dialog-text">{error}</div>
            </div>
          )}

          <main className={selectedIssue && activeView === 'kanban' ? 'with-panel' : ''}>
            {activeView === 'kanban' && (
              <>
                <div className="content">
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
              <div className="full-view">
                <WeeklyTimesheet refreshKey={refreshKey} silent={silentRefresh} />
              </div>
            )}

            {activeView === 'history' && (
              <div className="full-view">
                <WeeklySummary refreshKey={refreshKey} silent={silentRefresh} />
              </div>
            )}

            {activeView === 'summary' && (
              <div className="full-view">
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
