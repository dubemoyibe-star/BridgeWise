/**
 * Soroban integration sandbox environment (#392).
 *
 * Provides an isolated, in-memory mock of the parts of the Stellar/Soroban
 * stack that bridge integration tests typically touch: accounts with balances,
 * contract calls with scripted responses, transaction submission with
 * configurable outcomes (success/failure/timeout), and an event log so tests
 * can assert what was invoked.
 *
 * No network access. No real keypairs. No real ledger. Tests can spin up a
 * sandbox per case, mutate state freely, and discard it when done.
 *
 * Usage:
 *   import { SorobanSandbox, SandboxScenario } from "../../test/sandbox/stellar";
 *
 *   const sandbox = new SorobanSandbox();
 *   sandbox.createAccount("GABC...", { XLM: "1000.0000000" });
 *   sandbox.registerContract("CD...", { call_swap: () => ({ ok: true }) });
 *   sandbox.submitTransaction({ source: "GABC...", op: "call", ... });
 *   expect(sandbox.events()).toContainEqual({ kind: "tx", status: "success", ... });
 */

export type AssetCode = string;
export type AccountId = string;
export type ContractId = string;

export interface AccountState {
  accountId: AccountId;
  balances: Record<AssetCode, string>;
  sequence: bigint;
  flags: { authRequired: boolean; authRevocable: boolean };
}

export type ContractMethod = (args: unknown[]) => unknown;

export interface MockContract {
  contractId: ContractId;
  methods: Record<string, ContractMethod>;
}

export type SandboxScenario = "success" | "failure" | "timeout" | "random";

export interface SandboxTransaction {
  source: AccountId;
  op: "payment" | "call" | "create_account";
  /** For payment ops: { destination, asset, amount }. For calls: { contractId, method, args }. */
  payload: Record<string, unknown>;
}

export type SandboxEvent =
  | { kind: "tx"; status: "success" | "failure" | "timeout"; tx: SandboxTransaction; result?: unknown; error?: string; timestamp: number }
  | { kind: "balance_change"; account: AccountId; asset: AssetCode; before: string; after: string; timestamp: number }
  | { kind: "contract_call"; contractId: ContractId; method: string; args: unknown[]; result: unknown; timestamp: number };

export interface SorobanSandboxOptions {
  /** Default scenario applied when `submitTransaction` doesn't specify one. */
  defaultScenario?: SandboxScenario;
  /** When true, mutations to balances/state are echoed to the event log. Default: true. */
  emitBalanceEvents?: boolean;
  /** Seed for deterministic `random` scenarios. */
  seed?: number;
}

export class SorobanSandbox {
  private readonly accounts = new Map<AccountId, AccountState>();
  private readonly contracts = new Map<ContractId, MockContract>();
  private readonly eventLog: SandboxEvent[] = [];
  private readonly options: Required<SorobanSandboxOptions>;
  private rngState: number;

  constructor(options: SorobanSandboxOptions = {}) {
    this.options = {
      defaultScenario: options.defaultScenario ?? "success",
      emitBalanceEvents: options.emitBalanceEvents ?? true,
      seed: options.seed ?? 1,
    };
    this.rngState = this.options.seed;
  }

  // ── Account management ───────────────────────────────────────────────────

  createAccount(accountId: AccountId, balances: Record<AssetCode, string> = { XLM: "0" }): AccountState {
    if (this.accounts.has(accountId)) {
      throw new Error(`Account already exists: ${accountId}`);
    }
    const state: AccountState = {
      accountId,
      balances: { ...balances },
      sequence: 0n,
      flags: { authRequired: false, authRevocable: false },
    };
    this.accounts.set(accountId, state);
    return state;
  }

  getAccount(accountId: AccountId): AccountState | undefined {
    return this.accounts.get(accountId);
  }

  setBalance(accountId: AccountId, asset: AssetCode, amount: string): void {
    const account = this.accounts.get(accountId);
    if (!account) throw new Error(`Unknown account: ${accountId}`);
    const before = account.balances[asset] ?? "0";
    account.balances[asset] = amount;
    if (this.options.emitBalanceEvents) {
      this.eventLog.push({
        kind: "balance_change",
        account: accountId,
        asset,
        before,
        after: amount,
        timestamp: Date.now(),
      });
    }
  }

  // ── Contract management ──────────────────────────────────────────────────

  registerContract(contractId: ContractId, methods: Record<string, ContractMethod>): void {
    this.contracts.set(contractId, { contractId, methods });
  }

  invokeContract(contractId: ContractId, method: string, args: unknown[] = []): unknown {
    const contract = this.contracts.get(contractId);
    if (!contract) throw new Error(`Unknown contract: ${contractId}`);
    const fn = contract.methods[method];
    if (!fn) throw new Error(`Unknown method ${method} on contract ${contractId}`);
    const result = fn(args);
    this.eventLog.push({
      kind: "contract_call",
      contractId,
      method,
      args,
      result,
      timestamp: Date.now(),
    });
    return result;
  }

  // ── Transaction submission ───────────────────────────────────────────────

  /**
   * Submit a transaction. The `scenario` decides the outcome — overriding the
   * sandbox default — so individual tests can simulate success, failure, or
   * timeout without touching shared state.
   */
  submitTransaction(tx: SandboxTransaction, scenario?: SandboxScenario): SandboxEvent {
    const account = this.accounts.get(tx.source);
    if (!account) {
      const event: SandboxEvent = {
        kind: "tx",
        status: "failure",
        tx,
        error: `Source account not found: ${tx.source}`,
        timestamp: Date.now(),
      };
      this.eventLog.push(event);
      return event;
    }

    const resolved = this.resolveScenario(scenario ?? this.options.defaultScenario);

    if (resolved === "timeout") {
      const event: SandboxEvent = { kind: "tx", status: "timeout", tx, timestamp: Date.now() };
      this.eventLog.push(event);
      return event;
    }
    if (resolved === "failure") {
      const event: SandboxEvent = {
        kind: "tx",
        status: "failure",
        tx,
        error: "Simulated failure",
        timestamp: Date.now(),
      };
      this.eventLog.push(event);
      return event;
    }

    // Success: dispatch on op
    let result: unknown;
    try {
      if (tx.op === "call") {
        const { contractId, method, args } = tx.payload as { contractId: ContractId; method: string; args?: unknown[] };
        result = this.invokeContract(contractId, method, args ?? []);
      } else if (tx.op === "payment") {
        result = this.applyPayment(tx);
      } else if (tx.op === "create_account") {
        const { destination, starting_balance } = tx.payload as { destination: AccountId; starting_balance: string };
        this.createAccount(destination, { XLM: starting_balance });
        result = { destination };
      }
      account.sequence += 1n;
    } catch (err) {
      const event: SandboxEvent = {
        kind: "tx",
        status: "failure",
        tx,
        error: (err as Error).message,
        timestamp: Date.now(),
      };
      this.eventLog.push(event);
      return event;
    }

    const event: SandboxEvent = {
      kind: "tx",
      status: "success",
      tx,
      result,
      timestamp: Date.now(),
    };
    this.eventLog.push(event);
    return event;
  }

  private applyPayment(tx: SandboxTransaction): { source: AccountId; destination: AccountId; asset: AssetCode; amount: string } {
    const { destination, asset, amount } = tx.payload as { destination: AccountId; asset: AssetCode; amount: string };
    const src = this.accounts.get(tx.source);
    const dst = this.accounts.get(destination);
    if (!src) throw new Error(`Source account not found: ${tx.source}`);
    if (!dst) throw new Error(`Destination account not found: ${destination}`);

    const srcBalanceNum = Number(src.balances[asset] ?? "0");
    const amountNum = Number(amount);
    if (Number.isNaN(srcBalanceNum) || Number.isNaN(amountNum)) {
      throw new Error(`Invalid numeric balance/amount for asset ${asset}`);
    }
    if (srcBalanceNum < amountNum) {
      throw new Error(`Insufficient balance: ${src.balances[asset] ?? "0"} < ${amount}`);
    }
    const newSrc = (srcBalanceNum - amountNum).toString();
    const newDst = ((Number(dst.balances[asset] ?? "0")) + amountNum).toString();
    this.setBalance(tx.source, asset, newSrc);
    this.setBalance(destination, asset, newDst);
    return { source: tx.source, destination, asset, amount };
  }

  private resolveScenario(scenario: SandboxScenario): Exclude<SandboxScenario, "random"> {
    if (scenario !== "random") return scenario;
    // Deterministic LCG so tests stay reproducible across runs given the same seed
    this.rngState = (this.rngState * 1664525 + 1013904223) >>> 0;
    const r = this.rngState / 0xffffffff;
    if (r < 0.6) return "success";
    if (r < 0.85) return "failure";
    return "timeout";
  }

  // ── Introspection ────────────────────────────────────────────────────────

  events(): readonly SandboxEvent[] {
    return this.eventLog;
  }

  clearEvents(): void {
    this.eventLog.length = 0;
  }

  /** Reset balances, contracts, and event log. Useful between test cases. */
  reset(): void {
    this.accounts.clear();
    this.contracts.clear();
    this.eventLog.length = 0;
    this.rngState = this.options.seed;
  }
}

/** Convenience factory: build a sandbox pre-seeded with two funded accounts. */
export function createDefaultSandbox(): SorobanSandbox {
  const sandbox = new SorobanSandbox();
  sandbox.createAccount("GSANDBOX_ALICE", { XLM: "10000.0000000", USDC: "1000.0000000" });
  sandbox.createAccount("GSANDBOX_BOB", { XLM: "10000.0000000", USDC: "1000.0000000" });
  return sandbox;
}
