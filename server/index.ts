import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';

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

const formatTime = (date: Date) =>
  date.toLocaleTimeString('es-GT', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

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
    const weekOffset = Number(req.query.weekOffset || 0);
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

const toDateKey = (date: Date) =>
  date.toLocaleDateString('sv-SE'); // YYYY-MM-DD local

// Get worklogs grouped by day for weekly timesheet
app.get('/api/worklogs/daily', async (req, res) => {
  try {
    const weekOffset = Number(req.query.weekOffset || 0);
    // Get current user
    const userResponse = await jiraApi.get('/myself');
    const accountId = userResponse.data.accountId;

    // Calculate current week (Monday to Sunday)
    // const now = new Date();
    // const startDate = new Date();
    // const currentDay = now.getDay();
    // const daysToMonday = currentDay === 0 ? 6 : currentDay - 1;
    // startDate.setDate(now.getDate() - daysToMonday);
    // startDate.setHours(0, 0, 0, 0);

    // const endDate = new Date();
    // const daysToSunday = currentDay === 0 ? 0 : 7 - currentDay;
    // endDate.setDate(now.getDate() + daysToSunday);
    // endDate.setHours(23, 59, 59, 999);

    // const startDateStr = startDate.toISOString().split('T')[0];

    // Calculate week (Monday to Sunday) with offset (LOCAL TIME)
    const now = new Date();
    now.setDate(now.getDate() + weekOffset * 7);
    now.setHours(12, 0, 0, 0); // evita bug UTC

    const currentDay = now.getDay(); // 0 = domingo
    const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;

    const startDate = new Date(now);
    startDate.setDate(now.getDate() + diffToMonday);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);

    const startDateStr = toDateKey(startDate);

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
      // const dateStr = date.toISOString().split('T')[0];
      const dateStr = toDateKey(date);
      const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      const dayName = dayNames[date.getDay()];

      dailyTotals[dateStr] = {
        date: dateStr,
        dayName,
        totalSeconds: 0,
        worklogs: []
      };
    }

    let totalSeconds = 0;

    // Process each issue's worklogs
    for (const issue of issuesResponse.data.issues || []) {
      try {
        const worklogResponse = await jiraApi.get(`/issue/${issue.key}/worklog`);
        const worklogs = worklogResponse.data.worklogs || [];

        for (const worklog of worklogs) {
          if (worklog.author.accountId === accountId) {
            const worklogDate = new Date(worklog.started);
            if (worklogDate >= startDate && worklogDate <= endDate) {
              // const dateStr = worklogDate.toISOString().split('T')[0];
              const dateStr = toDateKey(worklogDate);

              if (dailyTotals[dateStr]) {
                dailyTotals[dateStr].totalSeconds += worklog.timeSpentSeconds;
                const startTime = new Date(worklog.started);
                const endTime = new Date(
                  startTime.getTime() + worklog.timeSpentSeconds * 1000
                );

                dailyTotals[dateStr].worklogs.push({
                  issueKey: issue.key,
                  summary: issue.fields.summary,
                  timeSpentSeconds: worklog.timeSpentSeconds,
                  started: worklog.started,
                  from: formatTime(startTime),
                  to: formatTime(endTime)
                });
                totalSeconds += worklog.timeSpentSeconds;
              }
            }
          }
        }
      } catch (err) {
        console.error(`Error fetching worklogs for ${issue.key}:`, err);
      }
    }

    Object.values(dailyTotals).forEach(day => {
      day.worklogs.sort((a, b) => {
        return new Date(b.started).getTime() - new Date(a.started).getTime();
      });
    });

    // Convert to array and calculate hours
    const dailyData = Object.values(dailyTotals).map(day => ({
      ...day,
      totalHours: Math.round((day.totalSeconds / 3600) * 100) / 100,
      goalHours: 8,
      progress: Math.round((day.totalSeconds / (8 * 3600)) * 100)
    }));

    res.json({
      // weekStart: startDate.toISOString().split('T')[0],
      // weekEnd: endDate.toISOString().split('T')[0],
      weekStart: toDateKey(startDate),
      weekEnd: toDateKey(endDate),
      dailyData,
      totalSeconds,
      totalHours: Math.round((totalSeconds / 3600) * 100) / 100,
      weeklyGoalHours: 40,
      weeklyProgress: Math.round((totalSeconds / (40 * 3600)) * 100)
    });
  } catch (error: any) {
    console.error('Error fetching daily worklogs:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch daily worklogs', details: error.response?.data });
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

    // const startDateStr = startDate.toISOString().split('T')[0];
    const startDateStr = toDateKey(startDate);

    // Search for issues where user logged work
    const jql = `worklogAuthor = currentUser() AND worklogDate >= "${startDateStr}" ORDER BY updated DESC`;
    const issuesResponse = await jiraApi.get('/search/jql', {
      params: {
        jql,
        fields: 'summary,worklog',
        maxResults: 1000
      }
    });

    let totalSeconds = 0;
    const worklogsByIssue: any[] = [];

    // Process each issue's worklogs
    for (const issue of issuesResponse.data.issues || []) {
      try {
        // Get all worklogs for this issue
        const worklogResponse = await jiraApi.get(`/issue/${issue.key}/worklog`);
        const worklogs = worklogResponse.data.worklogs || [];

        let issueTotal = 0;
        const issueWorklogs: any[] = [];

        for (const worklog of worklogs) {
          // Filter by author and date
          if (worklog.author.accountId === accountId) {
            const worklogDate = new Date(worklog.started);
            if (worklogDate >= startDate && worklogDate <= endDate) {
              totalSeconds += worklog.timeSpentSeconds;
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

        if (issueTotal > 0) {
          worklogsByIssue.push({
            issueKey: issue.key,
            summary: issue.fields.summary,
            totalSeconds: issueTotal,
            worklogs: issueWorklogs
          });
        }
      } catch (err) {
        console.error(`Error fetching worklogs for ${issue.key}:`, err);
      }
    }

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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
