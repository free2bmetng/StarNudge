/**
 * A send failure, classified by what the provider might have done.
 * - transient: certainly not accepted. Safe to retry with backoff.
 * - ambiguous: a timeout or server error after the request left. The provider may have
 *   accepted it, so we never retry automatically (no duplicate texts).
 * - permanent: rejected outright (for example, an invalid number).
 */
export class SendError extends Error {
  constructor(
    message: string,
    public readonly kind: 'transient' | 'ambiguous' | 'permanent',
    public readonly code: string = kind,
    public readonly contactInvalid: boolean = false,
  ) {
    super(message);
    this.name = 'SendError';
  }
}

export interface SmsMessage {
  to: string;
  from: string;
  body: string;
  clientRef: string;
}

export interface SmsAdapter {
  name: string;
  send(message: SmsMessage): Promise<{ providerMessageId: string; segments: number }>;
}

export interface EmailMessage {
  to: string;
  from: string;
  subject: string;
  text: string;
  headers: Record<string, string>;
  clientRef: string;
}

export interface EmailAdapter {
  name: string;
  send(message: EmailMessage): Promise<{ providerMessageId: string }>;
}

export type CheckoutStart = { kind: 'activated' } | { kind: 'redirect'; url: string };

export interface BillingAdapter {
  name: string;
  startSubscription(input: { businessId: string; ownerEmail: string; stripeCustomerId: string | null }): Promise<CheckoutStart>;
  cancelAtPeriodEnd(stripeSubscriptionId: string | null): Promise<void>;
}
