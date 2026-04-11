/**
 * API Client — communicates with the Oracle and Void Compressor services.
 *
 * OracleClient: pattern search, resolve, submit, stats
 * VoidClient:   cascade resonance, coherence scoring, status
 *
 * Uses the built-in fetch API available in VS Code's Node.js runtime.
 * URLs are configurable via VS Code settings.
 */

// ─── Types ───

export interface PatternResult {
  id: string;
  name: string;
  description: string;
  code: string;
  language: string;
  coherency: number;
  tags: string[];
  matchScore?: number;
}

export interface ResolveResult {
  decision: 'PULL' | 'EVOLVE' | 'GENERATE';
  confidence: number;
  pattern?: PatternResult;
  reason: string;
}

export interface SubmitResult {
  stored: boolean;
  id?: string;
  coherency?: { total: number };
  reason?: string;
}

export interface StatsResult {
  totalEntries: number;
  averageCoherency: number;
  byLanguage: Record<string, number>;
}

export interface CascadeResult {
  resonance: number;
  patterns: Array<{
    name: string;
    coherency: number;
    resonanceContribution: number;
  }>;
  suggestions: string[];
}

export interface CoherenceResult {
  total: number;
  dimensions: Record<string, number>;
  verdict: string;
}

export interface VoidStatus {
  status: 'online' | 'offline' | 'degraded';
  version: string;
  compressionRatio: number;
}

// ─── Oracle Client ───

export class OracleClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  /**
   * Search for patterns matching a query string.
   */
  async search(query: string, options?: { limit?: number; language?: string }): Promise<PatternResult[]> {
    const params = new URLSearchParams({ q: query });
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.language) params.set('language', options.language);

    const response = await this._fetch(`/api/search?${params}`);
    return response.results || [];
  }

  /**
   * Resolve — smart PULL/EVOLVE/GENERATE decision.
   */
  async resolve(description: string, language: string): Promise<ResolveResult> {
    const response = await this._fetch('/api/resolve', {
      method: 'POST',
      body: JSON.stringify({ description, language }),
    });
    return response;
  }

  /**
   * Submit code to the Oracle for validation and storage.
   */
  async submit(code: string, options: { language: string; name?: string; tags?: string[] }): Promise<SubmitResult> {
    const response = await this._fetch('/api/submit', {
      method: 'POST',
      body: JSON.stringify({ code, ...options }),
    });
    return response;
  }

  /**
   * Get Oracle store statistics.
   */
  async stats(): Promise<StatsResult> {
    const response = await this._fetch('/api/stats');
    return response;
  }

  private async _fetch(path: string, init?: RequestInit): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    try {
      const response = await fetch(url, {
        ...init,
        headers: { ...headers, ...(init?.headers as Record<string, string> || {}) },
      });

      if (!response.ok) {
        const text = await response.text().catch(() => 'Unknown error');
        throw new Error(`Oracle API error ${response.status}: ${text}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error(`Cannot connect to Oracle at ${this.baseUrl} — is the server running?`);
      }
      throw error;
    }
  }
}

// ─── Void Compressor Client ───

export class VoidClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  /**
   * Send code through cascade resonance analysis.
   * Identifies how well the code resonates with known patterns.
   */
  async cascade(code: string, language: string): Promise<CascadeResult> {
    const response = await this._fetch('/api/cascade', {
      method: 'POST',
      body: JSON.stringify({ code, language }),
    });
    return response;
  }

  /**
   * Get coherence scoring from the Void Compressor.
   */
  async coherence(code: string, language: string): Promise<CoherenceResult> {
    const response = await this._fetch('/api/coherence', {
      method: 'POST',
      body: JSON.stringify({ code, language }),
    });
    return response;
  }

  /**
   * Check the Void Compressor service status.
   */
  async status(): Promise<VoidStatus> {
    const response = await this._fetch('/api/status');
    return response;
  }

  private async _fetch(path: string, init?: RequestInit): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    try {
      const response = await fetch(url, {
        ...init,
        headers: { ...headers, ...(init?.headers as Record<string, string> || {}) },
      });

      if (!response.ok) {
        const text = await response.text().catch(() => 'Unknown error');
        throw new Error(`Void API error ${response.status}: ${text}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error(`Cannot connect to Void Compressor at ${this.baseUrl} — is the server running?`);
      }
      throw error;
    }
  }
}
