import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy - DragonHub",
  description: "How DragonHub collects, uses, and protects your information.",
};

const EFFECTIVE_DATE = "May 24, 2026";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 lg:py-16">
      <Link
        href="/"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Back to DragonHub
      </Link>
      <h1 className="mt-6 text-3xl font-bold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Effective {EFFECTIVE_DATE}
      </p>

      <div className="prose prose-slate mt-8 max-w-none">
        <p>
          DragonHub (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is a Parent Teacher
          Association (PTA) coordination tool operated by Shredstack for member
          schools. This policy explains what information we collect from PTA
          members and school community users (&ldquo;you&rdquo;) when you use
          the DragonHub website or mobile app, how we use it, and the choices
          you have.
        </p>

        <h2>1. Information we collect</h2>
        <h3>Information you provide directly</h3>
        <ul>
          <li>
            <strong>Account information:</strong> name, email address, and
            optionally a phone number when you sign up or are added by a PTA
            board member.
          </li>
          <li>
            <strong>Profile and role information:</strong> your school
            affiliation, classroom assignments, and PTA role (e.g. room parent,
            board member).
          </li>
          <li>
            <strong>Activity data:</strong> volunteer hours you log, messages
            and tasks you post in classrooms, event-planning notes, knowledge
            base articles, and other content you create in the app.
          </li>
          <li>
            <strong>Uploads:</strong> photos and files you attach to messages,
            volunteer-hour receipts, or knowledge base entries.
          </li>
        </ul>

        <h3>Information collected automatically</h3>
        <ul>
          <li>
            <strong>Authentication:</strong> we use email magic links for
            sign-in. We store session cookies (or tokens, in the mobile app) to
            keep you signed in.
          </li>
          <li>
            <strong>Device push tokens (mobile app only):</strong> when you
            grant push notification permission, we store the device token
            issued by Apple Push Notification service (APNs) or Firebase Cloud
            Messaging (FCM) so we can deliver notifications.
          </li>
          <li>
            <strong>Usage and diagnostics:</strong> minimal server logs (IP
            address, request paths, timestamps) for debugging and abuse
            prevention. We do not use third-party analytics or advertising
            trackers.
          </li>
        </ul>

        <h3>Information from third parties</h3>
        <ul>
          <li>
            School-managed Google Workspace data (calendar events, budget
            sheets, drive documents) that your PTA has connected to DragonHub
            for display inside the app.
          </li>
        </ul>

        <h2>2. How we use information</h2>
        <ul>
          <li>To operate the app: authenticate you, save your activity, and show you the right content for your school and role.</li>
          <li>To send transactional email (sign-in links, notification digests, important PTA announcements).</li>
          <li>To deliver mobile push notifications you have opted into (e.g. new classroom message, volunteer-hour approval).</li>
          <li>To synchronize approved Google Workspace content (calendar, budget, drive) into the app for your school community.</li>
          <li>To detect abuse, prevent fraud, and meet legal obligations.</li>
        </ul>

        <p>
          We do <strong>not</strong> sell your personal information, and we do
          not show advertising in DragonHub.
        </p>

        <h2>3. How information is shared</h2>
        <p>
          DragonHub is a private tool for PTA members at your school. Within the
          app:
        </p>
        <ul>
          <li>Your name and role are visible to other members of your school community.</li>
          <li>Posts you make in a classroom are visible to that classroom&rsquo;s parents and the teacher.</li>
          <li>Volunteer hours you log are visible to PTA board members for approval.</li>
        </ul>
        <p>We share data with service providers solely to operate DragonHub:</p>
        <ul>
          <li><strong>Neon</strong> — hosted PostgreSQL database.</li>
          <li><strong>Vercel</strong> — application hosting and serverless compute.</li>
          <li><strong>Resend</strong> — transactional email delivery (magic links, notifications).</li>
          <li><strong>Vercel Blob</strong> — file and image attachment storage.</li>
          <li><strong>Apple Push Notification service</strong> and <strong>Firebase Cloud Messaging</strong> — mobile push delivery.</li>
          <li><strong>Google APIs</strong> — read-only access to PTA-approved Google Calendar, Sheets, and Drive content.</li>
          <li><strong>OpenAI</strong> and <strong>Anthropic</strong> — AI-generated content (e.g. board onboarding guides). Generated content is associated with your school but inputs are not used to train third-party models when invoked through their commercial APIs.</li>
        </ul>
        <p>
          We may disclose information when required by law, to enforce our
          terms, or to protect the safety of users.
        </p>

        <h2>4. Children&rsquo;s privacy</h2>
        <p>
          DragonHub is designed for adult PTA members and school staff and is
          not directed at children under 13. Do not create an account for, or
          submit information about, a child under 13.
        </p>

        <h2>5. Data retention</h2>
        <p>
          We retain your account and activity records for as long as your PTA
          uses DragonHub. You may request deletion of your account at any time
          (see &ldquo;Your choices&rdquo; below). Some records (e.g. approved
          financial transactions) may be retained for school recordkeeping
          purposes.
        </p>

        <h2>6. Security</h2>
        <p>
          We use industry-standard encryption in transit (HTTPS) and at rest.
          Access to school data is scoped: users can only view information
          belonging to their own school. No system is perfectly secure, however,
          and we cannot guarantee absolute security.
        </p>

        <h2>7. Your choices</h2>
        <ul>
          <li><strong>Email:</strong> you can unsubscribe from non-essential email digests using the link in the email footer.</li>
          <li><strong>Push notifications:</strong> manage permission in your device settings, or sign out of the mobile app to stop receiving pushes on that device.</li>
          <li><strong>Account deletion:</strong> contact your PTA board admin, or email{" "}
            <a href="mailto:privacy@shredstack.net">privacy@shredstack.net</a>{" "}
            to request deletion of your account and personal data.</li>
          <li><strong>Access and correction:</strong> you can update your name and contact info in your profile, or contact us to request a copy of your data.</li>
        </ul>

        <h2>8. State privacy rights</h2>
        <p>
          If you are a resident of California, Colorado, Connecticut, Utah,
          Virginia, or another state with a comprehensive privacy law, you may
          have additional rights including the right to access, delete, or
          correct your personal information, and to opt out of certain
          processing. Contact us at the address above to exercise these rights.
        </p>

        <h2>9. Changes to this policy</h2>
        <p>
          We may update this policy from time to time. Material changes will be
          communicated by email or in-app notice.
        </p>

        <h2>10. Contact us</h2>
        <p>
          Questions about this policy?{" "}
          <a href="mailto:privacy@shredstack.net">privacy@shredstack.net</a>
        </p>
      </div>
    </main>
  );
}
