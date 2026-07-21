"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { joinSchool } from "@/actions/school-membership";

interface RenewalFormProps {
  schoolName: string;
  /** The school year the user is renewing into. */
  currentSchoolYear: string;
  /** The year their last membership was for. */
  previousSchoolYear: string;
}

export function RenewalForm({
  schoolName,
  currentSchoolYear,
  previousSchoolYear,
}: RenewalFormProps) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await joinSchool(code);
      if (result.success) {
        router.push("/dashboard");
        router.refresh();
      } else {
        setError(result.error ?? "That code didn't work. Please try again.");
        setLoading(false);
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{previousSchoolYear}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">Ended</span>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="font-medium">{currentSchoolYear}</span>
          <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
            Code required
          </span>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div>
        <label
          htmlFor="renewCode"
          className="block text-sm font-medium text-foreground"
        >
          {currentSchoolYear} join code
        </label>
        <input
          type="text"
          id="renewCode"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          required
          autoComplete="off"
          placeholder="Enter code"
          className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-3 text-center font-mono text-lg uppercase tracking-wider placeholder:normal-case placeholder:text-muted-foreground focus:border-dragon-blue-500 focus:outline-none focus:ring-1 focus:ring-dragon-blue-500"
          maxLength={20}
        />
        <p className="mt-2 text-center text-xs text-muted-foreground">
          {schoolName}&apos;s PTA board shares a new code each school year.
        </p>
      </div>

      <button
        type="submit"
        disabled={loading || !code.trim()}
        className="w-full rounded-md bg-dragon-blue-500 px-4 py-3 text-sm font-medium text-white hover:bg-dragon-blue-600 disabled:opacity-50"
      >
        {loading ? "Rejoining..." : `Rejoin for ${currentSchoolYear}`}
      </button>
    </form>
  );
}
