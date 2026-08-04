/**
 * A minimal shell for the signed-out deletion pages.
 *
 * Deliberately standalone rather than inside `(auth)` or `(app)`: this route
 * must render for someone with no session and, in the Play Console's case, no
 * app installed at all — so it inherits no layout that assumes either.
 */
export default function AccountDeleteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md">
        <h1 className="mb-6 text-center text-xl font-bold text-dragon-blue-500">
          DragonHub
        </h1>
        {children}
      </div>
    </div>
  );
}
