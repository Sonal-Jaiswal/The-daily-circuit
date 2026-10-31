import { getPrisma } from "@tdc/db";
import { formatIstDateTime } from "@tdc/core/time/ist";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { Empty, PageHeader } from "@/components/admin/ui";
import { Badge, Card, CardContent } from "@/components/ui/primitives";
import { markMessageHandled } from "@/lib/actions/admin";
import { requireUser } from "@/lib/auth";

export default async function MessagesPage() {
  await requireUser("messages:view");
  const messages = await getPrisma().contactMessage.findMany({ orderBy: [{ handled: "asc" }, { createdAt: "desc" }], take: 100 });
  return (
    <>
      <PageHeader title="Messages" description="Contact-form submissions, including corrections and grievances. Grievances should be acknowledged and resolved within 15 days." />
      {messages.length ? (
        <div className="space-y-3">
          {messages.map((m) => (
            <Card key={m.id} className={m.handled ? "opacity-60" : ""}>
              <CardContent className="pt-5">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold">{m.name}</span>
                  <a href={`mailto:${m.email}`} className="text-neel underline">
                    {m.email}
                  </a>
                  <Badge tone={m.topic === "grievance" || m.topic === "correction" ? "warn" : "neutral"}>{m.topic}</Badge>
                  <span className="tabular text-xs text-ink-3">{formatIstDateTime(m.createdAt)}</span>
                  {m.handled && <Badge tone="good">handled</Badge>}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-ink-2">{m.message}</p>
                {!m.handled && (
                  <ActionForm action={markMessageHandled} className="mt-3">
                    <input type="hidden" name="id" value={m.id} />
                    <SubmitButton size="sm" variant="outline">
                      Mark handled
                    </SubmitButton>
                  </ActionForm>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Empty>No messages.</Empty>
      )}
    </>
  );
}
