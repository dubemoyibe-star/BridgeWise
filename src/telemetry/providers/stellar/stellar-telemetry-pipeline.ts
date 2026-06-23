import { SorobanBridgeAuditLogger } from '../../../logging/audit/stellar/soroban-bridge-audit-logger';
import { AuditEventType } from '../../../logging/audit/stellar/soroban-bridge-audit-logger.types';
import { stellarMetrics, StellarMetricsExporter } from '../../../exporters/metrics/stellar';
import { StellarTelemetryEvent, StellarTelemetryEventType } from './types';

export interface StellarTelemetryPipelineConfig {
  auditLogger?: SorobanBridgeAuditLogger;
  metricsExporter?: StellarMetricsExporter;
  providerId?: string;
  now?: () => number;
}

export class StellarTelemetryPipeline {
  private readonly auditLogger: SorobanBridgeAuditLogger;
  private readonly metricsExporter: StellarMetricsExporter;
  private readonly providerId: string;
  private readonly now: () => number;

  constructor(config: StellarTelemetryPipelineConfig = {}) {
    this.auditLogger = config.auditLogger ?? new SorobanBridgeAuditLogger();
    this.metricsExporter = config.metricsExporter ?? stellarMetrics;
    this.providerId = config.providerId ?? 'stellar';
    this.now = config.now ?? (() => Date.now());
  }

  /**
   * Helper to normalize raw event params into the standard telemetry event shape.
   */
  private normalizeEvent(
    eventName: StellarTelemetryEventType,
    status: 'success' | 'failed' | 'pending',
    params: {
      transferId?: string;
      amount?: string;
      latencyMs?: number;
      feeUsd?: number;
      slippage?: number;
      error?: string;
      metadata?: Record<string, unknown>;
    }
  ): StellarTelemetryEvent {
    return {
      eventName,
      timestamp: this.now(),
      providerId: this.providerId,
      status,
      transferId: params.transferId,
      amount: params.amount,
      latencyMs: params.latencyMs,
      feeUsd: params.feeUsd,
      slippage: params.slippage,
      error: params.error,
      metadata: params.metadata,
    };
  }

  /**
   * Persists the normalized event to the console, audit log, and metrics system.
   */
  private processEvent(event: StellarTelemetryEvent): void {
    // 1. Console logging (JSON format, system standard)
    console.log(JSON.stringify(event));

    // 2. Audit Logger insertion (mapped to closest AuditEventType)
    let auditType: AuditEventType;
    switch (event.eventName) {
      case 'quote.requested':
        auditType = 'transfer.initiated';
        break;
      case 'transfer.submitted':
        auditType = 'transfer.submitted';
        break;
      case 'transfer.confirmed':
        auditType = 'transfer.confirmed';
        break;
      case 'transfer.failed':
        auditType = 'transfer.failed';
        break;
      default:
        auditType = 'transfer.initiated';
    }

    this.auditLogger.log(auditType, {
      transferId: event.transferId,
      providerId: event.providerId,
      metadata: {
        eventName: event.eventName,
        status: event.status,
        latencyMs: event.latencyMs,
        amount: event.amount,
        feeUsd: event.feeUsd,
        slippage: event.slippage,
        error: event.error,
        ...event.metadata,
      },
    });

    // 3. Exporters / Metrics client recording
    const routeName = (event.metadata?.route as string) || 'stellar-bridge';
    const assetName = (event.metadata?.asset as string) || 'XLM';

    if (event.eventName === 'transfer.confirmed' || event.eventName === 'transfer.failed') {
      const metricStatus = event.eventName === 'transfer.confirmed' ? 'success' : 'failure';
      this.metricsExporter.recordTransaction({
        route: routeName,
        status: metricStatus,
      });

      if (event.latencyMs !== undefined) {
        this.metricsExporter.recordLatency({ route: routeName }, event.latencyMs);
      }
    }

    if (event.feeUsd !== undefined) {
      this.metricsExporter.recordFee({ route: routeName, asset: assetName }, event.feeUsd);
    }
  }

  // ─── High-Level Event Tracking Methods ────────────────────────────────────

  recordQuoteRequested(
    amount: string,
    metadata?: Record<string, unknown>
  ): StellarTelemetryEvent {
    const event = this.normalizeEvent('quote.requested', 'success', {
      amount,
      metadata,
    });
    this.processEvent(event);
    return event;
  }

  recordTransferSubmitted(
    transferId: string,
    amount: string,
    metadata?: Record<string, unknown>
  ): StellarTelemetryEvent {
    const event = this.normalizeEvent('transfer.submitted', 'pending', {
      transferId,
      amount,
      metadata,
    });
    this.processEvent(event);
    return event;
  }

  recordTransferConfirmed(
    transferId: string,
    latencyMs: number,
    amount: string,
    feeUsd?: number,
    metadata?: Record<string, unknown>
  ): StellarTelemetryEvent {
    const event = this.normalizeEvent('transfer.confirmed', 'success', {
      transferId,
      latencyMs,
      amount,
      feeUsd,
      metadata,
    });
    this.processEvent(event);
    return event;
  }

  recordTransferFailed(
    transferId: string,
    latencyMs: number,
    error: string,
    metadata?: Record<string, unknown>
  ): StellarTelemetryEvent {
    const event = this.normalizeEvent('transfer.failed', 'failed', {
      transferId,
      latencyMs,
      error,
      metadata,
    });
    this.processEvent(event);
    return event;
  }

  /** Get underlying audit logger instance (useful for retrieval/verification in tests). */
  getAuditLogger(): SorobanBridgeAuditLogger {
    return this.auditLogger;
  }

  /** Get underlying metrics exporter instance. */
  getMetricsExporter(): StellarMetricsExporter {
    return this.metricsExporter;
  }
}
