import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy - DragonHub",
  description: "How DragonHub collects, uses, and protects your information.",
};

const EFFECTIVE_DATE = "August 12, 2026";

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

      {/* A parent standing at a sign-up table has about twenty seconds and a
          phone. The promises that decide whether they sign up go here, in
          plain English, above the policy that spells each of them out. */}
      <div className="mt-8 rounded-lg border border-border bg-muted/50 p-4 text-sm">
        <p className="font-semibold">The short version</p>
        <ul className="mt-2 space-y-1.5 text-muted-foreground">
          <li>
            • <strong className="text-foreground">We never sell your information</strong>{" "}
            — not to advertisers, not to data brokers, not to anyone.
          </li>
          <li>
            • <strong className="text-foreground">No ads and no tracking.</strong> There
            is no advertising in DragonHub and no third-party analytics or
            advertising trackers.
          </li>
          <li>
            • <strong className="text-foreground">No student data.</strong> We do not
            collect children&rsquo;s names. Classroom selection identifies the{" "}
            <em>room</em>, not the child in it.
          </li>
          <li>
            • <strong className="text-foreground">Your data stays inside your
            school&rsquo;s space.</strong> Nobody at another school can see it,
            and your phone number is optional.
          </li>
          <li>
            • <strong className="text-foreground">You can delete it yourself,</strong>{" "}
            any time, from your profile — no email to anyone required.
          </li>
          <li>
            • <strong className="text-foreground">It&rsquo;s built by someone on your
            PTA board</strong> — a parent volunteer, not an outside company. No
            one outside your school&rsquo;s PTA has access.
          </li>
          <li>
            • <strong className="text-foreground">We are not the school district.</strong>{" "}
            DragonHub is an independent app used by your PTA — see below.
          </li>
        </ul>
      </div>

      <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        <p>
          <strong>
            DragonHub is an independent app, not a school or district app.
          </strong>{" "}
          It is run for your PTA — a separate volunteer organization — by a
          volunteer on that board, under the name Shredstack. It is not
          provided, reviewed, endorsed, or approved by your school or school
          district, and the information you enter here does not go into any
          school or district record system. Privacy questions come to us at{" "}
          <a
            href="mailto:privacy@shredstack.net"
            className="font-medium underline underline-offset-2"
          >
            privacy@shredstack.net
          </a>
          , not to the school office.
        </p>
      </div>

      <div className="legal-prose mt-8 max-w-none">
        <p>
          DragonHub (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is a Parent Teacher
          Association (PTA) coordination tool, operated under the name
          Shredstack by a volunteer on your PTA board. This policy explains what
          information we collect from PTA members and school community users
          (&ldquo;you&rdquo;) when you use the DragonHub website or mobile app,
          how we use it, and the choices you have.
        </p>

        <h2>1. Information we collect</h2>
        <h3>Information you provide directly</h3>
        <ul>
          <li>
            <strong>Account information:</strong> your name, email address, and
            optionally a phone number, when you sign up — including when you
            sign up on a public form or by scanning a QR code at a school event
            — or when a PTA board member adds you.
          </li>
          <li>
            <strong>Profile and role information:</strong> your school
            affiliation, classroom and committee assignments, PTA role (e.g.
            room parent, board member), and which sign-up door you came through.
          </li>
          <li>
            <strong>Activity data:</strong> volunteer hours you log, messages,
            comments and tasks you post in classrooms and committees, event
            plans, meeting minutes, knowledge base articles, and other content
            you create.
          </li>
          <li>
            <strong>Uploads:</strong> photos and files you attach to messages,
            volunteer-hour receipts, event plans, or knowledge base entries.
          </li>
          <li>
            <strong>Feedback:</strong> if you use the in-app feedback button,
            your message plus the page you were on, your browser or device type,
            and your name and email so we can reply.
          </li>
        </ul>

        <h3>Information collected automatically</h3>
        <ul>
          <li>
            <strong>Authentication:</strong> you can sign in with an emailed
            magic link, or with Google or Apple if your PTA has enabled them. We
            store session cookies (or tokens, in the mobile app) to keep you
            signed in. If you use Google or Apple, we receive your name and
            email address from them so we can match you to your account — we
            never receive your password, and we do not read your Google or Apple
            account beyond that.
          </li>
          <li>
            <strong>Device push tokens (mobile app only):</strong> when you
            grant push notification permission, we store the device token issued
            by Apple Push Notification service (APNs) or Firebase Cloud
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
            for display inside the app. This access is read-only.
          </li>
        </ul>

        <h2>2. How we use information</h2>
        <ul>
          <li>
            To operate the app: authenticate you, save your activity, and show
            you the right content for your school and role.
          </li>
          <li>
            To send transactional email (sign-in links, sign-up confirmations,
            notification digests, PTA announcements).
          </li>
          <li>
            To deliver mobile push notifications you have opted into (e.g. new
            classroom message, volunteer-hour approval).
          </li>
          <li>
            To synchronize approved Google Workspace content (calendar, budget,
            drive) into the app for your school community.
          </li>
          <li>
            To provide AI-assisted features over your PTA&rsquo;s own content —
            onboarding guides, summaries, and question answering.
          </li>
          <li>
            To respond to your feedback and support requests, and to fix bugs.
          </li>
          <li>To detect abuse, prevent fraud, and meet legal obligations.</li>
        </ul>

        <p>
          We do <strong>not</strong> sell your personal information, we do not
          share it for targeted advertising, we do not show advertising in
          DragonHub, and we do not use your content to train AI models.
        </p>

        <h2>3. How information is shared</h2>
        <p>
          DragonHub is a private tool for PTA members at your school. Within the
          app:
        </p>
        <ul>
          <li>
            <strong>Your name and role</strong> are visible to other members of
            your school community.
          </li>
          <li>
            <strong>Your email address and phone number</strong> are visible to
            the PTA board, and to the other volunteers and the teacher in any
            classroom or committee you join. This is how volunteer coordination
            works — a room parent needs to be able to reach the people who
            signed up to help at the party. They are not visible to the school
            community at large, and never to anyone outside your school.
          </li>
          <li>
            Posts you make in a classroom or committee are visible to that
            group&rsquo;s members and the teacher or chair.
          </li>
          <li>
            Volunteer hours you log are visible to PTA board members for
            approval.
          </li>
          <li>
            If you would rather your phone number not be shared with other
            volunteers, leave it blank when you sign up — it is optional — or
            remove it from your profile at any time.
          </li>
        </ul>
        <p>
          <strong>School staff.</strong> If your PTA has invited school staff or
          administrators into its space, they can see and take part in the same
          way members can. They cannot approve, publish, or configure things —
          that stays with the PTA board — and their access ends where the
          PTA&rsquo;s own sharing choices end.
        </p>
        {/* Accurate as of August 2026: DragonHub is built and run by one
            person, who sits on this school's own PTA board, and this school is
            the only one on the platform. When a second school onboards, this
            paragraph stops being true and has to say "the person who maintains
            DragonHub", without the board membership — that person will be an
            outside vendor to every school but the first. Same for "your PTA
            board" in the summary box above and the intro to section 1. */}
        <p>
          <strong>Who maintains the app.</strong> DragonHub is built and
          maintained by a volunteer who serves on your own PTA board. That
          person has technical access to your school&rsquo;s data — it is the
          same access anyone running a database has — and uses it to keep the
          app working, to help when you report a problem, and for nothing else.
          There is no outside company, no staff, and no one at another school
          who can see any of it.
        </p>
        <p>We share data with service providers solely to operate DragonHub:</p>
        <ul>
          <li>
            <strong>Neon</strong> — hosted PostgreSQL database.
          </li>
          <li>
            <strong>Vercel</strong> — application hosting and serverless
            compute.
          </li>
          <li>
            <strong>Resend</strong> — transactional email delivery (magic links,
            notifications).
          </li>
          <li>
            <strong>Vercel Blob</strong> — file and image attachment storage.
          </li>
          <li>
            <strong>Apple Push Notification service</strong> and{" "}
            <strong>Firebase Cloud Messaging</strong> — mobile push delivery.
          </li>
          <li>
            <strong>Google APIs</strong> — read-only access to PTA-approved
            Google Calendar, Sheets, and Drive content.
          </li>
          <li>
            <strong>OpenAI</strong> and <strong>Anthropic</strong> —
            AI-generated content (e.g. board onboarding guides). Generated
            content is associated with your school, and inputs are not used to
            train third-party models when invoked through their commercial APIs.
          </li>
        </ul>
        <p>
          These providers process data on our instructions only. Data is stored
          in the United States.
        </p>
        <p>
          We may disclose information when required by law, to enforce our
          terms, or to protect the safety of users. We do not otherwise give
          your information to your school, your school district, or anyone else.
        </p>

        <h2>4. Children&rsquo;s privacy</h2>
        <p>
          DragonHub is designed for adult PTA members and school staff and is
          not directed at children under 13. Do not create an account for, or
          submit information about, a child under 13.
        </p>
        <p>
          <strong>We do not collect student names.</strong> Volunteer sign-up
          forms ask for the parent or guardian&rsquo;s own name, and classroom
          selection identifies the <em>room</em>, not the child in it.
        </p>
        <p>
          Where children take part in an activity directly — such as a scavenger
          hunt at a school event — DragonHub assigns an anonymous handle (for
          example &ldquo;Turbo Narwhal&rdquo;) rather than accepting a typed
          name, so no child&rsquo;s name appears on a leaderboard or in our
          records. A hunt stores only that handle, which items were completed
          and when, and any yes/no answers to questions the PTA asked. The
          finish screen may optionally ask for a <em>grown-up&rsquo;s</em> name
          and email so a prize can be handed off; it is optional, it is never
          asked of a child, and it is deleted with the hunt.
        </p>
        <p>
          If you believe a student&rsquo;s name has been entered anywhere in
          DragonHub, email{" "}
          <a href="mailto:privacy@shredstack.net">privacy@shredstack.net</a> and
          we will remove it.
        </p>

        <h2>5. Data retention</h2>
        <p>
          We retain your account and activity records for as long as your PTA
          uses DragonHub, unless you delete your account sooner. If your PTA
          stops using DragonHub, its data is deleted or archived at the
          board&rsquo;s direction. Some records (e.g. approved financial
          transactions and volunteer-hour totals) may be retained for school
          recordkeeping purposes.
        </p>

        <h2>6. Security</h2>
        <p>
          We use industry-standard encryption in transit (HTTPS) and at rest.
          Access to school data is scoped: users can only view information
          belonging to their own school, and within it only what their role and
          memberships allow. Sign-in uses one-time links or Google/Apple rather
          than passwords we store. No system is perfectly secure, however, and
          we cannot guarantee absolute security. If a breach affects your
          personal information, we will notify you and your PTA as required by
          law.
        </p>

        <h2>7. Your choices</h2>
        <ul>
          <li>
            <strong>Email:</strong> you can unsubscribe from non-essential email
            digests using the link in the email footer.
          </li>
          <li>
            <strong>Push notifications:</strong> choose exactly which
            notifications you get, and set quiet hours, under{" "}
            <strong>Profile → Notifications</strong>. You can also manage
            permission in your device settings, or sign out of the mobile app to
            stop receiving pushes on that device.
          </li>
          <li>
            <strong>Phone number:</strong> optional. Leave it blank, or remove
            it from your profile at any time.
          </li>
          {/* Both stores diff this section against the privacy questionnaire /
              Data Safety form. Naming the in-app path and the public URL is
              what those forms are asked for — "contact your PTA board admin"
              satisfies neither, and the mismatch is a rejection on its own. */}
          <li>
            <strong>Account deletion:</strong> you can delete your account and
            personal data yourself at any time from{" "}
            <strong>Profile → Delete account</strong> in the app, or without
            signing in at{" "}
            <a href="/account/delete">dragonhub.shredstack.net/account/delete</a>
            . You can also email{" "}
            <a href="mailto:privacy@shredstack.net">privacy@shredstack.net</a>{" "}
            if you would rather we did it for you. Deletion removes your
            profile, memberships, volunteer sign-ups and logged hours; posts you
            made on message boards remain so conversations still make sense to
            the people in them, but they are no longer attributed to you.
          </li>
          <li>
            <strong>Access and correction:</strong> you can update your name and
            contact info in your profile, or contact us to request a copy of
            your data.
          </li>
        </ul>

        <h2>8. State privacy rights</h2>
        <p>
          If you are a resident of California, Colorado, Connecticut, Utah,
          Virginia, or another state with a comprehensive privacy law, you may
          have additional rights including the right to know what personal
          information we hold, to access a copy of it, to correct it, to delete
          it, and to opt out of sale, targeted advertising, and profiling.{" "}
          <strong>
            We do not sell personal information, share it for targeted
            advertising, or use it for profiling
          </strong>
          , so there is nothing to opt out of. To exercise any other right,
          email{" "}
          <a href="mailto:privacy@shredstack.net">privacy@shredstack.net</a>. We
          will not discriminate against you for exercising these rights. If we
          decline a request, you may appeal by replying to our response; we will
          answer the appeal in writing.
        </p>

        <h2>9. Changes to this policy</h2>
        <p>
          We may update this policy from time to time. Material changes will be
          communicated by email or in-app notice, and the effective date at the
          top of this page will change.
        </p>

        <h2>10. Contact us</h2>
        <p>
          Questions about this policy or your data?{" "}
          <a href="mailto:privacy@shredstack.net">privacy@shredstack.net</a>
          <br />
          Questions about the app itself?{" "}
          <a href="mailto:support@shredstack.net">support@shredstack.net</a>
          <br />
          See also our <Link href="/terms">Terms of Service</Link>.
        </p>
      </div>
    </main>
  );
}
