import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { PageHeader } from "@/components/admin/ui";
import { Card, CardContent, Input, Label, Select, Textarea } from "@/components/ui/primitives";
import { createManualArticle } from "@/lib/actions/admin";
import { requireUser } from "@/lib/auth";

export default async function NewArticlePage() {
  const user = await requireUser("articles:edit");
  return (
    <>
      <PageHeader
        title="Write an article"
        description={`For the occasional story you write yourself. It is published under your name (${user.name}) and marked as written by an editor, not by AI. Everyday coverage is still produced automatically.`}
        actions={
          <Link href="/admin/help#write" className="text-sm font-semibold text-neel hover:underline">
            How this works
          </Link>
        }
      />
      <Card className="max-w-4xl">
        <CardContent className="pt-5">
          <ActionForm action={createManualArticle} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
              <div className="space-y-1.5">
                <Label htmlFor="n-section">Section</Label>
                <Select id="n-section" name="section" defaultValue="AI" className="w-full">
                  <option value="AI">AI News</option>
                  <option value="TECHNOLOGY">Technology</option>
                  <option value="MARKETS">Indian Markets</option>
                  <option value="IPO">IPO</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="n-headline">Headline</Label>
                <Input id="n-headline" name="headline" required minLength={10} maxLength={160} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="n-excerpt">Summary</Label>
              <Textarea id="n-excerpt" name="excerpt" rows={2} required minLength={30} maxLength={400} placeholder="One or two sentences shown on the homepage and in search results." />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="n-body">Article</Label>
              <Textarea id="n-body" name="body" rows={16} required minLength={100} className="font-mono text-[13px]" placeholder={"Write in paragraphs separated by a blank line.\n\n### A subheading\n\n- A bullet point\n\nCite a source with [S1], [S2]… matching the order of the sources below."} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="n-why">Why it matters (optional)</Label>
              <Textarea id="n-why" name="whyItMatters" rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="n-sources">Sources (optional, one per line)</Label>
              <Textarea id="n-sources" name="sources" rows={4} className="font-mono text-[13px]" placeholder={"https://www.rbi.org.in/… | Reserve Bank of India | Monetary policy statement\nhttps://example.com/report | Publisher name | Article title"} />
              <p className="text-xs text-ink-3">Format: URL | publisher | title. The first line is S1, the second S2, and so on.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="n-tags">Tags (comma-separated)</Label>
                <Input id="n-tags" name="tags" placeholder="RBI, Banking" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="n-image">Image URL (optional, https, licensed)</Label>
                <Input id="n-image" name="imageUrl" type="url" placeholder="https://…" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="n-credit">Image credit (required with an image)</Label>
              <Input id="n-credit" name="imageCredit" placeholder="Photo: Name / Agency, licensed" />
            </div>
            <p className="text-sm text-ink-2">Market and IPO articles automatically show the investment disclaimer.</p>
            <div className="flex flex-wrap gap-3">
              <SubmitButton name="intent" value="draft" variant="outline" pendingLabel="Saving…">
                Save as draft
              </SubmitButton>
              <SubmitButton name="intent" value="publish" pendingLabel="Publishing…">
                Publish now
              </SubmitButton>
            </div>
          </ActionForm>
        </CardContent>
      </Card>
    </>
  );
}
