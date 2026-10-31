"use client";

import { useActionState } from "react";
import { confirmNewsletter, submitContact, unsubscribeNewsletter, type FormState } from "@/lib/actions/public";
import { Button } from "./ui/button";
import { Input, Label, Select, Textarea } from "./ui/primitives";

function Result({ state }: { state: FormState | null }) {
  if (!state) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-base font-medium text-up" : "text-sm text-down"}>
      {state.message}
    </p>
  );
}

export function ContactForm() {
  const [state, action, pending] = useActionState(submitContact, null);
  if (state?.ok) return <Result state={state} />;
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="c-name">Name</Label>
          <Input id="c-name" name="name" required maxLength={120} autoComplete="name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-email">Email</Label>
          <Input id="c-email" name="email" type="email" required autoComplete="email" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="c-topic">Topic</Label>
        <Select id="c-topic" name="topic" defaultValue="general" className="w-full">
          <option value="general">General</option>
          <option value="correction">Correction</option>
          <option value="grievance">Grievance</option>
          <option value="privacy">Privacy request</option>
          <option value="advertising">Advertising</option>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="c-message">Message</Label>
        <Textarea id="c-message" name="message" required minLength={10} maxLength={5000} rows={6} />
      </div>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <Result state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}

/** Confirmation is a button press, so link-scanning email filters cannot subscribe someone. */
export function TokenActionForm({ kind, token }: { kind: "confirm" | "unsubscribe"; token: string }) {
  const [state, action, pending] = useActionState(kind === "confirm" ? confirmNewsletter : unsubscribeNewsletter, null);
  if (state) return <Result state={state} />;
  return (
    <form action={action}>
      <input type="hidden" name="token" value={token} />
      <Button type="submit" size="lg" disabled={pending || !token}>
        {kind === "confirm" ? (pending ? "Confirming…" : "Confirm subscription") : pending ? "Unsubscribing…" : "Unsubscribe"}
      </Button>
    </form>
  );
}
