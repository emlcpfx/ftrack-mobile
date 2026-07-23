/**
 * Client-side chat with Gemini + logged-in @ftrack/api session.
 * Used when /api/chat is unreachable (CEP panel, local vite without Vercel).
 */
import { getSession } from '../api/ftrack.js';

const TOOLS = [
  {
    name: 'ftrack_query',
    description: 'Execute a query using ftrack query language (FQL).',
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
    description: 'Create a new entity in ftrack.',
    parameters: {
      type: 'object',
      properties: {
        entity_type: { type: 'string' },
        entity_data: { type: 'object' },
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
        entity_type: { type: 'string' },
        entity_id: { type: 'string' },
        entity_data: { type: 'object' },
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
        entity_type: { type: 'string' },
        entity_id: { type: 'string' },
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
        include_archived: { type: 'boolean' },
      },
    },
  },
  {
    name: 'ftrack_list_tasks',
    description: 'List tasks, optionally filtered.',
    parameters: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        parent_id: { type: 'string' },
        assignee_id: { type: 'string' },
        status: { type: 'string' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'ftrack_list_review_sessions',
    description: 'List review sessions.',
    parameters: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'ftrack_list_statuses',
    description: 'List all available statuses.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'ftrack_list_asset_versions',
    description: 'List asset versions for a task or asset.',
    parameters: {
      type: 'object',
      properties: {
        asset_id: { type: 'string' },
        task_id: { type: 'string' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'ftrack_create_note',
    description: 'Create a note on any entity.',
    parameters: {
      type: 'object',
      properties: {
        entity_type: { type: 'string' },
        entity_id: { type: 'string' },
        content: { type: 'string' },
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
        entity_type: { type: 'string' },
        entity_id: { type: 'string' },
        limit: { type: 'number' },
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
        task_id: { type: 'string' },
        status_id: { type: 'string' },
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
        task_id: { type: 'string' },
        user_id: { type: 'string' },
      },
      required: ['task_id', 'user_id'],
    },
  },
  {
    name: 'list_shots',
    description: 'List shots for a project.',
    parameters: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        parent_id: { type: 'string' },
        status: { type: 'string' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'ftrack_list_users',
    description: 'List active users.',
    parameters: {
      type: 'object',
      properties: {
        include_inactive: { type: 'boolean' },
      },
    },
  },
];

const SYSTEM_PROMPT = `You are a production assistant for a VFX studio using ftrack. You help producers manage review sessions, tasks, shots, statuses, and notes.

Key ftrack concepts:
- Project contains Shots, which contain Tasks (e.g. Compositing, Animation)
- Tasks have statuses (e.g. "In Progress", "Client Review", "Approved", "QC Ready")
- AssetVersions are published outputs attached to Tasks via Assets
- ReviewSession contains ReviewSessionObjects, each pointing to an AssetVersion

Always confirm what you did with a summary. Be concise.
If you need IDs, query for them first rather than guessing.
Truncate large result sets — show key info, not raw JSON dumps.`;

function escapeQL(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function flattenDatetimes(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(flattenDatetimes);
  if (typeof obj === 'object') {
    if (obj.__type__ === 'datetime' && obj.value) return obj.value;
    const result = {};
    for (const [key, val] of Object.entries(obj)) {
      result[key] = flattenDatetimes(val);
    }
    return result;
  }
  return obj;
}

function sessionClient() {
  const s = getSession();
  return {
    query: (expression) => s.query(expression),
    create: (entityType, entityData) => s.create(entityType, entityData),
    update: (entityType, entityId, entityData) =>
      s.update(entityType, [entityId], entityData),
    delete: (entityType, entityId) => s.delete(entityType, [entityId]),
  };
}

async function executeTool(client, name, args = {}) {
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
      let expr = 'select id, name, type.name, status.name, status.id, parent.name from Task';
      const conds = [];
      if (args.project_id) conds.push(`project.id is "${escapeQL(args.project_id)}"`);
      if (args.parent_id) conds.push(`parent.id is "${escapeQL(args.parent_id)}"`);
      if (args.status) conds.push(`status.name is "${escapeQL(args.status)}"`);
      if (conds.length) expr += ` where ${conds.join(' and ')}`;
      expr += ` limit ${args.limit || 100}`;
      return client.query(expr);
    }
    case 'ftrack_list_review_sessions': {
      let expr = 'select id, name, description, created_at from ReviewSession';
      expr += ` order by created_at descending limit ${args.limit || 50}`;
      return client.query(expr);
    }
    case 'ftrack_list_statuses':
      return client.query('select id, name, color from Status');
    case 'ftrack_list_asset_versions': {
      let expr = 'select id, version, asset.name, task.name, task.id, date from AssetVersion';
      const conds = [];
      if (args.asset_id) conds.push(`asset.id is "${escapeQL(args.asset_id)}"`);
      if (args.task_id) conds.push(`task.id is "${escapeQL(args.task_id)}"`);
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
      let expr = 'select id, name, status.name, parent.name from Shot';
      const conds = [];
      if (args.project_id) conds.push(`project.id is "${escapeQL(args.project_id)}"`);
      if (args.parent_id) conds.push(`parent.id is "${escapeQL(args.parent_id)}"`);
      if (args.status) conds.push(`status.name is "${escapeQL(args.status)}"`);
      if (conds.length) expr += ` where ${conds.join(' and ')}`;
      expr += ` limit ${args.limit || 100}`;
      return client.query(expr);
    }
    case 'ftrack_list_users': {
      let expr = 'select id, username, first_name, last_name, is_active from User';
      if (!args.include_inactive) expr += ' where is_active is true';
      expr += ' limit 100';
      return client.query(expr);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-flash-latest',
  'gemini-1.5-flash',
];

async function geminiGenerate(apiKey, model, body) {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  const text = await resp.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  if (!resp.ok) {
    const errMsg = json?.error?.message || text || resp.statusText;
    const err = new Error(`Gemini (${resp.status}): ${errMsg}`);
    err.status = resp.status;
    throw err;
  }
  return json;
}

/**
 * @param {{
 *   messages: Array<{role:string, content:string}>,
 *   apiKey: string,
 *   projectId?: string,
 *   projectName?: string,
 *   customPrompt?: string,
 * }} opts
 */
export async function runClientGeminiChat({
  messages,
  apiKey,
  projectId,
  projectName,
  customPrompt,
} = {}) {
  if (!apiKey) throw new Error('Missing Gemini API key');
  getSession(); // throws if not logged in

  const client = sessionClient();
  let systemPrompt = SYSTEM_PROMPT;
  if (projectId && projectName) {
    systemPrompt += `\n\nThe user is working in project "${projectName}" (ID: "${projectId}"). Prefer this project unless they ask otherwise.`;
  }
  if (customPrompt) {
    systemPrompt += `\n\n--- User Custom Instructions ---\n${customPrompt}`;
  }

  const geminiTools = [{
    functionDeclarations: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    })),
  }];

  const geminiContents = [];
  for (const m of messages || []) {
    geminiContents.push({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    });
  }

  let model = GEMINI_MODELS[0];
  const maxIterations = 10;

  for (let i = 0; i < maxIterations; i++) {
    const body = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: geminiContents,
      tools: geminiTools,
    };

    let result;
    try {
      result = await geminiGenerate(apiKey, model, body);
    } catch (e) {
      // Model not found / deprecated → try next
      if (e.status === 404 || /not found|not supported/i.test(e.message)) {
        const idx = GEMINI_MODELS.indexOf(model);
        if (idx >= 0 && idx < GEMINI_MODELS.length - 1) {
          model = GEMINI_MODELS[idx + 1];
          i -= 1; // retry same iteration with new model
          continue;
        }
      }
      throw e;
    }

    const candidate = result.candidates?.[0];
    if (!candidate) {
      const block = result.promptFeedback?.blockReason;
      throw new Error(block ? `Gemini blocked: ${block}` : 'No response from Gemini');
    }

    const parts = candidate.content?.parts || [];
    const fnCalls = parts.filter((p) => p.functionCall);

    if (fnCalls.length === 0) {
      return parts.map((p) => p.text).filter(Boolean).join('') || '(empty response)';
    }

    geminiContents.push({ role: 'model', parts });

    const responseParts = [];
    for (const fc of fnCalls) {
      let toolResult;
      try {
        const raw = await executeTool(client, fc.functionCall.name, fc.functionCall.args || {});
        toolResult = flattenDatetimes(raw);
        const str = JSON.stringify(toolResult);
        if (str.length > 8000) {
          toolResult = { truncated: true, preview: str.slice(0, 8000) };
        }
      } catch (err) {
        toolResult = { error: err.message || String(err) };
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
