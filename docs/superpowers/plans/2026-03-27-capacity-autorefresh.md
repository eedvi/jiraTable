# Capacity Banner & Smart Auto-Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent capacity banner showing estimated vs logged hours, plus smart auto-refresh across all views.

**Architecture:** New `/api/capacity` backend endpoint queries Jira for open/in-progress assigned tickets' estimates and current week worklogs. A `CapacityBanner` React component renders dual progress bars. A `useAutoRefresh` hook in `App.tsx` manages polling, view-switch refresh, and silent updates via `refreshKey` + `silent` props.

**Tech Stack:** React 18, TypeScript, Express, Jira REST API v3, CSS custom properties

**Spec:** `docs/superpowers/specs/2026-03-27-capacity-autorefresh-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/types.ts` | Modify | Add `CapacityData` interface |
| `server/index.ts` | Modify | Add `GET /api/capacity` endpoint |
| `src/components/CapacityBanner.tsx` | Create | Pure display component — dual progress bars |
| `src/styles/modern.css` | Modify | Capacity banner styles |
| `src/App.tsx` | Modify | Auto-refresh hook, capacity fetch, render banner, remove dead state |
| `src/components/WeeklyTimesheet.tsx` | Modify | Accept `refreshKey` + `silent` props |
| `src/components/WeeklySummary.tsx` | Modify | Accept `refreshKey` + `silent` props |
| `src/components/WorklogSummary.tsx` | Modify | Accept `refreshKey` + `silent` props |

---

### Task 1: Add CapacityData type

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add the CapacityData interface to types.ts**

Append after the `IssueDetail` interface (after line 137):

```typescript
export interface CapacityData {
  estimatedSeconds: number
  estimatedHours: number
  loggedSeconds: number
  loggedHours: number
  weeklyGoalHours: number
  estimatedPercent: number
  loggedPercent: number
  ticketCount: number
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add CapacityData interface"
```

---

### Task 2: Add GET /api/capacity backend endpoint

**Files:**
- Modify: `server/index.ts` (add before the health check endpoint at line 855)

- [ ] **Step 1: Add the /api/capacity endpoint**

Insert before the `// Health check` comment (line 855 in `server/index.ts`). The endpoint:
1. Fetches current user via `/myself`
2. Queries open/in-progress assigned tickets for estimates
3. Calculates current week boundaries (Monday-Sunday)
4. Queries worklogs for the current week
5. Returns capacity summary

```typescript
// Get weekly capacity (estimated vs logged hours)
app.get('/api/capacity', async (_req, res) => {
  try {
    // Get current user
    const userResponse = await jiraApi.get('/myself');
    const accountId = userResponse.data.accountId;

    // 1. Get estimated hours from open/in-progress assigned tickets
    const estimateJql = 'assignee = currentUser() AND statusCategory != Done';
    const estimateResponse = await jiraApi.get('/search/jql', {
      params: {
        jql: estimateJql,
        fields: 'timeoriginalestimate',
        maxResults: 200
      }
    });

    let estimatedSeconds = 0;
    let ticketCount = 0;
    for (const issue of estimateResponse.data.issues || []) {
      ticketCount++;
      if (issue.fields.timeoriginalestimate) {
        estimatedSeconds += issue.fields.timeoriginalestimate;
      }
    }

    // 2. Get logged hours for current week
    const now = new Date();
    const currentDay = now.getDay();
    const daysToMonday = currentDay === 0 ? 6 : currentDay - 1;

    const startDate = new Date();
    startDate.setDate(now.getDate() - daysToMonday);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date();
    const daysToSunday = currentDay === 0 ? 0 : 7 - currentDay;
    endDate.setDate(now.getDate() + daysToSunday);
    endDate.setHours(23, 59, 59, 999);

    const startDateStr = startDate.toISOString().split('T')[0];
    const worklogJql = `worklogAuthor = currentUser() AND worklogDate >= "${startDateStr}" ORDER BY updated DESC`;
    const worklogResponse = await jiraApi.get('/search/jql', {
      params: {
        jql: worklogJql,
        fields: 'worklog',
        maxResults: 1000
      }
    });

    let loggedSeconds = 0;
    for (const issue of worklogResponse.data.issues || []) {
      try {
        const wlResponse = await jiraApi.get(`/issue/${issue.key}/worklog`);
        for (const worklog of wlResponse.data.worklogs || []) {
          if (worklog.author.accountId === accountId) {
            const worklogDate = new Date(worklog.started);
            if (worklogDate >= startDate && worklogDate <= endDate) {
              loggedSeconds += worklog.timeSpentSeconds;
            }
          }
        }
      } catch (err) {
        console.error(`Error fetching worklogs for ${issue.key}:`, err);
      }
    }

    const weeklyGoalHours = 40;
    const estimatedHours = Math.round((estimatedSeconds / 3600) * 100) / 100;
    const loggedHours = Math.round((loggedSeconds / 3600) * 100) / 100;

    res.json({
      estimatedSeconds,
      estimatedHours,
      loggedSeconds,
      loggedHours,
      weeklyGoalHours,
      estimatedPercent: Math.round((estimatedHours / weeklyGoalHours) * 100),
      loggedPercent: Math.round((loggedHours / weeklyGoalHours) * 100),
      ticketCount
    });
  } catch (error: any) {
    console.error('Error fetching capacity:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch capacity', details: error.response?.data });
  }
});
```

- [ ] **Step 2: Verify server compiles**

Run: `npx tsx --no-warnings server/index.ts &` (start briefly to check for compile errors, then kill)
Or: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add server/index.ts
git commit -m "feat: add GET /api/capacity endpoint for weekly capacity data"
```

---

### Task 3: Create CapacityBanner component

**Files:**
- Create: `src/components/CapacityBanner.tsx`

- [ ] **Step 1: Create the CapacityBanner component**

```typescript
import { CapacityData } from '../types'

function getEstimatedColor(percent: number): string {
  if (percent > 100) return 'var(--color-error)'
  if (percent > 80) return '#f59e0b'
  return 'var(--color-success)'
}

function getEstimatedLabel(percent: number): string {
  if (percent > 100) return 'Sobrecarga'
  if (percent > 80) return 'Cerca del limite'
  return 'OK'
}

interface CapacityBannerProps {
  data: CapacityData | null
}

export default function CapacityBanner({ data }: CapacityBannerProps) {
  if (!data) return null

  const estimatedColor = getEstimatedColor(data.estimatedPercent)
  const estimatedLabel = getEstimatedLabel(data.estimatedPercent)

  return (
    <div className="capacity-banner">
      <div className="capacity-row">
        <span className="capacity-label">Estimado</span>
        <div className="capacity-bar-track">
          <div
            className="capacity-bar-fill capacity-bar-estimated"
            style={{
              width: `${Math.min(data.estimatedPercent, 100)}%`,
              backgroundColor: estimatedColor
            }}
          />
        </div>
        <span className="capacity-value">{data.estimatedHours}h / {data.weeklyGoalHours}h</span>
        <span className="capacity-status" style={{ color: estimatedColor }}>
          {estimatedLabel}
        </span>
      </div>
      <div className="capacity-row">
        <span className="capacity-label">Registrado</span>
        <div className="capacity-bar-track">
          <div
            className="capacity-bar-fill capacity-bar-logged"
            style={{
              width: `${Math.min(data.loggedPercent, 100)}%`
            }}
          />
        </div>
        <span className="capacity-value">{data.loggedHours}h / {data.weeklyGoalHours}h</span>
        <span className="capacity-status capacity-status-tickets">
          {data.ticketCount} tickets
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/CapacityBanner.tsx
git commit -m "feat: create CapacityBanner component with dual progress bars"
```

---

### Task 4: Add capacity banner styles

**Files:**
- Modify: `src/styles/modern.css`

- [ ] **Step 1: Add capacity banner CSS at the end of modern.css**

```css
/* ===================================
   CAPACITY BANNER
   =================================== */
.capacity-banner {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-xl);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

.capacity-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: 0.8125rem;
}

.capacity-label {
  width: 70px;
  font-weight: 600;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.capacity-bar-track {
  flex: 1;
  height: 14px;
  background: var(--color-border-light);
  border-radius: var(--radius);
  overflow: hidden;
}

.capacity-bar-fill {
  height: 100%;
  border-radius: var(--radius);
  transition: width 0.4s ease;
}

.capacity-bar-estimated {
  /* Color set inline via style prop */
}

.capacity-bar-logged {
  background: var(--color-accent);
}

.capacity-value {
  width: 90px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--color-text);
  flex-shrink: 0;
}

.capacity-status {
  width: 100px;
  text-align: right;
  font-weight: 600;
  font-size: 0.75rem;
  flex-shrink: 0;
}

.capacity-status-tickets {
  color: var(--color-text-tertiary);
  font-weight: 400;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/modern.css
git commit -m "feat: add capacity banner styles"
```

---

### Task 5: Wire up CapacityBanner and auto-refresh in App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add imports**

Add at the top of `App.tsx`, after the existing imports:

```typescript
import CapacityBanner from './components/CapacityBanner'
import { JiraIssue, Project, IssueDetail, CapacityData } from './types'
```

Remove the old types import line:
```typescript
// REMOVE: import { JiraIssue, Project, IssueDetail } from './types'
```

- [ ] **Step 2: Remove dead state variables**

Remove these two lines from the `App` function (lines 37-38):

```typescript
// REMOVE these two lines:
const [showWorklogSummary, setShowWorklogSummary] = useState(false)
const [activeTimeView, setActiveTimeView] = useState<'none' | 'weekly' | 'summary' | 'history'>('none')
```

- [ ] **Step 3: Add capacity state and auto-refresh state**

Add after the existing `activeView` state:

```typescript
  // Capacity banner
  const [capacityData, setCapacityData] = useState<CapacityData | null>(null)

  // Auto-refresh
  const [refreshKey, setRefreshKey] = useState(0)
  const [silentRefresh, setSilentRefresh] = useState(false)
  const lastFetchedRef = useRef<Record<string, number>>({})
```

Also add `useRef, useCallback` to the React import at the top:

```typescript
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
```

- [ ] **Step 4: Add fetchCapacity and fetchIssuesSilent functions**

Add after the existing `fetchIssues` function:

```typescript
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
```

- [ ] **Step 5: Add triggerRefresh and auto-refresh effects**

Add after `fetchIssuesSilent`:

```typescript
  const triggerRefresh = useCallback((silent: boolean = false) => {
    setSilentRefresh(silent)
    setRefreshKey(prev => prev + 1)
    fetchCapacity()
    lastFetchedRef.current = { ...lastFetchedRef.current, [activeView]: Date.now() }
  }, [activeView, fetchCapacity])

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
```

- [ ] **Step 6: Update handleIssueUpdate to also refresh capacity**

Add `fetchCapacity()` at the end of the existing `handleIssueUpdate` function:

```typescript
  const handleIssueUpdate = async () => {
    await fetchIssues()
    if (selectedIssue) {
      handleIssueClick(selectedIssue.key)
    }
    // Action-based refresh bypasses dedup
    fetchCapacity()
  }
```

- [ ] **Step 6b: Wire the Refresh button to also update capacity**

Update the Refresh button's `onClick` (in the `nav-actions` div) from `onClick={() => fetchIssues()}` to:

```tsx
onClick={() => { fetchIssues(); fetchCapacity(); }}
```

- [ ] **Step 7: Render CapacityBanner in JSX**

In the JSX, add the `CapacityBanner` right after the closing `</div>` of `main-navigation` and before the `{activeView === 'kanban' && (` filters block:

```tsx
          <CapacityBanner data={capacityData} />
```

- [ ] **Step 8: Pass refreshKey and silent to child components**

Update the three view renders:

```tsx
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
```

- [ ] **Step 9: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: Will fail because child components don't accept props yet — that's Task 6.

- [ ] **Step 10: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add capacity banner, auto-refresh hook, and remove dead state"
```

---

### Task 6: Add refreshKey + silent props to child components

**Files:**
- Modify: `src/components/WeeklyTimesheet.tsx`
- Modify: `src/components/WeeklySummary.tsx`
- Modify: `src/components/WorklogSummary.tsx`

- [ ] **Step 1: Update WeeklyTimesheet.tsx**

Change the function signature from:

```typescript
export default function WeeklyTimesheet() {
```

To:

```typescript
interface WeeklyTimesheetProps {
  refreshKey?: number
  silent?: boolean
}

export default function WeeklyTimesheet({ refreshKey, silent }: WeeklyTimesheetProps) {
```

Update the `fetchTimesheet` function to accept a silent parameter:

```typescript
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
```

Keep the existing mount effect as-is, and add a new effect after it for refreshKey:

```typescript
  useEffect(() => {
    if (refreshKey !== undefined && refreshKey > 0) {
      fetchTimesheet(silent ?? false)
    }
  }, [refreshKey])
```

- [ ] **Step 2: Update WeeklySummary.tsx**

Change the function signature from:

```typescript
export default function WeeklySummary() {
```

To:

```typescript
interface WeeklySummaryProps {
  refreshKey?: number
  silent?: boolean
}

export default function WeeklySummary({ refreshKey, silent }: WeeklySummaryProps) {
```

Update `fetchWeeklySummary`:

```typescript
  const fetchWeeklySummary = async (isSilent: boolean = false) => {
    if (!isSilent) setLoading(true)
    try {
      const res = await fetch(`/api/worklogs/weeks?weeksBack=${weeksBack}`)
      const result = await res.json()
      setData(result)
      console.log('Weekly summary data:', result)
    } catch (error) {
      console.error('Error fetching weekly summary:', error)
    } finally {
      if (!isSilent) setLoading(false)
    }
  }
```

Add refreshKey effect after the existing mount effect:

```typescript
  useEffect(() => {
    if (refreshKey !== undefined && refreshKey > 0) {
      fetchWeeklySummary(silent ?? false)
    }
  }, [refreshKey])
```

- [ ] **Step 3: Update WorklogSummary.tsx**

Change the function signature from:

```typescript
export default function WorklogSummary() {
```

To:

```typescript
interface WorklogSummaryProps {
  refreshKey?: number
  silent?: boolean
}

export default function WorklogSummary({ refreshKey, silent }: WorklogSummaryProps) {
```

Update `fetchWorklogs` (currently starts at line 46):

```typescript
  const fetchWorklogs = async (isSilent: boolean = false) => {
    if (!isSilent) setLoading(true)
    try {
      const res = await fetch(`/api/worklogs?period=${period}`)
      const result = await res.json()
      setData(result)
    } catch (error) {
      console.error('Error fetching worklogs:', error)
    } finally {
      if (!isSilent) setLoading(false)
    }
  }
```

Add refreshKey effect after the existing mount effect:

```typescript
  useEffect(() => {
    if (refreshKey !== undefined && refreshKey > 0) {
      fetchWorklogs(silent ?? false)
    }
  }, [refreshKey])
```

- [ ] **Step 4: Verify everything compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/components/WeeklyTimesheet.tsx src/components/WeeklySummary.tsx src/components/WorklogSummary.tsx
git commit -m "feat: add refreshKey and silent props to all time-tracking components"
```

---

### Task 7: Manual smoke test

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: Both client (port 5173) and server (port 3001) start

- [ ] **Step 2: Verify capacity banner appears**

Open http://localhost:5173. The capacity banner should appear below the navigation tabs with two progress bars (Estimado / Registrado).

- [ ] **Step 3: Verify auto-refresh on view switch**

Switch between tabs (Kanban -> Semana Actual -> Historial -> Resumen). Each switch should silently refresh the data without showing a loading spinner.

- [ ] **Step 4: Verify color coding**

If estimated hours > 100% of 40h, the estimated bar should be red. If 80-100%, orange. If <=80%, green.

- [ ] **Step 5: Verify error resilience**

If the server is stopped, the capacity banner should disappear (not show broken UI).
