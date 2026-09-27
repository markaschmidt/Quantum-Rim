const DEFAULT_BASE_URL = 'http://localhost:8000';

export class QuantumRimApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'QuantumRimApiError';
    this.status = status;
    this.details = details;
  }
}

export class QuantumRimApi {
  constructor(baseUrl = import.meta.env.VITE_QUANTUM_SERVICE_URL || DEFAULT_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.cache = new Map();
  }

  async request(path, options = {}) {
    const { timeoutMs = 15000, signal: externalSignal, ...fetchOptions } = options;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), timeoutMs);
    const abortFromExternal = () => controller.abort(externalSignal.reason);
    externalSignal?.addEventListener('abort', abortFromExternal, { once: true });
    let response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...fetchOptions,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...fetchOptions.headers,
        },
      });
    } finally {
      window.clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', abortFromExternal);
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new QuantumRimApiError(
        payload?.detail || `Quantum Rim Services returned ${response.status}`,
        response.status,
        payload,
      );
    }
    return payload;
  }

  health() {
    return this.request('/health');
  }

  listEngines() {
    return this.request('/api/v1/engines');
  }

  listEvents() {
    return this.request('/api/v1/events');
  }

  listActivities() {
    return this.request('/api/v1/game/activities');
  }

  listCharacters() {
    return this.request('/api/v1/ai/characters');
  }

  chat(request, options = {}) {
    return this.request('/api/v1/ai/chat', {
      timeoutMs: 45000,
      ...options,
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  generateSystem(request) {
    return this.request('/api/v1/game/systems/generate', {
      timeoutMs: 25000,
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  generateBody(request) {
    return this.request('/api/v1/game/bodies/generate', {
      timeoutMs: 25000,
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  forgeTexture(request) {
    return this.request('/api/v1/game/textures/forge', {
      timeoutMs: 20000,
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  planPlanetQuantumActions(profile) {
    const key = `planet-plan:${JSON.stringify(profile)}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const request = this.request('/api/v1/game/planets/quantum-plan', {
      method: 'POST',
      body: JSON.stringify(profile),
    });
    this.cache.set(key, request);
    request.catch(() => this.cache.delete(key));
    return request;
  }

  generateCrisis(request) {
    return this.request('/api/v1/game/crises/generate', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  planExpedition(request, options = {}) {
    const key = `expedition-plan:${JSON.stringify(request)}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const pending = this.request('/api/v1/game/expeditions/plan', {
      ...options,
      method: 'POST',
      body: JSON.stringify(request),
    });
    this.cache.set(key, pending);
    pending.catch(() => this.cache.delete(key));
    return pending;
  }

  planEvent(event) {
    return this.request('/api/v1/events/plan', {
      method: 'POST',
      body: JSON.stringify(event),
    });
  }

  executeEvent(event, options = {}) {
    return this.request('/api/v1/events/execute', {
      timeoutMs: 330000,
      ...options,
      method: 'POST',
      body: JSON.stringify(event),
    });
  }

  runEngine(engine, request) {
    return this.request(`/api/v1/engines/${encodeURIComponent(engine)}/run`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }
}

export const quantumRimApi = new QuantumRimApi();
