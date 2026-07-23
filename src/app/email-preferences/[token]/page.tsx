import { notFound } from "next/navigation";
import { findPreferencesByToken } from "@/lib/sync/committee-digest";
import { PreferencesForm } from "./preferences-form";

interface PageProps {
  params: Promise<{ token: string }>;
}

/**
 * Unsubscribe without signing in.
 *
 * The token is the whole authorization: it's random, single-purpose, and only
 * ever reaches the person whose inbox the email landed in. Requiring a sign-in
 * to stop email is the thing that makes people mark it as spam instead.
 */
export default async function EmailPreferencesPage({ params }: PageProps) {
  const { token } = await params;
  const prefs = await findPreferencesByToken(token);

  if (!prefs) notFound();

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted px-4 py-8">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-bold">Email preferences</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          You can change this any time, here or from your profile.
        </p>

        <div className="mt-6">
          <PreferencesForm
            token={token}
            committeeDigest={prefs.committeeDigest}
          />
        </div>
      </div>
    </div>
  );
}
