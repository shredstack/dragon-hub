import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { bindNativeAuthTicket } from "@/lib/native-auth-tickets";

/**
 * The turn-around point, still in the system browser.
 *
 * OAuth has just completed, so the browser now holds a valid session cookie —
 * in the *browser's* jar, which the app's WebView cannot read. This reads that
 * session, binds the user to the pending ticket, and bounces to
 * `dragonhub://auth?ticket=…`, which is the only thing that reliably breaks
 * out of SFSafariViewController / a Custom Tab and back into the app.
 *
 * A page rather than a route handler because the custom-scheme redirect has to
 * come from a document: iOS will not follow a 302 to a non-http scheme from
 * inside SFSafariViewController, but it will follow a `location.replace` (and
 * a user-visible link, which is the fallback below for when it doesn't).
 */
export default async function NativeAuthReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ nonce?: string }>;
}) {
  const { nonce } = await searchParams;
  if (!nonce) redirect("/sign-in?error=native");

  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in?error=native");

  // Null when the nonce was never issued by this server, is expired, or has
  // already been used — all of which mean this is not the flow it claims to be.
  const ticket = await bindNativeAuthTicket({
    nonce,
    userId: session.user.id,
  });
  if (!ticket) redirect("/sign-in?error=native");

  const appUrl = `dragonhub://auth?ticket=${encodeURIComponent(ticket)}`;

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100dvh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <script
          dangerouslySetInnerHTML={{
            __html: `window.location.replace(${JSON.stringify(appUrl)});`,
          }}
        />
        <p style={{ margin: 0 }}>Signing you in…</p>
        {/* The manual escape hatch. If the automatic hop is blocked — some
            Android browsers refuse a scripted navigation to a custom scheme —
            a tap on a real link always works. Without this the user is left
            staring at a blank browser sheet with no way forward. */}
        <a href={appUrl} style={{ color: "#2563eb" }}>
          Tap here if DragonHub doesn&apos;t open automatically
        </a>
      </body>
    </html>
  );
}
