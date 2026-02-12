import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted px-4">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold text-dragon-blue-500">Dragon Hub</h1>
        <div className="rounded-lg border border-border bg-card p-8 shadow-sm">
          <h2 className="mb-2 text-xl font-semibold">Invalid Sign-up Link</h2>
          <p className="mb-6 text-muted-foreground">
            This volunteer sign-up link isn&apos;t valid or has expired.
            <br />
            Please check with your school&apos;s PTA for the correct link.
          </p>
          <Link href="/">
            <Button variant="outline">Go to Homepage</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
