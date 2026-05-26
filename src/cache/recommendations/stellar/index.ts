/**
 * Soroban route recommendation cache (#390).
 *
 * Recommendations are expensive to compute: they involve fee estimation,
 * liquidity probing, and ranking across multiple providers. Re-running the
 * full pipeline for every UI render or API hit wastes compute. This module
 * exposes a small in-memory cache with TTL expiry and targeted invalidation.
 *
 * Cache keys are derived from the recommendation request shape so semantically
 * equivalent requests share a single cache slot.
 */

export interface SorobanRouteRecommendation {
  routeId: string;
  fromAsset: string;
  toAsset: string;
  estimatedFee: string;
  estimatedTime: number;
  provider: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface SorobanRecommendationRequest {
  fromAsset: string;
  toAsset: string;
  amount: string;
  /** Optional sender address — different addresses can have different liquidity/path preferences. */
  sender?: string;
}

interface CacheEntry {
  recommendations: SorobanRouteRecommendation[];
  expiresAt: number;
  storedAt: number;
}

export interface SorobanRecommendationCacheOptions {
  /** TTL in milliseconds. Default: 30 seconds. */
  ttlMs?: number;
  /** Maximum number of entries before LRU eviction. Default: 500. */
  maxEntries?: number;
}

const DEFAULT_TTL_MS = 30_000;
const DEFAULT_MAX_ENTRIES = 500;

export class SorobanRecommendationCache {
  private store = new Map<string, CacheEntry>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(options: SorobanRecommendationCacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  /**
   * Build a stable cache key for a recommendation request.
   * Keys are case-insensitive on asset codes and ignore amount casing whitespace.
   */
  static keyFor(req: SorobanRecommendationRequest): string {
    const sender = req.sender ?? "";
    return [
      req.fromAsset.trim().toUpperCase(),
      req.toAsset.trim().toUpperCase(),
      req.amount.trim(),
      sender.trim(),
    ].join("|");
  }

  get(req: SorobanRecommendationRequest): SorobanRouteRecommendation[] | null {
    const key = SorobanRecommendationCache.keyFor(req);
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    // LRU bump: re-set so the entry moves to the tail of insertion order.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.recommendations;
  }

  set(req: SorobanRecommendationRequest, recommendations: SorobanRouteRecommendation[]): void {
    const key = SorobanRecommendationCache.keyFor(req);
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) this.store.delete(oldestKey);
    }
    this.store.set(key, {
      recommendations,
      expiresAt: Date.now() + this.ttlMs,
      storedAt: Date.now(),
    });
  }

  /** Drop a single request's cached recommendations. */
  invalidate(req: SorobanRecommendationRequest): boolean {
    return this.store.delete(SorobanRecommendationCache.keyFor(req));
  }

  /** Drop every cached entry that includes the given asset on either side of the route. */
  invalidateByAsset(asset: string): number {
    const needle = asset.trim().toUpperCase();
    let removed = 0;
    for (const key of this.store.keys()) {
      const [from, to] = key.split("|");
      if (from === needle || to === needle) {
        this.store.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  /** Drop every cached entry. */
  clear(): void {
    this.store.clear();
  }

  /** Number of live (non-expired) entries. Expired entries are pruned in-place. */
  size(): number {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt <= now) this.store.delete(key);
    }
    return this.store.size;
  }
}
