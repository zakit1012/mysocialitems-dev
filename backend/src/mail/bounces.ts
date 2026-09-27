/**
 * Reading delivery-failure reports ("bounces"). Our mail server accepts an
 * email; the receiving server (Gmail, Outlook, ...) can still refuse it a
 * moment later, and that refusal only comes back as an email to the sender's
 * mailbox. These helpers read such a report: which of our emails it is about
 * and what the receiving server said.
 */

export type Bounce = {
  /** Our Message-ID tokens (wpop-<uuid>) quoted in the report. */
  ids: string[];
  /** Final-Recipient: who it was for. */
  recipient: string | null;
  /** 5.x.x = refused for good; 4.x.x = delayed, the mail server keeps trying. */
  status: string | null;
  permanent: boolean;
  /** The receiving server's own words. */
  reason: string;
};

type Envelope = {
  subject?: string;
  from?: { address?: string; name?: string }[];
};

/** Whether a message in the inbox looks like a delivery report. */
export function looksLikeBounce(envelope: Envelope | undefined): boolean {
  if (!envelope) return false;
  const from = (envelope.from ?? [])
    .map((a) => `${a.address ?? ''} ${a.name ?? ''}`)
    .join(' ');
  if (/mailer-daemon|postmaster|mail delivery (sub)?system/i.test(from)) {
    return true;
  }
  return /undeliver|delivery status notification|returned mail|failure notice|delivery (has )?failed|mail delivery failed|could not be delivered|delivery incomplete/i.test(
    envelope.subject ?? '',
  );
}

/** One line from a header that may be folded over several. */
function field(source: string, name: string): string | null {
  const match = new RegExp(
    `^${name}:[ \\t]*([^\\r\\n]*(?:\\r?\\n[ \\t]+[^\\r\\n]*)*)`,
    'im',
  ).exec(source);
  return match ? match[1].replace(/\s+/g, ' ').trim() : null;
}

/** The report's meaning, or null when it is not one we can read. */
export function readBounce(source: string): Bounce | null {
  const ids = [...new Set(source.match(/wpop-[0-9a-f-]{36}/gi) ?? [])].map(
    (id) => id.toLowerCase(),
  );
  const recipient =
    field(source, 'Final-Recipient')
      ?.replace(/^rfc822;\s*/i, '')
      .replace(/[<>]/g, '')
      .toLowerCase() ?? null;
  const status =
    /^Status:[ \t]*([245]\.\d{1,3}\.\d{1,3})/im.exec(source)?.[1] ?? null;
  let reason =
    field(source, 'Diagnostic-Code')?.replace(/^smtp;\s*/i, '') ?? '';
  if (!reason) {
    // No machine-readable part: the first line that quotes an SMTP code.
    reason =
      /^.*\b[45]\d\d[ -][45]\.\d{1,3}\.\d{1,3}\b.*$/m
        .exec(source)?.[0]
        ?.trim() ??
      /^.*\b(55\d|45\d)\b.*$/m.exec(source)?.[0]?.trim() ??
      '';
  }
  if (!ids.length && !recipient) return null;
  const permanent = status ? status.startsWith('5') : !/\b4\d\d\b/.test(reason);
  return {
    ids,
    recipient,
    status,
    permanent,
    reason: (reason || 'The receiving mail server refused this email.').slice(
      0,
      500,
    ),
  };
}

/** The usual fix for what a receiving server said, in plain words. */
export function bounceHint(reason: string | null | undefined): string | null {
  const text = (reason ?? '').toLowerCase();
  if (!text) return null;
  if (
    /rfc ?5321|rfc ?5322|not a valid.*address|malformed.*address|invalid.*sender|sender.*invalid/.test(
      text,
    )
  ) {
    return 'The sender address was broken. Check SMTP_FROM in backend/.env: the quotes must be closed, e.g. SMTP_FROM="WidgetPop <support@widgetpop.com>". Or leave SMTP_FROM out.';
  }
  if (
    /spf|dkim|dmarc|5\.7\.26|5\.7\.25|unauthenticated|not authenticated|authentication results/.test(
      text,
    )
  ) {
    return "The receiving server did not trust the sender. Add SPF, DKIM and DMARC records for widgetpop.com in DNS (your mail hosting shows the values), and set the server IP's reverse DNS.";
  }
  if (
    /5\.1\.1|user unknown|does not exist|no such user|recipient.*(rejected|unknown)|address.*not found|mailbox unavailable/.test(
      text,
    )
  ) {
    return 'That email address does not exist. The person probably typed it wrong.';
  }
  if (
    /5\.2\.2|mailbox full|quota|over.*storage|insufficient.*storage/.test(text)
  ) {
    return "The person's inbox is full. Nothing to fix on our side.";
  }
  if (
    /spam|blocked|block list|blacklist|blocklist|reputation|policy|5\.7\.1/.test(
      text,
    )
  ) {
    return 'The receiving server treated it as spam. Check SPF, DKIM, DMARC and the reverse DNS of the server IP, and that the IP is not on a block list.';
  }
  return null;
}
