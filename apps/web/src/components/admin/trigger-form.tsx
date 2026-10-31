import { JOB_LABELS } from "@tdc/core/pipeline/run";
import { triggerJob } from "@/lib/actions/admin";
import { Input, Label, Select } from "@/components/ui/primitives";
import { ActionForm, SubmitButton } from "./action-form";

const ORDER = ["COLLECT", "PROCESS", "RANK", "GENERATE", "VALIDATE", "PREPARE_EDITION", "PUBLISH", "POST_PUBLISH", "MARKET_SNAPSHOT"] as const;

export function TriggerJobForm({ defaultDate, defaultType = "COLLECT" }: { defaultDate: string; defaultType?: (typeof ORDER)[number] }) {
  return (
    <ActionForm action={triggerJob} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
            <div className="space-y-1.5">
              <Label htmlFor="job-type">Stage</Label>
              <Select id="job-type" name="type" defaultValue={defaultType} className="w-full">
                {ORDER.map((t) => (
                  <option key={t} value={t}>
                    {JOB_LABELS[t]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="job-date">Edition date</Label>
              <Input id="job-date" name="editionDate" type="date" defaultValue={defaultDate} required />
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm text-ink-2">
            <input type="checkbox" name="force" className="mt-0.5 size-4" />
            <span>Publish approved articles now, before their scheduled time (publish stage only)</span>
          </label>
          <SubmitButton pendingLabel="Queuing…">Run stage</SubmitButton>
          <p className="text-xs text-ink-3">Every stage can be rerun safely. Collection skips stories already stored, generation skips stories that already have an article, and publishing never republishes an article.</p>
    </ActionForm>
  );
}
