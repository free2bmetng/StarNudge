/*
 * Static renders of an outgoing message. They show the text exactly as the
 * app will build it, with the sample data computed by the page.
 */

/** One outgoing text message in a thread, the way a phone shows it. */
export function SmsPreview({ recipient, text }: { recipient: string; text: string }) {
  return (
    <div
      role="group"
      aria-label={`Text message preview to ${recipient}`}
      className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-sunken p-4 sm:p-5"
    >
      <p className="text-meta font-semibold text-ink-soft">Text to {recipient}</p>
      <div className="ml-auto max-w-[min(100%,28rem)] whitespace-pre-wrap break-words rounded-[1.125rem] rounded-br-sm bg-accent-soft px-4 py-3 text-body text-ink shadow-rest">
        {text}
      </div>
    </div>
  );
}

/** A transactional email as a mail client shows it: sender, subject, then body. */
export function EmailPreview({ sender, subject, text }: { sender: string; subject: string; text: string }) {
  return (
    <article aria-label="Email preview" className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-raised">
      <header className="flex flex-col gap-1 border-b border-line px-4 py-3 sm:px-5">
        <p className="text-meta text-ink-soft">
          From <span className="font-semibold text-ink">{sender}</span>
        </p>
        <p className="text-body font-semibold text-ink">{subject || '(no subject)'}</p>
      </header>
      <div className="whitespace-pre-wrap break-words px-4 py-4 text-body text-ink sm:px-5">{text}</div>
    </article>
  );
}
