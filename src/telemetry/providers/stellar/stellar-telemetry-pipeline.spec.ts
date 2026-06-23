import { StellarTelemetryPipeline } from './stellar-telemetry-pipeline';
import { SorobanBridgeAuditLogger } from '../../../logging/audit/stellar/soroban-bridge-audit-logger';
import { StellarMetricsExporter } from '../../../exporters/metrics/stellar';

describe('StellarTelemetryPipeline', () => {
  let pipeline: StellarTelemetryPipeline;
  let auditLogger: SorobanBridgeAuditLogger;
  let metricsExporter: StellarMetricsExporter;
  let clockTime: number;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    clockTime = 1718500000000;
    auditLogger = new SorobanBridgeAuditLogger();
    metricsExporter = new StellarMetricsExporter('test_namespace');
    pipeline = new StellarTelemetryPipeline({
      auditLogger,
      metricsExporter,
      providerId: 'stellar-test',
      now: () => clockTime,
    });
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  // ─── Event: quote.requested ───────────────────────────────────────────────

  it('records and normalizes quote requested event', () => {
    const event = pipeline.recordQuoteRequested('100.5', { route: 'routeA' });

    // Verify normalized event returned
    expect(event).toEqual({
      eventName: 'quote.requested',
      timestamp: 1718500000000,
      providerId: 'stellar-test',
      status: 'success',
      amount: '100.5',
      metadata: { route: 'routeA' },
    });

    // Verify console output
    expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(event));

    // Verify Audit Logger entry
    const auditEvents = auditLogger.getAll();
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0].type).toBe('transfer.initiated');
    expect(auditEvents[0].providerId).toBe('stellar-test');
    expect(auditEvents[0].metadata).toMatchObject({
      eventName: 'quote.requested',
      status: 'success',
      amount: '100.5',
      route: 'routeA',
    });
  });

  // ─── Event: transfer.submitted ─────────────────────────────────────────────

  it('records and normalizes transfer submitted event', () => {
    const event = pipeline.recordTransferSubmitted('tx-123', '250.0', { route: 'routeB' });

    expect(event).toEqual({
      eventName: 'transfer.submitted',
      timestamp: 1718500000000,
      providerId: 'stellar-test',
      status: 'pending',
      transferId: 'tx-123',
      amount: '250.0',
      metadata: { route: 'routeB' },
    });

    expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(event));

    const auditEvents = auditLogger.getAll();
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0].type).toBe('transfer.submitted');
    expect(auditEvents[0].transferId).toBe('tx-123');
    expect(auditEvents[0].metadata).toMatchObject({
      eventName: 'transfer.submitted',
      status: 'pending',
      amount: '250.0',
      route: 'routeB',
    });
  });

  // ─── Event: transfer.confirmed ─────────────────────────────────────────────

  it('records and normalizes transfer confirmed event and records metrics', () => {
    jest.spyOn(metricsExporter, 'recordTransaction');
    jest.spyOn(metricsExporter, 'recordLatency');
    jest.spyOn(metricsExporter, 'recordFee');

    const event = pipeline.recordTransferConfirmed(
      'tx-123',
      4500,
      '250.0',
      1.25,
      { route: 'routeC', asset: 'USDC' }
    );

    expect(event).toEqual({
      eventName: 'transfer.confirmed',
      timestamp: 1718500000000,
      providerId: 'stellar-test',
      status: 'success',
      transferId: 'tx-123',
      amount: '250.0',
      latencyMs: 4500,
      feeUsd: 1.25,
      metadata: { route: 'routeC', asset: 'USDC' },
    });

    expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(event));

    const auditEvents = auditLogger.getAll();
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0].type).toBe('transfer.confirmed');
    expect(auditEvents[0].metadata).toMatchObject({
      eventName: 'transfer.confirmed',
      status: 'success',
      amount: '250.0',
      latencyMs: 4500,
      feeUsd: 1.25,
      route: 'routeC',
      asset: 'USDC',
    });

    // Verify metrics calls
    expect(metricsExporter.recordTransaction).toHaveBeenCalledWith({
      route: 'routeC',
      status: 'success',
    });
    expect(metricsExporter.recordLatency).toHaveBeenCalledWith(
      { route: 'routeC' },
      4500
    );
    expect(metricsExporter.recordFee).toHaveBeenCalledWith(
      { route: 'routeC', asset: 'USDC' },
      1.25
    );
  });

  // ─── Event: transfer.failed ────────────────────────────────────────────────

  it('records and normalizes transfer failed event and records metrics', () => {
    jest.spyOn(metricsExporter, 'recordTransaction');
    jest.spyOn(metricsExporter, 'recordLatency');

    const event = pipeline.recordTransferFailed(
      'tx-123',
      2500,
      'Timeout expired',
      { route: 'routeD' }
    );

    expect(event).toEqual({
      eventName: 'transfer.failed',
      timestamp: 1718500000000,
      providerId: 'stellar-test',
      status: 'failed',
      transferId: 'tx-123',
      latencyMs: 2500,
      error: 'Timeout expired',
      metadata: { route: 'routeD' },
    });

    expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(event));

    const auditEvents = auditLogger.getAll();
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0].type).toBe('transfer.failed');
    expect(auditEvents[0].metadata).toMatchObject({
      eventName: 'transfer.failed',
      status: 'failed',
      latencyMs: 2500,
      error: 'Timeout expired',
      route: 'routeD',
    });

    expect(metricsExporter.recordTransaction).toHaveBeenCalledWith({
      route: 'routeD',
      status: 'failure',
    });
    expect(metricsExporter.recordLatency).toHaveBeenCalledWith(
      { route: 'routeD' },
      2500
    );
  });
});
