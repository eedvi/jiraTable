import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const jiraApi = axios.create({
  baseURL: `${process.env.JIRA_BASE_URL}/rest/api/3`,
  headers: {
    'Authorization': `Basic ${Buffer.from(
      `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`
    ).toString('base64')}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  }
});

// Run an async fn over items with bounded concurrency (avoid Jira rate limits).
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// Get all projects
app.get('/api/projects', async (_req, res) => {
  try {
    const response = await jiraApi.get('/project');
    res.json(response.data);
  } catch (error: any) {
    console.error('Error fetching projects:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Search issues with JQL
app.get('/api/issues', async (req, res) => {
  try {
    const { jql = 'order by created DESC', maxResults = 50 } = req.query;

    const fields = [
      'summary',
      'status',
      'priority',
      'assignee',
      'reporter',
      'created',
      'updated',
      'issuetype',
      'project',
      'labels'
    ].join(',');

    const response = await jiraApi.get('/search/jql', {
      params: {
        jql,
        maxResults: Number(maxResults),
        fields
      }
    });

    res.json(response.data);
  } catch (error: any) {
    console.error('Error fetching issues:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch issues', details: error.response?.data });
  }
});

// Get single issue with all details
app.get('/api/issues/:issueKey', async (req, res) => {
  try {
    const response = await jiraApi.get(`/issue/${req.params.issueKey}`, {
      params: {
        fields: [
          'summary',
          'description',
          'status',
          'priority',
          'assignee',
          'reporter',
          'created',
          'updated',
          'issuetype',
          'project',
          'labels',
          'comment',
          'timetracking',
          'timeoriginalestimate',
          'timeestimate',
          'timespent',
          'customfield_10016', // Story points
          'subtasks'
        ].join(','),
        expand: 'renderedFields'
      }
    });
    res.json(response.data);
  } catch (error: any) {
    console.error('Error fetching issue:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch issue' });
  }
});

// Update issue fields (story points, time tracking, etc.)
app.put('/api/issues/:issueKey', async (req, res) => {
  try {
    const response = await jiraApi.put(`/issue/${req.params.issueKey}`, req.body);
    res.json({ success: true, data: response.data });
  } catch (error: any) {
    console.error('Error updating issue:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to update issue', details: error.response?.data });
  }
});

// Get worklogs grouped by day for weekly timesheet
app.get('/api/worklogs/daily', async (req, res) => {
  try {
    // Get current user
    const userResponse = await jiraApi.get('/myself');
    const accountId = userResponse.data.accountId;

    // Calculate current week (Monday to Sunday)
    const now = new Date();
    const startDate = new Date();
    const currentDay = now.getDay();
    const daysToMonday = currentDay === 0 ? 6 : currentDay - 1;
    startDate.setDate(now.getDate() - daysToMonday);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date();
    const daysToSunday = currentDay === 0 ? 0 : 7 - currentDay;
    endDate.setDate(now.getDate() + daysToSunday);
    endDate.setHours(23, 59, 59, 999);

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    // Search for issues where user logged work this week
    const jql = `worklogAuthor = currentUser() AND worklogDate >= "${startDateStr}" ORDER BY updated DESC`;
    const issuesResponse = await jiraApi.get('/search/jql', {
      params: {
        jql,
        fields: 'summary,worklog',
        maxResults: 1000
      }
    });

    // Initialize daily totals (Monday to Sunday)
    const dailyTotals: { [key: string]: { date: string, dayName: string, totalSeconds: number, worklogs: any[] } } = {};

    // Create entries for all 7 days of the week
    for (let i = 0; i < 7; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayName = dayNames[date.getDay()];

      dailyTotals[dateStr] = {
        date: dateStr,
        dayName,
        totalSeconds: 0,
        worklogs: []
      };
    }

    // Fetch each issue's worklogs concurrently (bounded), then aggregate.
    // Read-only: due-date adjustment lives in POST /api/worklogs/adjust-dates.
    const perIssueEntries = await mapLimit(issuesResponse.data.issues || [], 8, async (issue: any) => {
      try {
        const worklogResponse = await jiraApi.get(`/issue/${issue.key}/worklog`);
        const entries: { dateStr: string; issueKey: string; summary: string; timeSpentSeconds: number; started: string }[] = [];
        for (const worklog of worklogResponse.data.worklogs || []) {
          if (worklog.author.accountId === accountId) {
            const worklogDate = new Date(worklog.started);
            if (worklogDate >= startDate && worklogDate <= endDate) {
              entries.push({
                dateStr: worklogDate.toISOString().split('T')[0],
                issueKey: issue.key,
                summary: issue.fields.summary,
                timeSpentSeconds: worklog.timeSpentSeconds,
                started: worklog.started
              });
            }
          }
        }
        return entries;
      } catch (err) {
        console.error(`Error fetching worklogs for ${issue.key}:`, err);
        return [];
      }
    });

    let totalSeconds = 0;
    for (const entries of perIssueEntries) {
      for (const entry of entries) {
        const day = dailyTotals[entry.dateStr];
        if (day) {
          day.totalSeconds += entry.timeSpentSeconds;
          day.worklogs.push({
            issueKey: entry.issueKey,
            summary: entry.summary,
            timeSpentSeconds: entry.timeSpentSeconds,
            started: entry.started
          });
          totalSeconds += entry.timeSpentSeconds;
        }
      }
    }

    // Convert to array and calculate hours
    const dailyData = Object.values(dailyTotals).map(day => ({
      ...day,
      totalHours: Math.round((day.totalSeconds / 3600) * 100) / 100,
      goalHours: 8,
      progress: Math.floor((day.totalSeconds / (8 * 3600)) * 100)
    }));

    res.json({
      weekStart: startDate.toISOString().split('T')[0],
      weekEnd: endDate.toISOString().split('T')[0],
      dailyData,
      totalSeconds,
      totalHours: Math.round((totalSeconds / 3600) * 100) / 100,
      weeklyGoalHours: 40,
      weeklyProgress: Math.floor((totalSeconds / (40 * 3600)) * 100)
    });
  } catch (error: any) {
    console.error('Error fetching daily worklogs:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch daily worklogs', details: error.response?.data });
  }
});

// Explicit action: align due dates of this week's worked issues to Friday.
// (Previously this ran as a side effect of GET /api/worklogs/daily.)
app.post('/api/worklogs/adjust-dates', async (_req, res) => {
  try {
    // Current week (Monday to Sunday)
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
    const endDateStr = endDate.toISOString().split('T')[0];

    // Friday of the current week (2 days before Sunday)
    const fridayDate = new Date(endDate);
    fridayDate.setDate(endDate.getDate() - 2);
    const adjustedDate = fridayDate.toISOString().split('T')[0];

    // Issues the user logged work on this week
    const jql = `worklogAuthor = currentUser() AND worklogDate >= "${startDateStr}" ORDER BY updated DESC`;
    const issuesResponse = await jiraApi.get('/search/jql', {
      params: { jql, fields: 'duedate,issuetype,parent', maxResults: 1000 }
    });

    const adjusted: string[] = [];

    for (const issue of issuesResponse.data.issues || []) {
      const duedate = issue.fields.duedate;
      const isSubtask = issue.fields.issuetype?.subtask === true;
      const needsAdjustment = !duedate || duedate < startDateStr || duedate > endDateStr;
      if (!needsAdjustment) continue;

      try {
        await jiraApi.put(`/issue/${issue.key}`, { fields: { duedate: adjustedDate } });
        adjusted.push(`${issue.key} (${isSubtask ? 'Subtarea' : 'Historia'})`);

        // If it's a subtask, align the parent story too
        if (isSubtask && issue.fields.parent) {
          const parentKey = issue.fields.parent.key;
          const parentResponse = await jiraApi.get(`/issue/${parentKey}`, { params: { fields: 'duedate' } });
          const parentDuedate = parentResponse.data.fields.duedate;
          const parentNeedsAdjustment = !parentDuedate || parentDuedate < startDateStr || parentDuedate > endDateStr;
          if (parentNeedsAdjustment) {
            await jiraApi.put(`/issue/${parentKey}`, { fields: { duedate: adjustedDate } });
            adjusted.push(`${parentKey} (Historia padre)`);
          }
        }
      } catch (adjustErr: any) {
        console.error(`Error adjusting ${issue.key}:`, adjustErr.response?.data || adjustErr.message);
      }
    }

    res.json({ adjusted, adjustedDate });
  } catch (error: any) {
    console.error('Error adjusting due dates:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to adjust due dates', details: error.response?.data });
  }
});

// Get worklogs for current user (by time period)
app.get('/api/worklogs', async (req, res) => {
  try {
    const { period = 'week' } = req.query; // week, month, all

    // Get current user
    const userResponse = await jiraApi.get('/myself');
    const accountId = userResponse.data.accountId;

    // Calculate date range
    const now = new Date();
    const startDate = new Date();
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999); // End of today

    if (period === 'week') {
      // Current week (Monday to Sunday)
      const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const daysToMonday = currentDay === 0 ? 6 : currentDay - 1; // If Sunday, go back 6 days
      startDate.setDate(now.getDate() - daysToMonday);
      startDate.setHours(0, 0, 0, 0); // Start of Monday

      // End date is end of Sunday of current week
      const daysToSunday = currentDay === 0 ? 0 : 7 - currentDay;
      endDate.setDate(now.getDate() + daysToSunday);
      endDate.setHours(23, 59, 59, 999);
    } else if (period === 'month') {
      // Current month (from 1st of the month)
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);

      // End date is last day of current month
      endDate.setMonth(now.getMonth() + 1, 0);
      endDate.setHours(23, 59, 59, 999);
    } else {
      // All time - last 365 days
      startDate.setDate(now.getDate() - 365);
      endDate.setHours(23, 59, 59, 999);
    }

    const startDateStr = startDate.toISOString().split('T')[0];

    // Search for issues where user logged work
    const jql = `worklogAuthor = currentUser() AND worklogDate >= "${startDateStr}" ORDER BY updated DESC`;
    const issuesResponse = await jiraApi.get('/search/jql', {
      params: {
        jql,
        fields: 'summary,worklog',
        maxResults: 1000
      }
    });

    // Fetch each issue's worklogs concurrently (bounded), then aggregate.
    const perIssue = await mapLimit(issuesResponse.data.issues || [], 8, async (issue: any) => {
      try {
        const worklogResponse = await jiraApi.get(`/issue/${issue.key}/worklog`);
        let issueTotal = 0;
        const issueWorklogs: any[] = [];
        for (const worklog of worklogResponse.data.worklogs || []) {
          if (worklog.author.accountId === accountId) {
            const worklogDate = new Date(worklog.started);
            if (worklogDate >= startDate && worklogDate <= endDate) {
              issueTotal += worklog.timeSpentSeconds;
              issueWorklogs.push({
                id: worklog.id,
                timeSpentSeconds: worklog.timeSpentSeconds,
                started: worklog.started,
                comment: worklog.comment
              });
            }
          }
        }
        return issueTotal > 0
          ? { issueKey: issue.key, summary: issue.fields.summary, totalSeconds: issueTotal, worklogs: issueWorklogs }
          : null;
      } catch (err) {
        console.error(`Error fetching worklogs for ${issue.key}:`, err);
        return null;
      }
    });

    const worklogsByIssue = perIssue.filter((x): x is NonNullable<typeof x> => x !== null);
    const totalSeconds = worklogsByIssue.reduce((sum, i) => sum + i.totalSeconds, 0);

    // Convert to hours
    const totalHours = totalSeconds / 3600;

    res.json({
      period,
      totalSeconds,
      totalHours: Math.round(totalHours * 100) / 100,
      worklogsByIssue
    });
  } catch (error: any) {
    console.error('Error fetching worklogs:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch worklogs', details: error.response?.data });
  }
});

// Get worklogs for a specific issue
app.get('/api/issues/:issueKey/worklogs', async (req, res) => {
  try {
    const response = await jiraApi.get(`/issue/${req.params.issueKey}/worklog`);
    res.json(response.data);
  } catch (error: any) {
    console.error('Error fetching issue worklogs:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch issue worklogs', details: error.response?.data });
  }
});

// Add worklog (log time)
app.post('/api/issues/:issueKey/worklog', async (req, res) => {
  try {
    const { timeSpentSeconds, comment } = req.body;
    const response = await jiraApi.post(`/issue/${req.params.issueKey}/worklog`, {
      timeSpentSeconds,
      comment: comment ? {
        type: 'doc',
        version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: comment }] }]
      } : undefined
    });
    res.json({ success: true, data: response.data });
  } catch (error: any) {
    console.error('Error adding worklog:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to add worklog', details: error.response?.data });
  }
});

// Add comment
app.post('/api/issues/:issueKey/comment', async (req, res) => {
  try {
    const { body } = req.body;
    const response = await jiraApi.post(`/issue/${req.params.issueKey}/comment`, {
      body: {
        type: 'doc',
        version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: body }] }]
      }
    });
    res.json({ success: true, data: response.data });
  } catch (error: any) {
    console.error('Error adding comment:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to add comment', details: error.response?.data });
  }
});

// Get all statuses
app.get('/api/statuses', async (_req, res) => {
  try {
    const response = await jiraApi.get('/status');
    res.json(response.data);
  } catch (error: any) {
    console.error('Error fetching statuses:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch statuses' });
  }
});

// Get available transitions for an issue
app.get('/api/issues/:issueKey/transitions', async (req, res) => {
  try {
    const response = await jiraApi.get(`/issue/${req.params.issueKey}/transitions`);
    res.json(response.data);
  } catch (error: any) {
    console.error('Error fetching transitions:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch transitions' });
  }
});

// Transition issue to new status
app.post('/api/issues/:issueKey/transitions', async (req, res) => {
  try {
    const { transitionId } = req.body;
    const response = await jiraApi.post(`/issue/${req.params.issueKey}/transitions`, {
      transition: { id: transitionId }
    });
    res.json({ success: true, data: response.data });
  } catch (error: any) {
    console.error('Error transitioning issue:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to transition issue', details: error.response?.data });
  }
});

// Get subtasks for an issue
app.get('/api/issues/:issueKey/subtasks', async (req, res) => {
  try {
    const response = await jiraApi.get(`/issue/${req.params.issueKey}`, {
      params: {
        fields: 'subtasks'
      }
    });
    res.json(response.data.fields.subtasks || []);
  } catch (error: any) {
    console.error('Error fetching subtasks:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch subtasks' });
  }
});

// Create subtask with daily report template
app.post('/api/issues/:issueKey/subtasks', async (req, res) => {
  try {
    const { summary, projectName } = req.body;

    // Get parent issue details
    const parentIssue = await jiraApi.get(`/issue/${req.params.issueKey}`, {
      params: { fields: 'project,issuetype' }
    });

    const projectKey = parentIssue.data.fields.project.key;

    // Get subtask issue type ID
    const issueTypesResponse = await jiraApi.get(`/project/${projectKey}/statuses`);
    let subtaskTypeId = '10003'; // Default subtask type ID

    // Try to find the subtask issue type
    for (const issueType of issueTypesResponse.data) {
      if (issueType.name === 'Subtask' || issueType.subtask === true) {
        subtaskTypeId = issueType.id;
        break;
      }
    }

    // Get current date in DD/MM/YYYY format
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

    // Create subtask
    const createResponse = await jiraApi.post('/issue', {
      fields: {
        project: { key: projectKey },
        parent: { key: req.params.issueKey },
        summary: summary,
        issuetype: { id: subtaskTypeId }
      }
    });

    const subtaskKey = createResponse.data.key;

    // Add daily report template as comment
    try {
      await jiraApi.post(`/issue/${subtaskKey}/comment`, {
        body: {
          type: 'doc',
          version: 1,
          content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', text: '🔹 ', marks: [{ type: 'strong' }] },
                  { type: 'text', text: 'Fecha: ', marks: [{ type: 'strong' }] },
                  { type: 'text', text: dateStr }
                ]
              },
              {
                type: 'paragraph',
                content: [
                  { type: 'text', text: '🔹 ', marks: [{ type: 'strong' }] },
                  { type: 'text', text: 'Proyecto: ', marks: [{ type: 'strong' }] },
                  { type: 'text', text: projectName || parentIssue.data.fields.project.name }
                ]
              },
              {
                type: 'paragraph',
                content: [
                  { type: 'text', text: '🔹 ', marks: [{ type: 'strong' }] },
                  { type: 'text', text: 'Subtarea asignada: ', marks: [{ type: 'strong' }] },
                  { type: 'text', text: summary }
                ]
              },
              {
                type: 'paragraph',
                content: [
                  { type: 'text', text: '🔹 ', marks: [{ type: 'strong' }] },
                  { type: 'text', text: 'Estado actual: ', marks: [{ type: 'strong' }] },
                  { type: 'text', text: 'Por iniciar' }
                ]
              },
              {
                type: 'paragraph',
                content: [
                  { type: 'text', text: '🔹 ', marks: [{ type: 'strong' }] },
                  { type: 'text', text: 'Tiempo invertido: ', marks: [{ type: 'strong' }] },
                  { type: 'text', text: '00:00' }
                ]
              },
              { type: 'rule' },
              {
                type: 'heading',
                attrs: { level: 3 },
                content: [
                  { type: 'text', text: '1️⃣ Avances del día', marks: [{ type: 'strong' }] }
                ]
              },
              {
                type: 'paragraph',
                content: [
                  { type: 'text', text: '📌 ', marks: [{ type: 'strong' }] },
                  { type: 'text', text: 'Descripción detallada de lo realizado:', marks: [{ type: 'strong' }] }
                ]
              },
              {
                type: 'bulletList',
                content: [
                  {
                    type: 'listItem',
                    content: [
                      {
                        type: 'paragraph',
                        content: [{ type: 'text', text: '[Explicar en qué consistió el trabajo realizado]' }]
                      }
                    ]
                  },
                  {
                    type: 'listItem',
                    content: [
                      {
                        type: 'paragraph',
                        content: [{ type: 'text', text: '[Incluir enlaces a PRs, commits o documentación generada]' }]
                      }
                    ]
                  },
                  {
                    type: 'listItem',
                    content: [
                      {
                        type: 'paragraph',
                        content: [{ type: 'text', text: '[Mencionar pruebas realizadas y resultados obtenidos]' }]
                      }
                    ]
                  }
                ]
              },
              { type: 'rule' },
              {
                type: 'heading',
                attrs: { level: 3 },
                content: [
                  { type: 'text', text: '2️⃣ Retos o dificultades encontradas', marks: [{ type: 'strong' }] }
                ]
              },
              {
                type: 'paragraph',
                content: [
                  { type: 'text', text: '📌 ', marks: [{ type: 'strong' }] },
                  { type: 'text', text: 'Problemas identificados y cómo se resolvieron:', marks: [{ type: 'strong' }] }
                ]
              },
              {
                type: 'bulletList',
                content: [
                  {
                    type: 'listItem',
                    content: [
                      {
                        type: 'paragraph',
                        content: [{ type: 'text', text: '[Describir cualquier bloqueo técnico, error o duda surgida]' }]
                      }
                    ]
                  },
                  {
                    type: 'listItem',
                    content: [
                      {
                        type: 'paragraph',
                        content: [{ type: 'text', text: '[Explicar si se encontró una solución y cuál fue]' }]
                      }
                    ]
                  }
                ]
              },
              { type: 'rule' },
              {
                type: 'heading',
                attrs: { level: 3 },
                content: [
                  { type: 'text', text: '3️⃣ Plan para el siguiente día', marks: [{ type: 'strong' }] }
                ]
              },
              {
                type: 'paragraph',
                content: [
                  { type: 'text', text: '📌 ', marks: [{ type: 'strong' }] },
                  { type: 'text', text: 'Tareas previstas y próximos pasos:', marks: [{ type: 'strong' }] }
                ]
              },
              {
                type: 'bulletList',
                content: [
                  {
                    type: 'listItem',
                    content: [
                      {
                        type: 'paragraph',
                        content: [{ type: 'text', text: '[Listar lo que se trabajará mañana]' }]
                      }
                    ]
                  },
                  {
                    type: 'listItem',
                    content: [
                      {
                        type: 'paragraph',
                        content: [{ type: 'text', text: '[Incluir dependencias de otros miembros del equipo si aplica]' }]
                      }
                    ]
                  }
                ]
              },
              { type: 'rule' },
              {
                type: 'heading',
                attrs: { level: 3 },
                content: [
                  { type: 'text', text: '4️⃣ Comentarios adicionales', marks: [{ type: 'strong' }] }
                ]
              },
              {
                type: 'paragraph',
                content: [
                  { type: 'text', text: '📌 ', marks: [{ type: 'strong' }] },
                  { type: 'text', text: 'Observaciones generales, feedback recibido o cualquier otra nota relevante.', marks: [{ type: 'strong' }] }
                ]
              }
            ]
        }
      });
    } catch (commentError: any) {
      console.error('Error adding comment:', commentError.response?.data || commentError.message);
    }

    res.json({ success: true, data: createResponse.data });
  } catch (error: any) {
    console.error('Error creating subtask:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to create subtask',
      details: error.response?.data
    });
  }
});

// Get worklogs grouped by weeks (for weekly summary view)
app.get('/api/worklogs/weeks', async (req, res) => {
  try {
    const { weeksBack = 12 } = req.query; // Default: last 12 weeks

    // Get current user
    const userResponse = await jiraApi.get('/myself');
    const accountId = userResponse.data.accountId;

    // Calculate date range (last N weeks)
    const now = new Date();
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    const startDate = new Date();
    startDate.setDate(now.getDate() - (Number(weeksBack) * 7));
    startDate.setHours(0, 0, 0, 0);

    const startDateStr = startDate.toISOString().split('T')[0];

    // Search for issues where user logged work
    const jql = `worklogAuthor = currentUser() AND worklogDate >= "${startDateStr}" ORDER BY updated DESC`;
    const issuesResponse = await jiraApi.get('/search/jql', {
      params: {
        jql,
        fields: 'summary,worklog',
        maxResults: 1000
      }
    });

    // Initialize weeks structure
    const weeksData: { [key: string]: { 
      weekStart: string, 
      weekEnd: string, 
      totalSeconds: number, 
      totalHours: number,
      dailyBreakdown: { [key: string]: number },
      issuesBreakdown: { [key: string]: { summary: string, hours: number, seconds: number } }
    } } = {};

    // Fetch each issue's worklogs concurrently (bounded), then aggregate by week.
    const perIssue = await mapLimit(issuesResponse.data.issues || [], 8, async (issue: any) => {
      try {
        const worklogResponse = await jiraApi.get(`/issue/${issue.key}/worklog`);
        const entries: { issueKey: string; summary: string; timeSpentSeconds: number; started: string }[] = [];
        for (const worklog of worklogResponse.data.worklogs || []) {
          if (worklog.author.accountId === accountId) {
            const worklogDate = new Date(worklog.started);
            if (worklogDate >= startDate && worklogDate <= endDate) {
              entries.push({
                issueKey: issue.key,
                summary: issue.fields.summary,
                timeSpentSeconds: worklog.timeSpentSeconds,
                started: worklog.started
              });
            }
          }
        }
        return entries;
      } catch (err) {
        console.error(`Error fetching worklogs for ${issue.key}:`, err);
        return [];
      }
    });

    for (const entries of perIssue) {
      for (const entry of entries) {
        const worklogDate = new Date(entry.started);
        // Calculate week start (Sunday) and week end (Saturday)
        const weekStart = new Date(worklogDate);
        const dayOfWeek = worklogDate.getDay();
        const daysToSunday = dayOfWeek === 0 ? 0 : dayOfWeek;
        weekStart.setDate(worklogDate.getDate() - daysToSunday);
        weekStart.setHours(0, 0, 0, 0);

        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);

        const weekKey = weekStart.toISOString().split('T')[0];
        const dateStr = worklogDate.toISOString().split('T')[0];

        if (!weeksData[weekKey]) {
          weeksData[weekKey] = {
            weekStart: weekStart.toISOString().split('T')[0],
            weekEnd: weekEnd.toISOString().split('T')[0],
            totalSeconds: 0,
            totalHours: 0,
            dailyBreakdown: {},
            issuesBreakdown: {}
          };
        }

        weeksData[weekKey].totalSeconds += entry.timeSpentSeconds;
        weeksData[weekKey].dailyBreakdown[dateStr] = (weeksData[weekKey].dailyBreakdown[dateStr] || 0) + entry.timeSpentSeconds;

        if (!weeksData[weekKey].issuesBreakdown[entry.issueKey]) {
          weeksData[weekKey].issuesBreakdown[entry.issueKey] = {
            summary: entry.summary,
            hours: 0,
            seconds: 0
          };
        }
        weeksData[weekKey].issuesBreakdown[entry.issueKey].seconds += entry.timeSpentSeconds;
        weeksData[weekKey].issuesBreakdown[entry.issueKey].hours = Math.round((weeksData[weekKey].issuesBreakdown[entry.issueKey].seconds / 3600) * 100) / 100;
      }
    }

    // Convert to array, calculate hours, and sort by week start descending
    const weeks = Object.values(weeksData)
      .map(week => ({
        ...week,
        totalHours: Math.round((week.totalSeconds / 3600) * 100) / 100,
        dailyBreakdown: Object.entries(week.dailyBreakdown).reduce((acc, [date, seconds]) => {
          acc[date] = Math.round((seconds / 3600) * 100) / 100;
          return acc;
        }, {} as { [key: string]: number }),
        issues: Object.entries(week.issuesBreakdown)
          .map(([key, data]) => ({
            issueKey: key,
            summary: data.summary,
            hours: data.hours
          }))
          .sort((a, b) => b.hours - a.hours)
      }))
      .sort((a, b) => new Date(b.weekStart).getTime() - new Date(a.weekStart).getTime());

    res.json({
      weeksBack: Number(weeksBack),
      totalWeeks: weeks.length,
      weeks
    });
  } catch (error: any) {
    console.error('Error fetching weekly worklogs:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch weekly worklogs', details: error.response?.data });
  }
});

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

    const perIssueSeconds = await mapLimit(worklogResponse.data.issues || [], 8, async (issue: any) => {
      try {
        const wlResponse = await jiraApi.get(`/issue/${issue.key}/worklog`);
        let seconds = 0;
        for (const worklog of wlResponse.data.worklogs || []) {
          if (worklog.author.accountId === accountId) {
            const worklogDate = new Date(worklog.started);
            if (worklogDate >= startDate && worklogDate <= endDate) {
              seconds += worklog.timeSpentSeconds;
            }
          }
        }
        return seconds;
      } catch (err) {
        console.error(`Error fetching worklogs for ${issue.key}:`, err);
        return 0;
      }
    });
    const loggedSeconds = perIssueSeconds.reduce((a, b) => a + b, 0);

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

// Health check
app.get('/api/health', async (_req, res) => {
  try {
    const response = await jiraApi.get('/myself');
    res.json({ status: 'ok', message: 'Connected to Jira', user: response.data.displayName });
  } catch (error: any) {
    console.error('Health check error:', error.response?.data || error.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to connect to Jira',
      details: error.response?.data || error.message
    });
  }
});

// Serve the built client (npm start). Dev uses Vite's own server on :5173,
// so this only matters in production. cwd is the project root under npm start.
const clientDist = path.join(process.cwd(), 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
