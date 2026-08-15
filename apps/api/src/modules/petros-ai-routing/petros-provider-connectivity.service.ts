import { Injectable } from '@nestjs/common';
import type { PetrosAiProvider } from '@edrion/database';
import { PetrosAiCredentialsService } from './petros-ai-credentials.service';

@Injectable()
export class PetrosProviderConnectivityService {
  constructor(private readonly credentials: PetrosAiCredentialsService) {}

  async test(provider: PetrosAiProvider): Promise<{ ok: boolean; latencyMs: number; models: string[]; error?: string }> {
    if (!provider.credentialEnvelope) return { ok: false, latencyMs: 0, models: [], error: 'No API credential configured.' };
    const apiKey = this.credentials.decrypt(provider.credentialEnvelope);
    const started = Date.now();
    try {
      const { url, headers } = this.request(provider, apiKey);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const response = await fetch(url, { headers, signal: controller.signal });
      clearTimeout(timer);
      const body = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok) throw new Error(this.errorMessage(body) ?? `HTTP ${response.status}`);
      return { ok: true, latencyMs: Date.now() - started, models: this.models(provider.adapterType, body) };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        models: [],
        error: error instanceof Error ? error.message.slice(0, 500) : 'Connectivity test failed.',
      };
    }
  }

  private request(provider: PetrosAiProvider, apiKey: string): { url: string; headers: Record<string, string> } {
    if (provider.adapterType === 'gemini') {
      const base = provider.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
      return { url: `${base.replace(/\/$/, '')}/models?key=${encodeURIComponent(apiKey)}`, headers: {} };
    }
    if (provider.adapterType === 'anthropic') {
      const base = provider.baseUrl ?? 'https://api.anthropic.com/v1';
      return {
        url: `${base.replace(/\/$/, '')}/models`,
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      };
    }
    const base = provider.baseUrl ?? 'https://api.openai.com/v1';
    return { url: `${base.replace(/\/$/, '')}/models`, headers: { authorization: `Bearer ${apiKey}` } };
  }

  private models(adapter: string, body: Record<string, unknown>): string[] {
    const data = Array.isArray(body.data) ? body.data : Array.isArray(body.models) ? body.models : [];
    return data.map((entry) => {
      const row = entry as Record<string, unknown>;
      const value = adapter === 'gemini' ? row.name : row.id;
      return typeof value === 'string' ? value.replace(/^models\//, '') : '';
    }).filter(Boolean).slice(0, 500);
  }

  private errorMessage(body: Record<string, unknown>): string | undefined {
    const error = body.error;
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object' && typeof (error as Record<string, unknown>).message === 'string') {
      return String((error as Record<string, unknown>).message);
    }
    return undefined;
  }
}
