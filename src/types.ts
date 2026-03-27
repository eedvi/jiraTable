export interface JiraIssue {
  id: string
  key: string
  fields: {
    summary: string
    status: {
      name: string
      statusCategory: {
        key: string
        colorName: string
      }
    }
    priority: {
      name: string
      iconUrl: string
    } | null
    assignee: {
      displayName: string
      avatarUrls: { '24x24': string }
      accountId: string
    } | null
    reporter: {
      displayName: string
    } | null
    created: string
    updated: string
    issuetype: {
      name: string
      iconUrl: string
    }
    project: {
      key: string
      name: string
    }
    labels: string[]
  }
}

export interface Project {
  id: string
  key: string
  name: string
}

export interface Comment {
  id: string
  author: {
    displayName: string
    avatarUrls: { '24x24': string }
  }
  body: any // Atlassian Document Format
  created: string
  updated: string
}

export interface TimeTracking {
  originalEstimate?: string
  remainingEstimate?: string
  timeSpent?: string
  originalEstimateSeconds?: number
  remainingEstimateSeconds?: number
  timeSpentSeconds?: number
}

export interface Subtask {
  id: string
  key: string
  fields: {
    summary: string
    status: {
      name: string
      statusCategory: {
        key: string
      }
    }
    issuetype: {
      name: string
      iconUrl: string
    }
  }
}

export interface IssueDetail {
  id: string
  key: string
  fields: {
    summary: string
    description: any // Atlassian Document Format
    status: {
      name: string
      id: string
      statusCategory: {
        key: string
        colorName: string
      }
    }
    priority: {
      name: string
      iconUrl: string
      id: string
    } | null
    assignee: {
      displayName: string
      avatarUrls: { '24x24': string }
      accountId: string
    } | null
    reporter: {
      displayName: string
      avatarUrls: { '24x24': string }
    } | null
    created: string
    updated: string
    issuetype: {
      name: string
      iconUrl: string
    }
    project: {
      key: string
      name: string
    }
    labels: string[]
    // Story points - custom field (varies by Jira instance)
    customfield_10016?: number // Common story points field
    // Time tracking
    timetracking?: TimeTracking
    timeoriginalestimate?: number
    timeestimate?: number
    timespent?: number
    // Comments
    comment?: {
      comments: Comment[]
      total: number
    }
    // Subtasks
    subtasks?: Subtask[]
  }
}

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
