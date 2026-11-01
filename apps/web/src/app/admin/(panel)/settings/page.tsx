import { getPrisma } from "@tdc/db";
import { loadSettings } from "@tdc/core/settings";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { PageHeader } from "@/components/admin/ui";
import { Card, CardContent, CardHeader, CardTitle, Input, Label, Select, Textarea } from "@/components/ui/primitives";
import { saveSettings } from "@/lib/actions/admin";
import { requireUser } from "@/lib/auth";

function NumberField({ name, label, value, step = "1", min, max, hint }: { name: string; label: string; value: number; step?: string; min?: number; max?: number; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type="number" step={step} min={min} max={max} defaultValue={value} required />
      {hint && <p className="text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

function Toggle({ name, label, checked, hint }: { name: string; label: string; checked: boolean; hint?: string }) {
  return (
    <label className="flex items-start gap-2.5 text-sm">
      <input type="checkbox" name={name} defaultChecked={checked} className="mt-0.5 size-4" />
      <span>
        <span className="font-semibold">{label}</span>
        {hint && <span className="block text-xs text-ink-3">{hint}</span>}
      </span>
    </label>
  );
}

export default async function SettingsPage() {
  await requireUser("settings:manage");
  const s = await loadSettings(getPrisma());
  return (
    <>
      <PageHeader title="Settings" description="Publication schedule, selection thresholds, spending limits and monetisation. Changes are recorded in the audit log." />
      <ActionForm action={saveSettings} className="space-y-6">
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Schedule and quotas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="publishTimeIst">Publish time (IST, 24-hour)</Label>
                <Input id="publishTimeIst" name="publishTimeIst" defaultValue={s.publishTimeIst} pattern="^([01]\d|2[0-3]):[0-5]\d$" required />
                <p className="text-xs text-ink-3">The pipeline starts 60 minutes before this time.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <NumberField name="maxAiArticles" label="AI articles per day (max)" value={s.maxAiArticles} min={0} max={20} hint="Up to 20." />
                <NumberField name="maxMarketArticles" label="Market articles per day (max)" value={s.maxMarketArticles} min={0} max={20} hint="Up to 20." />
              </div>
              <NumberField name="latePublishGraceMin" label="Late-start grace (minutes)" value={s.latePublishGraceMin} min={0} max={720} hint="If the worker was down, the edition is skipped when it cannot start within this window after the publish time." />
              <Toggle name="autoPublish" label="Publish automatically when every check passes" checked={s.autoPublish} hint="When off, every article waits for an editor's approval." />
              <Toggle name="newsletterDigestEnabled" label="Email the edition to confirmed subscribers" checked={s.newsletterDigestEnabled} hint="Requires a configured email provider." />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Selection model</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                <NumberField name="wImportance" label="Importance" value={s.weights.importance} step="0.05" min={0} max={1} />
                <NumberField name="wCredibility" label="Credibility" value={s.weights.credibility} step="0.05" min={0} max={1} />
                <NumberField name="wFreshness" label="Freshness" value={s.weights.freshness} step="0.05" min={0} max={1} />
                <NumberField name="wImpact" label="Impact" value={s.weights.impact} step="0.05" min={0} max={1} />
                <NumberField name="wInterest" label="Interest" value={s.weights.interest} step="0.05" min={0} max={1} />
              </div>
              <p className="text-xs text-ink-3">Weights must add up to 1.</p>
              <NumberField name="minSelectionScore" label="Minimum score to publish" value={s.minSelectionScore} step="0.01" min={0} max={1} hint="Stories below this are not published, even if the quota is not filled." />
              <Toggle name="enableFactCheckPass" label="Run the second-model fact-check on every draft" checked={s.enableFactCheckPass} />
              <NumberField name="monthlyBudgetUsd" label="Monthly AI model budget (USD)" value={s.monthlyBudgetUsd} step="1" min={0} hint="Article generation pauses for the rest of the month once this is reached." />
            </CardContent>
          </Card>
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>AI instructions</CardTitle>
              <p className="text-xs text-ink-3">Steer what the AI covers and how it writes. These notes cannot override the accuracy rules (citations, no invented quotes or figures, no investment advice).</p>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="writerGuidance">Writing style and instructions</Label>
                <Textarea id="writerGuidance" name="writerGuidance" rows={5} maxLength={2000} defaultValue={s.writerGuidance} placeholder={"e.g. Explain technical terms in one plain sentence. Mention what each story means for Indian startups and developers. Keep headlines under 12 words."} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="aiCoverageFocus">AI and technology desk: topics to prioritise</Label>
                <Textarea id="aiCoverageFocus" name="aiCoverageFocus" rows={4} maxLength={1000} defaultValue={s.coverageFocus.AI} placeholder="e.g. Indian AI startups, open-source models, AI regulation in India, semiconductors" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="marketsCoverageFocus">Markets desk: topics to prioritise</Label>
                <Textarea id="marketsCoverageFocus" name="marketsCoverageFocus" rows={4} maxLength={1000} defaultValue={s.coverageFocus.MARKETS} placeholder="e.g. RBI policy, SEBI orders, IPOs, banking and fintech" />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="imageStyle">Article image style</Label>
                <Select id="imageStyle" name="imageStyle" defaultValue={s.imageStyle} className="w-full sm:w-80">
                  <option value="illustration">Illustration (flat editorial art)</option>
                  <option value="photo">Realistic (photo-style scenes)</option>
                </Select>
                <p className="text-xs text-ink-3">Realistic images show objects, places and technology only: never people, logos, readable text or real events. Every image is labelled as AI-generated. Applies to new articles; to redo recent ones, run the workflow in “reillustrate” mode.</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Market data</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <NumberField name="significantMovePct" label='"Why is this stock moving?" threshold (%)' value={s.significantMovePct} step="0.5" min={0.5} max={50} />
              <div className="space-y-1.5">
                <Label htmlFor="watchlist">Watchlist (JSON)</Label>
                <Textarea id="watchlist" name="watchlist" rows={10} defaultValue={JSON.stringify(s.watchlist, null, 2)} className="font-mono text-xs" />
                <p className="text-xs text-ink-3">Each entry: symbol, exchange (NSE/BSE), name, type (INDEX/EQUITY), optional sector, providerSymbol. Confirm provider codes with your data vendor.</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Advertising (Google AdSense)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-ink-2">Ads stay off until your AdSense account is approved. Enter the publisher ID and ad-unit IDs exactly as AdSense shows them. ads.txt is generated from the publisher ID.</p>
              <div className="space-y-1.5">
                <Label htmlFor="adsensePublisherId">Publisher ID</Label>
                <Input id="adsensePublisherId" name="adsensePublisherId" defaultValue={s.ads.publisherId ?? ""} placeholder="pub-0000000000000000" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                {(
                  [
                    ["slotHeader", "Header slot", s.ads.slots.header],
                    ["slotInArticle", "In-article slot", s.ads.slots.inArticle],
                    ["slotSidebar", "Sidebar slot", s.ads.slots.sidebar],
                    ["slotFooter", "Footer slot", s.ads.slots.footer],
                  ] as const
                ).map(([name, label, value]) => (
                  <div key={name} className="space-y-1.5">
                    <Label htmlFor={name}>{label}</Label>
                    <Input id={name} name={name} defaultValue={value ?? ""} inputMode="numeric" />
                  </div>
                ))}
              </div>
              <Toggle name="adsEnabled" label="Show ads" checked={s.raw.adsEnabled} hint="Ads load only for visitors who allow cookies." />
            </CardContent>
          </Card>
        </div>
        <SubmitButton size="lg" pendingLabel="Saving…">
          Save settings
        </SubmitButton>
      </ActionForm>
    </>
  );
}
