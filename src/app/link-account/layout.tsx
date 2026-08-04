/**
 * Standalone shell, like `/account/delete`.
 *
 * `/link-account` is reached by an account with no school membership, so it
 * cannot live under `(app)` — that layout redirects exactly this person to
 * `/join-school`, which is the wall this flow exists to route around.
 */
export default function LinkAccountLayout({
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
