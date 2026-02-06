"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  addCalendarIntegration,
  updateCalendarIntegration,
} from "@/actions/integrations";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

interface CalendarIntegrationFormProps {
  integration?: {
    id: string;
    calendarId: string;
    name: string | null;
  };
}

export function CalendarIntegrationForm({
  integration,
}: CalendarIntegrationFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const isEdit = !!integration;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const calendarId = formData.get("calendarId") as string;
    const name = formData.get("name") as string;

    try {
      if (isEdit) {
        await updateCalendarIntegration(integration.id, {
          name: name || undefined,
        });
      } else {
        await addCalendarIntegration({
          calendarId,
          name: name || undefined,
        });
      }
      setOpen(false);
      router.refresh();
    } catch (error) {
      console.error("Failed to save calendar integration:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={isEdit ? "sm" : "default"}>
          {isEdit ? "Edit" : "Add Calendar"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Calendar" : "Add Google Calendar"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="calendarId"
              className="mb-1 block text-sm font-medium"
            >
              Calendar ID
            </label>
            <input
              id="calendarId"
              name="calendarId"
              type="text"
              required
              disabled={isEdit}
              defaultValue={integration?.calendarId ?? ""}
              placeholder="example@group.calendar.google.com"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Find this in Google Calendar settings under &quot;Integrate
              calendar&quot;
            </p>
          </div>
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium">
              Display Name (optional)
            </label>
            <input
              id="name"
              name="name"
              type="text"
              defaultValue={integration?.name ?? ""}
              placeholder="PTA Events"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : isEdit ? "Save Changes" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
