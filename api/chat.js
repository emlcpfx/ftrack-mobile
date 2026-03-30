export const config = { maxDuration: 60 };

import { FtrackClient, escapeQL, flattenDatetimes } from './ftrack-client.js';

// ── Tool definitions (subset of ftrack MCP tools relevant for producer work) ──

const TOOLS = [
  {
    name: 'ftrack_query',
    description: 'Execute a query using ftrack query language (FQL). Example: "select id, name from Project where status is active". Use this for any custom query not covered by convenience tools.',
    parameters: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'ftrack query expression' },
      },
      required: ['expression'],
    },
  },
  {
    name: 'ftrack_create',
    description: 'Create a new entity in ftrack. Common types: ReviewSession, ReviewSessionObject, Note, Appointment.',
    parameters: {
      type: 'object',
      properties: {
        entity_type: { type: 'string', description: 'Type of entity (e.g. "ReviewSession", "ReviewSessionObject", "Note")' },
        entity_data: { type: 'object', description: 'Entity data as key-value pairs' },
      },
      required: ['entity_type', 'entity_data'],
    },
  },
  {
    name: 'ftrack_update',
    description: 'Update an existing entity in ftrack.',
    parameters: {
      type: 'object',
      properties: {
        entity_type: { type: 'string', description: 'Type of entity' },
        entity_id: { type: 'string', description: 'ID of entity to update' },
        entity_data: { type: 'object', description: 'Data to update' },
      },
      required: ['entity_type', 'entity_id', 'entity_data'],
    },
  },
  {
    name: 'ftrack_delete',
    description: 'Delete an entity from ftrack.',
    parameters: {
      type: 'object',
      properties: {
        entity_type: { type: 'string', description: 'Type of entity' },
        entity_id: { type: 'string', description: 'ID of entity to delete' },
      },
      required: ['entity_type', 'entity_id'],
    },
  },
  {
    name: 'ftrack_list_projects',
    description: 'List all active projects.',
    parameters: {
      type: 'object',
      properties: {
        include_archived: { type: 'boolean', description: 'Include archived projects', default: false },
      },
    },
  },
  {
    name: 'ftrack_list_tasks',
    description: 'List tasks, optionally filtered by project, parent, assignee, or status.',
    parameters: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Project ID to filter by' },
        parent_id: { type: 'string', description: 'Parent shot/sequence ID to filter by' },
        assignee_id: { type: 'string', description: 'User ID to filter by assignee' },
        status: { type: 'string', description: 'Status name to filter by (e.g. "Client Review", "In Progress")' },
        limit: { type: 'number', description: 'Max results', default: 100 },
      },
    },
  },
  {
    name: 'ftrack_list_review_sessions',
    description: 'List review sessions, optionally filtered by project.',
    parameters: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Filter by project ID' },
        limit: { type: 'number', description: 'Max results', default: 50 },
      },
    },
  },
  {
    name: 'ftrack_list_statuses',
    description: 'List all available statuses with their IDs and colors.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'ftrack_list_asset_versions',
    description: 'List asset versions for a task or asset.',
    parameters: {
      type: 'object',
      properties: {
        asset_id: { type: 'string', description: 'Asset ID to filter by' },
        task_id: { type: 'string', description: 'Task ID to filter by' },
        limit: { type: 'number', description: 'Max results', default: 50 },
      },
    },
  },
  {
    name: 'ftrack_create_note',
    description: 'Create a note on any entity.',
    parameters: {
      type: 'object',
      properties: {
        entity_type: { type: 'string', description: 'Entity type to add note to' },
        entity_id: { type: 'string', description: 'Entity ID' },
        content: { type: 'string', description: 'Note text' },
      },
      required: ['entity_type', 'entity_id', 'content'],
    },
  },
  {
    name: 'ftrack_list_notes',
    description: 'List notes for an entity.',
    parameters: {
      type: 'object',
      properties: {
        entity_type: { type: 'string', description: 'Entity type' },
        entity_id: { type: 'string', description: 'Entity ID' },
        limit: { type: 'number', description: 'Max results', default: 50 },
      },
      required: ['entity_type', 'entity_id'],
    },
  },
  {
    name: 'ftrack_update_task_status',
    description: 'Update the status of a task.',
    parameters: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID' },
        status_id: { type: 'string', description: 'New status ID' },
      },
      required: ['task_id', 'status_id'],
    },
  },
  {
    name: 'ftrack_assign_user_to_task',
    description: 'Assign a user to a task.',
    parameters: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID' },
        user_id: { type: 'string', description: 'User ID to assign' },
      },
      required: ['task_id', 'user_id'],
    },
  },
  {
    name: 'list_shots',
    description: 'List shots for a project, optionally filtered by status.',
    parameters: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Project ID' },
        parent_id: { type: 'string', description: 'Sequence/parent ID' },
        status: { type: 'string', description: 'Status name filter' },
        limit: { type: 'number', description: 'Max results', default: 100 },
      },
    },
  },
  {
    name: 'ftrack_list_users',
    description: 'List all active users.',
    parameters: {
      type: 'object',
      properties: {
        include_inactive: { type: 'boolean', description: 'Include inactive users', default: false },
      },
    },
  },
];

// ── Tool execution ──

async function executeTool(client, name, args) {
  switch (name) {
    case 'ftrack_query':
      return client.query(args.expression);

    case 'ftrack_create':
      return client.create(args.entity_type, args.entity_data);

    case 'ftrack_update':
      return client.update(args.entity_type, args.entity_id, args.entity_data);

    case 'ftrack_delete':
      return client.delete(args.entity_type, args.entity_id);

    case 'ftrack_list_projects': {
      let expr = 'select id, name, full_name, status from Project';
      if (!args.include_archived) expr += ' where status.name is_not "archived"';
      expr += ' limit 100';
      return client.query(expr);
    }

    case 'ftrack_list_tasks': {
      let expr = 'select id, name, type.name, status.name, status.id, priority.name, parent.name, assignments.resource.username from Task';
      const conds = [];
      if (args.project_id) conds.push(`project_id is "${escapeQL(args.project_id)}"`);
      if (args.parent_id) conds.push(`parent_id is "${escapeQL(args.parent_id)}"`);
      if (args.assignee_id) conds.push(`assignments any (resource_id is "${escapeQL(args.assignee_id)}")`);
      if (args.status) conds.push(`status.name is "${escapeQL(args.status)}"`);
      if (conds.length) expr += ` where ${conds.join(' and ')}`;
      expr += ` limit ${args.limit || 100}`;
      return client.query(expr);
    }

    case 'ftrack_list_review_sessions': {
      let expr = 'select id, name, description, created_at from ReviewSession';
      if (args.project_id) expr += ` where project_id is "${escapeQL(args.project_id)}"`;
      expr += ` order by created_at descending limit ${args.limit || 50}`;
      return client.query(expr);
    }

    case 'ftrack_list_statuses':
      return client.query('select id, name, color, sort from Status order by sort');

    case 'ftrack_list_asset_versions': {
      let expr = 'select id, version, asset.name, task.name, task.id, user.username, date from AssetVersion';
      const conds = [];
      if (args.asset_id) conds.push(`asset_id is "${escapeQL(args.asset_id)}"`);
      if (args.task_id) conds.push(`task_id is "${escapeQL(args.task_id)}"`);
      if (conds.length) expr += ` where ${conds.join(' and ')}`;
      expr += ` order by version descending limit ${args.limit || 50}`;
      return client.query(expr);
    }

    case 'ftrack_create_note':
      return client.create('Note', {
        content: args.content,
        parent_type: args.entity_type,
        parent_id: args.entity_id,
      });

    case 'ftrack_list_notes': {
      const expr = `select id, content, author.username, date from Note where parent_type is "${escapeQL(args.entity_type)}" and parent_id is "${escapeQL(args.entity_id)}" order by date descending limit ${args.limit || 50}`;
      return client.query(expr);
    }

    case 'ftrack_update_task_status':
      return client.update('Task', args.task_id, { status_id: args.status_id });

    case 'ftrack_assign_user_to_task':
      return client.create('Appointment', {
        context_id: args.task_id,
        resource_id: args.user_id,
        type: 'assignment',
      });

    case 'list_shots': {
      let expr = 'select id, name, status.name, parent.name, start_frame, end_frame from Shot';
      const conds = [];
      if (args.project_id) conds.push(`project_id is "${escapeQL(args.project_id)}"`);
      if (args.parent_id) conds.push(`parent_id is "${escapeQL(args.parent_id)}"`);
      if (args.status) conds.push(`status.name is "${escapeQL(args.status)}"`);
      if (conds.length) expr += ` where ${conds.join(' and ')}`;
      expr += ` limit ${args.limit || 100}`;
      return client.query(expr);
    }

    case 'ftrack_list_users': {
      let expr = 'select id, username, first_name, last_name, email, is_active from User';
      if (!args.include_inactive) expr += ' where is_active is true';
      expr += ' limit 100';
      return client.query(expr);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── System prompt ──

const SYSTEM_PROMPT = `You are a production assistant for a VFX studio using ftrack. You help producers manage review sessions, tasks, shots, statuses, and notes.

Key ftrack concepts:
- Project contains Shots, which contain Tasks (e.g. Compositing, Animation)
- Tasks have statuses (e.g. "In Progress", "Client Review", "Approved")
- AssetVersions are published outputs attached to Tasks via Assets
- ReviewSession contains ReviewSessionObjects, each pointing to an AssetVersion
- To add a version to a review: create a ReviewSessionObject with review_session_id and asset_version_id
- To find versions for tasks: query AssetVersion where task_id is X, order by version descending
- Notes can be attached to any entity (Task, AssetVersion, etc.)

When adding tasks to a review session:
1. First find the tasks (use ftrack_list_tasks with status filter)
2. For each task, find its latest AssetVersion (query AssetVersion where task_id is X order by version desc limit 1)
3. Create a ReviewSessionObject with review_session_id and asset_version_id

Always confirm what you did with a summary. Be concise but informative.
If you need to look up IDs (projects, statuses, reviews), query for them first rather than guessing.
Truncate large result sets in your response — show key info, not raw JSON dumps.`;

// ── Claude API ──

async function callClaude(apiKey, messages, tools) {
  const claudeTools = tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));

  const claudeMessages = messages.map(m => ({
    role: m.role,
    content: m.content,
  }));

  let allMessages = [...claudeMessages];
  const maxIterations = 10;

  for (let i = 0; i < maxIterations; i++) {
    const body = {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: allMessages,
      tools: claudeTools,
    };

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Claude API error (${resp.status}): ${err}`);
    }

    const result = await resp.json();

    // Add assistant response to conversation
    allMessages.push({ role: 'assistant', content: result.content });

    // If no tool use, we're done
    if (result.stop_reason !== 'tool_use') {
      const textBlock = result.content.find(b => b.type === 'text');
      return textBlock?.text || '';
    }

    // Execute tool calls
    const toolResults = [];
    for (const block of result.content) {
      if (block.type !== 'tool_use') continue;
      let toolResult;
      try {
        const raw = await executeTool(null, block.name, block.input);
        toolResult = JSON.stringify(flattenDatetimes(raw), null, 2);
        // Truncate if too large
        if (toolResult.length > 8000) toolResult = toolResult.slice(0, 8000) + '\n... (truncated)';
      } catch (err) {
        toolResult = `Error: ${err.message}`;
      }
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: toolResult,
      });
    }

    allMessages.push({ role: 'user', content: toolResults });
  }

  return 'I reached the maximum number of steps. Please try a more specific request.';
}

async function callClaudeWithClient(apiKey, messages, client) {
  const claudeTools = TOOLS.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));

  const claudeMessages = messages.map(m => ({
    role: m.role,
    content: m.content,
  }));

  let allMessages = [...claudeMessages];
  const maxIterations = 10;

  for (let i = 0; i < maxIterations; i++) {
    const body = {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: allMessages,
      tools: claudeTools,
    };

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Claude API error (${resp.status}): ${err}`);
    }

    const result = await resp.json();
    allMessages.push({ role: 'assistant', content: result.content });

    if (result.stop_reason !== 'tool_use') {
      const textBlock = result.content.find(b => b.type === 'text');
      return textBlock?.text || '';
    }

    const toolResults = [];
    for (const block of result.content) {
      if (block.type !== 'tool_use') continue;
      let toolResult;
      try {
        const raw = await executeTool(client, block.name, block.input);
        toolResult = JSON.stringify(flattenDatetimes(raw), null, 2);
        if (toolResult.length > 8000) toolResult = toolResult.slice(0, 8000) + '\n... (truncated)';
      } catch (err) {
        toolResult = `Error: ${err.message}`;
      }
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: toolResult,
      });
    }

    allMessages.push({ role: 'user', content: toolResults });
  }

  return 'Reached maximum tool-call steps. Try a more specific request.';
}

// ── Gemini API ──

async function callGeminiWithClient(apiKey, messages, client) {
  const geminiTools = [{
    functionDeclarations: TOOLS.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    })),
  }];

  // Build Gemini conversation format
  const geminiContents = [];
  for (const m of messages) {
    geminiContents.push({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    });
  }

  const maxIterations = 10;

  for (let i = 0; i < maxIterations; i++) {
    const body = {
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: geminiContents,
      tools: geminiTools,
    };

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Gemini API error (${resp.status}): ${err}`);
    }

    const result = await resp.json();
    const candidate = result.candidates?.[0];
    if (!candidate) throw new Error('No response from Gemini');

    const parts = candidate.content?.parts || [];

    // Check for function calls
    const fnCalls = parts.filter(p => p.functionCall);

    if (fnCalls.length === 0) {
      // Pure text response
      const text = parts.map(p => p.text).filter(Boolean).join('');
      return text;
    }

    // Add the model's response (with function calls) to conversation
    geminiContents.push({ role: 'model', parts });

    // Execute each function call and build response parts
    const responseParts = [];
    for (const fc of fnCalls) {
      let toolResult;
      try {
        const raw = await executeTool(client, fc.functionCall.name, fc.functionCall.args || {});
        toolResult = flattenDatetimes(raw);
        // Truncate large results
        const str = JSON.stringify(toolResult);
        if (str.length > 8000) {
          toolResult = { data: JSON.parse(str.slice(0, 8000) + ']}'), truncated: true };
        }
      } catch (err) {
        toolResult = { error: err.message };
      }
      responseParts.push({
        functionResponse: {
          name: fc.functionCall.name,
          response: toolResult,
        },
      });
    }

    geminiContents.push({ role: 'user', parts: responseParts });
  }

  return 'Reached maximum tool-call steps. Try a more specific request.';
}

// ── Handler ──

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('POST only');

  const { messages, provider, llmApiKey, ftrackServer, ftrackUser, ftrackApiKey } = req.body;

  if (!messages || !provider || !llmApiKey) {
    return res.status(400).json({ error: 'Missing required fields: messages, provider, llmApiKey' });
  }
  if (!ftrackServer || !ftrackUser || !ftrackApiKey) {
    return res.status(400).json({ error: 'Missing ftrack credentials' });
  }

  try {
    const client = new FtrackClient(ftrackServer, ftrackUser, ftrackApiKey);
    let response;

    if (provider === 'claude') {
      response = await callClaudeWithClient(llmApiKey, messages, client);
    } else if (provider === 'gemini') {
      response = await callGeminiWithClient(llmApiKey, messages, client);
    } else {
      return res.status(400).json({ error: `Unknown provider: ${provider}` });
    }

    return res.status(200).json({ response });
  } catch (err) {
    console.error('[chat] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
