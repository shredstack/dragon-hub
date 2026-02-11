"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { assignSchoolAdmin } from "@/actions/super-admin";

interface AddAdminFormProps {
  schoolId: string;
}

export function AddAdminForm({ schoolId }: AddAdminFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    const form = e.currentTarget;
    const formData = new FormData(form);
    const email = formData.get("email") as string;

    try {
      await assignSchoolAdmin(schoolId, email);
      setSuccess(`Successfully assigned ${email} as school admin`);
      form.reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign admin");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Enter the email address of a user to make them a school admin. They must
        already have an account.
      </p>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-md bg-green-50 p-3 text-sm text-green-600">
          {success}
        </div>
      )}

      <div className="flex gap-3">
        <input
          type="email"
          name="email"
          required
          placeholder="user@example.com"
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
        />
        <button
          type="submit"
          disabled={isLoading}
          className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
        >
          {isLoading ? "Adding..." : "Add Admin"}
        </button>
      </div>
    </form>
  );
}
