import { getPrisma } from "@tdc/db";
import { loadSettings } from "@tdc/core/settings";
import { Empty, PageHeader, Stat, usd } from "@/components/admin/ui";
import { Card, CardContent, CardHeader, CardTitle, Table, Td, Th } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";

export default async function UsagePage() {
  await requireUser("usage:view");
  const prisma = getPrisma();
  const settings = await loadSettings(prisma);
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const since30 = new Date(now.getTime() - 30 * 24 * 3_600_000);
  const [month, byPurpose, byModel, daily] = await Promise.all([
    prisma.apiUsage.aggregate({ where: { createdAt: { gte: monthStart } }, _sum: { costUsd: true, inputTokens: true, outputTokens: true, cacheReadTokens: true }, _count: true }),
    prisma.apiUsage.groupBy({ by: ["purpose"], where: { createdAt: { gte: since30 } }, _sum: { costUsd: true, inputTokens: true, outputTokens: true }, _count: true, orderBy: { _sum: { costUsd: "desc" } } }),
    prisma.apiUsage.groupBy({ by: ["model"], where: { createdAt: { gte: since30 } }, _sum: { costUsd: true }, _count: true, orderBy: { _sum: { costUsd: "desc" } } }),
    prisma.$queryRaw<Array<{ day: Date; calls: bigint; cost: number }>>`
      SELECT date_trunc('day', "createdAt" AT TIME ZONE 'Asia/Kolkata') AS day, count(*) AS calls, sum("costUsd")::float AS cost
        FROM "ApiUsage" WHERE "createdAt" >= ${since30}
       GROUP BY 1 ORDER BY 1 DESC`,
  ]);
  const spent = Number(month._sum.costUsd ?? 0);
  const dayOfMonth = now.getUTCDate();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const projected = dayOfMonth ? (spent / dayOfMonth) * daysInMonth : 0;
  const pct = settings.monthlyBudgetUsd ? Math.min(100, (spent / settings.monthlyBudgetUsd) * 100) : 0;
  return (
    <>
      <PageHeader title="AI model usage" description="Every model request (Claude or Gemini) is recorded with its token counts and estimated cost at list prices; Gemini free-tier calls cost $0. Generation stops for the month when the budget is reached." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Spent this month" value={usd(spent)} note={`${pct.toFixed(0)}% of $${settings.monthlyBudgetUsd}`} />
        <Stat label="Projected month" value={usd(projected)} note="At the current daily rate" />
        <Stat label="Requests this month" value={month._count.toLocaleString("en-IN")} />
        <Stat label="Tokens this month" value={`${(((month._sum.inputTokens ?? 0) + (month._sum.outputTokens ?? 0)) / 1000).toFixed(0)}k`} note={`${((month._sum.cacheReadTokens ?? 0) / 1000).toFixed(0)}k read from cache`} />
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Budget used">
        <div className={`h-full ${pct > 90 ? "bg-down" : pct > 70 ? "bg-marigold" : "bg-neel"}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>By purpose (30 days)</CardTitle>
          </CardHeader>
          <CardContent>
            {byPurpose.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>Purpose</Th>
                    <Th>Calls</Th>
                    <Th>Cost</Th>
                  </tr>
                </thead>
                <tbody>
                  {byPurpose.map((p) => (
                    <tr key={p.purpose}>
                      <Td>{p.purpose}</Td>
                      <Td className="tabular">{p._count}</Td>
                      <Td className="tabular">{usd(Number(p._sum.costUsd ?? 0))}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <Empty>No API calls yet.</Empty>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By model (30 days)</CardTitle>
          </CardHeader>
          <CardContent>
            {byModel.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>Model</Th>
                    <Th>Calls</Th>
                    <Th>Cost</Th>
                  </tr>
                </thead>
                <tbody>
                  {byModel.map((m) => (
                    <tr key={m.model}>
                      <Td className="font-mono text-xs">{m.model}</Td>
                      <Td className="tabular">{m._count}</Td>
                      <Td className="tabular">{usd(Number(m._sum.costUsd ?? 0))}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <Empty>No API calls yet.</Empty>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By day (IST)</CardTitle>
          </CardHeader>
          <CardContent>
            {daily.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>Day</Th>
                    <Th>Calls</Th>
                    <Th>Cost</Th>
                  </tr>
                </thead>
                <tbody>
                  {daily.map((d) => (
                    <tr key={String(d.day)}>
                      <Td className="tabular">{new Date(d.day).toISOString().slice(0, 10)}</Td>
                      <Td className="tabular">{Number(d.calls)}</Td>
                      <Td className="tabular">{usd(Number(d.cost))}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <Empty>No API calls yet.</Empty>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
