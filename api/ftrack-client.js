/**
 * ftrack API Client for serverless functions
 * Adapted from https://github.com/VFX-Tools-LLC/ftrack-mcp
 */

export class FtrackClient {
  constructor(serverUrl, apiUser, apiKey) {
    this.serverUrl = serverUrl?.replace(/\/$/, '');
    this.apiUser = apiUser;
    this.apiKey = apiKey;
    if (!this.serverUrl || !this.apiUser || !this.apiKey) {
      throw new Error('ftrack credentials required: serverUrl, apiUser, apiKey');
    }
    this.apiEndpoint = `${this.serverUrl}/api`;
  }

  async call(operations) {
    if (!Array.isArray(operations)) operations = [operations];
    const response = await fetch(this.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'ftrack-user': this.apiUser,
        'ftrack-api-key': this.apiKey,
      },
      body: JSON.stringify(operations),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ftrack API error (${response.status}): ${errorText}`);
    }
    const results = await response.json();
    for (let i = 0; i < results.length; i++) {
      if (results[i]?.exception) throw new Error(`Operation ${i} failed: ${results[i].content}`);
    }
    return results;
  }

  async callOne(operation) {
    const results = await this.call([operation]);
    return results?.[0] ?? null;
  }

  async query(expression) {
    return this.callOne({ action: 'query', expression });
  }

  async create(entityType, data) {
    return this.callOne({ action: 'create', entity_type: entityType, entity_data: data });
  }

  async update(entityType, entityId, data) {
    return this.callOne({ action: 'update', entity_type: entityType, entity_key: [entityId], entity_data: data });
  }

  async delete(entityType, entityId) {
    return this.callOne({ action: 'delete', entity_type: entityType, entity_key: [entityId] });
  }
}

export function escapeQL(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Flatten ftrack datetime objects into ISO strings */
export function flattenDatetimes(obj) {
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
