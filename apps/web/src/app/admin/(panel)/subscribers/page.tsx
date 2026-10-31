import { getPrisma } from "@tdc/db";
import { formatIstDateTime } from "@tdc/core/time/ist";
import { Empty, PageHeader, Stat } from "@/components/admin/ui";
import { Table, Td, Th } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";

export default async function SubscribersPage() {
  await requireUser("subscribers:view");
  const prisma = getPrisma();
  const [counts, recent] = await Promise.all([
    prisma.newsletterSubscriber.groupBy({ by: ["status"], _count: true }),
    prisma.newsletterSubscriber.findMany({ where: { status: { not: "UNSUBSCRIBED" } }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, email: true, status: true, createdAt: true, confirmedAt: true, lastSentAt: true } }),
  ]);
  const c = (s: string) => counts.find((x) => x.status === s)?._count ?? 0;
  return (
    <>
      <PageHeader title="Newsletter subscribers" description="Double opt-in: only confirmed subscribers receive email. Unsubscribed addresses are anonymised after 30 days." />
      <div className="mb-6 grid grid-cols-3 gap-3">
        <Stat label="Confirmed" value={c("CONFIRMED")} />
        <Stat label="Awaiting confirmation" value={c("PENDING")} />
        <Stat label="Unsubscribed" value={c("UNSUBSCRIBED")} />
      </div>
      {recent.length ? (
        <Table>
          <thead>
            <tr>
              <Th>Email</Th>
              <Th>Status</Th>
              <Th>Subscribed</Th>
              <Th>Confirmed</Th>
              <Th>Last email</Th>
            </tr>
          </thead>
          <tbody>
            {recent.map((s) => (
              <tr key={s.id}>
                <Td>{s.email}</Td>
                <Td>{s.status.toLowerCase()}</Td>
                <Td className="tabular text-xs text-ink-3">{formatIstDateTime(s.createdAt)}</Td>
                <Td className="tabular text-xs text-ink-3">{s.confirmedAt ? formatIstDateTime(s.confirmedAt) : "—"}</Td>
                <Td className="tabular text-xs text-ink-3">{s.lastSentAt ? formatIstDateTime(s.lastSentAt) : "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <Empty>No subscribers yet.</Empty>
      )}
    </>
  );
}
