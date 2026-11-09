import { randomBytes } from 'node:crypto';
import { SendError, type BillingAdapter, type EmailAdapter, type SmsAdapter } from './types';

/*
 * Sandbox adapters never reach a real person. They keep a ledger in memory and
 * honor scripted faults, so tests can exercise retries and ambiguous outcomes.
 */

type Fault = 'ok' | 'transient' | 'ambiguous' | 'permanent';
interface SandboxState {
  smsFaults: Fault[];
  emailFaults: Fault[];
}

const globalForSandbox = globalThis as unknown as { __starnudgeSandbox?: SandboxState };

function state(): SandboxState {
  if (!globalForSandbox.__starnudgeSandbox) {
    globalForSandbox.__starnudgeSandbox = { smsFaults: [], emailFaults: [] };
  }
  return globalForSandbox.__starnudgeSandbox;
}

/** Queue faults for the next sends. Used by tests to simulate provider trouble. */
export function queueSandboxFault(channel: 'sms' | 'email', fault: Fault): void {
  if (channel === 'sms') state().smsFaults.push(fault);
  else state().emailFaults.push(fault);
}

export function clearSandboxFaults(): void {
  state().smsFaults = [];
  state().emailFaults = [];
}

function nextFault(channel: 'sms' | 'email'): Fault {
  const queue = channel === 'sms' ? state().smsFaults : state().emailFaults;
  return queue.shift() ?? 'ok';
}

function fakeId(prefix: string): string {
  return `${prefix}${randomBytes(12).toString('hex')}`;
}

export const sandboxSms: SmsAdapter = {
  name: 'sandbox-sms',
  async send(message) {
    const fault = nextFault('sms');
    if (fault === 'transient') throw new SendError('Sandbox: provider busy', 'transient', 'sandbox_busy');
    if (fault === 'permanent') {
      throw new SendError('Sandbox: number is not reachable', 'permanent', 'sandbox_invalid_number', true);
    }
    if (fault === 'ambiguous') {
      throw new SendError('Sandbox: request timed out after it was sent', 'ambiguous', 'sandbox_timeout');
    }
    const segments = message.body.length > 160 ? Math.ceil(message.body.length / 153) : 1;
    return { providerMessageId: fakeId('SBX'), segments };
  },
};

export const sandboxEmail: EmailAdapter = {
  name: 'sandbox-email',
  async send() {
    const fault = nextFault('email');
    if (fault === 'transient') throw new SendError('Sandbox: provider busy', 'transient', 'sandbox_busy');
    if (fault === 'permanent') {
      throw new SendError('Sandbox: mailbox does not exist', 'permanent', 'sandbox_invalid_mailbox', true);
    }
    if (fault === 'ambiguous') {
      throw new SendError('Sandbox: request timed out after it was sent', 'ambiguous', 'sandbox_timeout');
    }
    return { providerMessageId: fakeId('SBE') };
  },
};

export const sandboxBilling: BillingAdapter = {
  name: 'sandbox-billing',
  async startSubscription() {
    return { kind: 'activated' };
  },
  async cancelAtPeriodEnd() {
    return undefined;
  },
};
