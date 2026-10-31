import { getPrisma } from "@tdc/db";
import { can } from "@tdc/core/auth/rbac";
import { formatIstDateTime } from "@tdc/core/time/ist";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { PageHeader } from "@/components/admin/ui";
import { Badge, Card, CardContent, CardHeader, CardTitle, Input, Label, Select, Table, Td, Textarea, Th } from "@/components/ui/primitives";
import { addSource, updateSource } from "@/lib/actions/admin";
import { requireUser } from "@/lib/auth";

export default async function SourcesPage() {
  const user = await requireUser("dashboard:view");
  const manage = can(user.role, "sources:manage");
  const sources = await getPrisma().newsSource.findMany({ orderBy: [{ desk: "asc" }, { name: "asc" }], include: { _count: { select: { candidates: true } } } });
  return (
    <>
      <PageHeader title="News sources" description="RSS and Atom feeds the collector reads. Publisher feeds stay disabled until you confirm their terms permit this use." />
      <div className="grid gap-6 2xl:grid-cols-[1fr_380px]">
        <Table>
          <thead>
            <tr>
              <Th>Source</Th>
              <Th>Desk</Th>
              <Th>Reliability</Th>
              <Th>Last fetch</Th>
              <Th>Items</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id} className={s.isEnabled ? "" : "opacity-70"}>
                <Td className="max-w-sm">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold">{s.name}</span>
                    <Badge tone={s.isEnabled ? "good" : "neutral"}>{s.isEnabled ? "enabled" : "disabled"}</Badge>
                    <Badge>{s.kind.toLowerCase()}</Badge>
                    {s.requiresLicenseReview && <Badge tone="warn">terms to confirm</Badge>}
                  </div>
                  <a href={s.feedUrl} target="_blank" rel="noopener noreferrer" className="mt-0.5 block text-xs text-neel [overflow-wrap:anywhere]">
                    {s.feedUrl}
                  </a>
                  {s.termsNote && <p className="mt-1 text-xs text-ink-3">{s.termsNote}</p>}
                </Td>
                <Td>{s.desk === "AI" ? "AI" : "Markets"}</Td>
                <Td>
                  {manage ? (
                    <ActionForm action={updateSource} className="flex items-center gap-1">
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="intent" value="reliability" />
                      <Input name="reliability" type="number" step="0.05" min="0.1" max="1" defaultValue={s.reliability} className="h-8 w-20" aria-label={`Reliability of ${s.name}`} />
                      <SubmitButton size="sm" variant="ghost">
                        Set
                      </SubmitButton>
                    </ActionForm>
                  ) : (
                    s.reliability
                  )}
                </Td>
                <Td className="text-xs">
                  {s.lastFetchedAt ? formatIstDateTime(s.lastFetchedAt) : "never"}
                  <div className={s.lastStatus === "error" ? "text-down" : "text-ink-3"}>{s.lastStatus === "error" ? s.lastError : s.lastStatus}</div>
                  {s.consecutiveFailures > 0 && <div className="text-down">{s.consecutiveFailures} consecutive failures</div>}
                </Td>
                <Td className="tabular">{s._count.candidates}</Td>
                <Td>
                  {manage && (
                    <div className="flex flex-col gap-1">
                      {s.requiresLicenseReview && (
                        <ActionForm action={updateSource} confirm={`Confirm that ${s.name}'s terms permit using its feed for discovery and linking?`}>
                          <input type="hidden" name="id" value={s.id} />
                          <input type="hidden" name="intent" value="license-confirmed" />
                          <SubmitButton size="sm" variant="outline">
                            Mark terms confirmed
                          </SubmitButton>
                        </ActionForm>
                      )}
                      <ActionForm action={updateSource}>
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="intent" value={s.isEnabled ? "disable" : "enable"} />
                        <SubmitButton size="sm" variant="outline">
                          {s.isEnabled ? "Disable" : "Enable"}
                        </SubmitButton>
                      </ActionForm>
                      <ActionForm action={updateSource} confirm={`Remove ${s.name}?`}>
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="intent" value="delete" />
                        <SubmitButton size="sm" variant="ghost">
                          Remove
                        </SubmitButton>
                      </ActionForm>
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {manage && (
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Add a source</CardTitle>
              <p className="text-xs text-ink-3">We check robots.txt and parse the feed before saving.</p>
            </CardHeader>
            <CardContent>
              <ActionForm action={addSource} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="s-name">Name</Label>
                  <Input id="s-name" name="name" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="s-feed">Feed URL</Label>
                  <Input id="s-feed" name="feedUrl" type="url" required placeholder="https://…/feed.xml" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="s-home">Homepage URL</Label>
                  <Input id="s-home" name="homepageUrl" type="url" required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="s-desk">Desk</Label>
                    <Select id="s-desk" name="desk" className="w-full">
                      <option value="AI">AI</option>
                      <option value="MARKETS">Markets</option>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="s-kind">Kind</Label>
                    <Select id="s-kind" name="kind" className="w-full">
                      <option value="COMPANY">Company</option>
                      <option value="REGULATOR">Regulator</option>
                      <option value="EXCHANGE">Exchange</option>
                      <option value="OFFICIAL">Other official</option>
                      <option value="PUBLISHER">Publisher</option>
                      <option value="WIRE">Wire service</option>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="s-rel">Reliability (0.1–1)</Label>
                  <Input id="s-rel" name="reliability" type="number" step="0.05" min="0.1" max="1" defaultValue="0.75" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="s-terms">Terms / licence note</Label>
                  <Textarea id="s-terms" name="termsNote" rows={3} />
                </div>
                <SubmitButton pendingLabel="Checking feed…">Add source</SubmitButton>
              </ActionForm>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
