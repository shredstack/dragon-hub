import { Mail } from "lucide-react";

export default function VerifyRequestPage() {
  return (
    <div className="rounded-lg border border-border bg-card p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-dragon-blue-100">
        <Mail className="h-6 w-6 text-dragon-blue-500" />
      </div>
      <h2 className="mb-2 text-xl font-semibold">Check your email</h2>
      <p className="text-sm text-muted-foreground">
        A sign-in link has been sent to your email address. Click the link to sign in to Dragon Hub.
      </p>
    </div>
  );
}
