"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { joinSchool } from "@/actions/school-membership";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2 } from "lucide-react";

export default function JoinSchoolPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const result = await joinSchool(joinCode);

      if (result.success) {
        // Redirect to dashboard
        router.push("/dashboard");
        router.refresh();
      } else {
        setError(result.error || "Failed to join school");
        setIsLoading(false);
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-dragon-blue-100">
            <Building2 className="h-6 w-6 text-dragon-blue-600" />
          </div>
          <CardTitle className="text-2xl">Join Your School</CardTitle>
          <p className="text-sm text-muted-foreground">
            Enter the school code provided by your PTA to access Dragon Hub
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="joinCode"
                className="block text-sm font-medium text-foreground"
              >
                School Code
              </label>
              <input
                type="text"
                id="joinCode"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                required
                placeholder="e.g., DRAPER2026"
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-3 text-center text-lg font-mono tracking-wider uppercase placeholder:text-muted-foreground placeholder:normal-case focus:border-dragon-blue-500 focus:outline-none focus:ring-1 focus:ring-dragon-blue-500"
                maxLength={20}
              />
              <p className="mt-2 text-xs text-muted-foreground text-center">
                Get this code from your school&apos;s PTA board or administration
              </p>
            </div>

            <button
              type="submit"
              disabled={isLoading || !joinCode.trim()}
              className="w-full rounded-md bg-dragon-blue-500 px-4 py-3 text-sm font-medium text-white hover:bg-dragon-blue-600 disabled:opacity-50"
            >
              {isLoading ? "Joining..." : "Join School"}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
