import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <h1 className="mb-2 text-6xl font-bold text-dragon-blue-500">404</h1>
      <p className="mb-6 text-muted-foreground">Page not found</p>
      <Link
        href="/dashboard"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-dark"
      >
        Go to Dashboard
      </Link>
    </div>
  );
}
