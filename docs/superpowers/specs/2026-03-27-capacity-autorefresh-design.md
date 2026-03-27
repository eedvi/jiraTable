# Capacity Banner & Smart Auto-Refresh

## Overview

Two improvements to JiraTable:
1. **Capacity Banner** — a persistent dual-bar widget showing estimated vs logged hours for the current week
2. **Smart Auto-Refresh** — automatic data fetching on view switch + 10-min background polling

## Capacity Banner

### Purpose
Show at a glance whether the user is overloaded based on assigned open/in-progress tickets' time estimates vs actual logged hours for the current week. Always visible below nav tabs on all views.

### UI Design
Two stacked horizontal progress bars:
- **Estimado** (blue gradient) — total `originalEstimate` from open/in-progress assigned tickets
- **Registrado** (green gradient) — total worklogs for the current week

Color coding for estimated bar:
- Green (≤80% of 40h): comfortable load
- Orange (80-100%): near capacity
- Red (>100%): overloaded

Weekly goal: 40h (hardcoded).

### Backend Endpoint

`GET /api/capacity`

Response:
```json
{
  "estimatedSeconds": 115200,
  "estimatedHours": 32,
  "loggedSeconds": 72000,
  "loggedHours": 20,
  "weeklyGoalHours": 40,
  "estimatedPercent": 80,
  "loggedPercent": 50,
  "ticketCount": 4
}
```

Logic:
1. Fetch current user via `/myself`
2. Query: `assignee = currentUser() AND statusCategory != Done` with field `timeoriginalestimate`
3. Sum `timeoriginalestimate` across all matching issues (Jira stores in seconds)
4. For logged hours: calculate current week (Monday-Sunday), query `worklogAuthor = currentUser() AND worklogDate >= "{mondayDate}"`, sum worklog seconds for current user within the week
5. Tickets with no estimate counted in `ticketCount` but contribute 0 to estimated hours

### Frontend Component

`CapacityBanner.tsx` — pure display component receiving `CapacityData` as props. No internal fetching.

### Type Definition

```typescript
interface CapacityData {
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

## Smart Auto-Refresh

### Behavior
- **On view switch:** Refresh data for the target view
- **Background poll:** Every 10 minutes, silently refresh the active view's data + capacity banner
- **After actions:** Refresh after logging time, transitioning a ticket, adding a comment
- **Deduplication:** Skip fetch if the same view was fetched < 30 seconds ago
- **Silent updates:** No loading spinner on auto/background refresh — only on initial/manual fetch

### Implementation

A `useAutoRefresh` custom hook in `App.tsx`:
- Manages a 10-minute `setInterval`
- Tracks `lastFetched` timestamp per view
- Exposes a `refreshKey` (incrementing number) passed to child components
- Child components re-fetch when `refreshKey` changes via `useEffect`

The manual "Refresh" button remains as a force-refresh override.

## Files Changed

| File | Change |
|------|--------|
| `server/index.ts` | Add `GET /api/capacity` endpoint |
| `src/components/CapacityBanner.tsx` | New — dual progress bar component |
| `src/types.ts` | Add `CapacityData` interface |
| `src/App.tsx` | Auto-refresh hook, capacity fetch, render banner, pass refreshKey |
| `src/styles/modern.css` | Capacity banner styles |
| `src/components/WeeklyTimesheet.tsx` | Accept `refreshKey` prop, re-fetch on change |
| `src/components/WeeklySummary.tsx` | Accept `refreshKey` prop, re-fetch on change |
| `src/components/WorklogSummary.tsx` | Accept `refreshKey` prop, re-fetch on change |
