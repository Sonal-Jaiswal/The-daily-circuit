import type { Logger } from "../logger";
import { HttpError, isTransientError, withRetry } from "../util/retry";

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

export interface Mailer {
  readonly transport: string;
  send(message: EmailMessage): Promise<{ id: string | null }>;
}

/** Resend HTTP API (https://resend.com/docs/api-reference/emails/send-email). */
export class ResendMailer implements Mailer {
  readonly transport = "resend";
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: EmailMessage): Promise<{ id: string | null }> {
    return withRetry(
      async () => {
        const res = await this.fetchImpl("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: this.from, to: message.to, subject: message.subject, html: message.html, text: message.text, headers: message.headers }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) throw new HttpError(`Resend returned ${res.status}: ${(await res.text()).slice(0, 200)}`, res.status, "https://api.resend.com/emails");
        const body = (await res.json()) as { id?: string };
        return { id: body.id ?? null };
      },
      { retries: 2, shouldRetry: isTransientError },
    );
  }
}

/** Development transport: writes the email to the log instead of sending it. */
export class LogMailer implements Mailer {
  readonly transport = "log";
  readonly sent: EmailMessage[] = [];
  constructor(private readonly log?: Logger) {}
  async send(message: EmailMessage): Promise<{ id: string | null }> {
    this.sent.push(message);
    this.log?.info("Email (log transport)", { to: message.to, subject: message.subject, text: message.text.slice(0, 2000) });
    return { id: null };
  }
}

export function createMailer(env: { EMAIL_TRANSPORT: string; RESEND_API_KEY?: string; EMAIL_FROM: string }, log?: Logger): Mailer {
  if (env.EMAIL_TRANSPORT === "resend") {
    if (!env.RESEND_API_KEY) throw new Error("EMAIL_TRANSPORT=resend requires RESEND_API_KEY");
    return new ResendMailer(env.RESEND_API_KEY, env.EMAIL_FROM);
  }
  return new LogMailer(log);
}
