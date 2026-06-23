export type StellarTelemetryEventType =
  | 'quote.requested'
  | 'transfer.submitted'
  | 'transfer.confirmed'
  | 'transfer.failed';

export interface StellarTelemetryEvent {
  eventName: StellarTelemetryEventType;
  timestamp: number;
  providerId: string;
  status: 'success' | 'failed' | 'pending';
  latencyMs?: number;
  amount?: string;
  feeUsd?: number;
  slippage?: number;
  transferId?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}
