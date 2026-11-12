/**
 * API keys and per-key credits, the same records verafy-apis uses:
 * ApiKey rows with provider "verafy-api", matched on the X-API-Key header, and one
 * ApiKeyCredit row per key (initialized to 500 on first use).
 */
export interface KeyRecord {
  id: string;
  credits: number;
}

export interface KeyStore {
  find(apiKey: string): Promise<KeyRecord | null>;
  /** Atomic debit. Returns ok false with the current balance when it is short. */
  debit(keyId: string, amount: number): Promise<{ ok: boolean; available: number }>;
  refund(keyId: string, amount: number): Promise<void>;
}

export const VERAFY_API_PROVIDER = "verafy-api";
export const DEFAULT_KEY_CREDITS = 500;

/**
 * Hosted runs are off on this deployment until the Verafy API key ledger is connected.
 * Every lookup fails closed, so POST /api/v1/runs answers 503 and spends nothing.
 */
export class DisabledKeyStore implements KeyStore {
  readonly disabled = true;
  async find(): Promise<KeyRecord | null> {
    return null;
  }
  async debit(): Promise<{ ok: boolean; available: number }> {
    return { ok: false, available: 0 };
  }
  async refund(): Promise<void> {}
}

export class MemoryKeyStore implements KeyStore {
  constructor(private keys: Map<string, KeyRecord> = new Map()) {}
  async find(apiKey: string) {
    const k = this.keys.get(apiKey);
    return k ? { ...k } : null;
  }
  private byId(id: string) {
    return [...this.keys.values()].find((k) => k.id === id);
  }
  async debit(keyId: string, amount: number) {
    const k = this.byId(keyId);
    if (!k || k.credits < amount) return { ok: false, available: k?.credits ?? 0 };
    k.credits -= amount;
    return { ok: true, available: k.credits };
  }
  async refund(keyId: string, amount: number) {
    const k = this.byId(keyId);
    if (k) k.credits += amount;
  }
}
