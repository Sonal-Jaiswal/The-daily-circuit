"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/actions/admin";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Action = (prev: ActionState | null, formData: FormData) => Promise<ActionState>;

/** Server-action form with inline result message. Next.js verifies the Origin header for CSRF. */
export function ActionForm({ action, children, className, confirm }: { action: Action; children: ReactNode; className?: string; confirm?: string }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      {state && (
        <p role={state.ok ? "status" : "alert"} className={cn("mt-2 text-sm", state.ok ? "text-up" : "text-down")}>
          {state.message}
        </p>
      )}
    </form>
  );
}

/** Submit button that disables itself and shows `pendingLabel` while its form is submitting. */
export function SubmitButton({ children, pendingLabel, disabled, ...props }: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled} {...props}>
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
