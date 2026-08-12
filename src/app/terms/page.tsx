import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service - DragonHub",
  description: "Terms governing your use of DragonHub.",
};

const EFFECTIVE_DATE = "August 12, 2026";

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 lg:py-16">
      <Link
        href="/"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Back to DragonHub
      </Link>
      <h1 className="mt-6 text-3xl font-bold">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Effective {EFFECTIVE_DATE}
      </p>

      {/* This is the first thing on the page, ahead of the agreement itself,
          because it is the thing most likely to be misunderstood: a parent
          scanning a QR code at back-to-school night reasonably assumes anything
          handed to them in a school gym came from the school. */}
      <div className="mt-8 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-semibold">
          DragonHub is an independent app, not a school or district app.
        </p>
        <p className="mt-2">
          DragonHub is used by your Parent Teacher Association (PTA) — a
          separate volunteer organization — and is built and run by a volunteer
          on that board, under the name Shredstack. It is <strong>not</strong>{" "}
          provided, reviewed, endorsed, approved, or supported by your school,
          your school district, or any government body, and it is not an
          official school communication channel. Nothing you do here is required
          by your school, and choosing not to use DragonHub will never affect
          your child&rsquo;s education or your ability to volunteer.
        </p>
        <p className="mt-2">
          Questions, problems, or complaints about the app belong with us at{" "}
          <a
            href="mailto:support@shredstack.net"
            className="font-medium underline underline-offset-2"
          >
            support@shredstack.net
          </a>{" "}
          — not with your school office or district. Questions about a PTA
          event, a volunteer role, or anything the PTA posts here belong with
          your PTA board.
        </p>
      </div>

      <div className="legal-prose mt-8 max-w-none">
        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) govern your use of
          DragonHub, a Parent Teacher Association (PTA) coordination platform
          operated by Shredstack (&ldquo;we&rdquo;, &ldquo;us&rdquo;). By
          accessing or using DragonHub on the web or through the mobile app, you
          agree to be bound by these Terms.
        </p>

        <h2>1. Our relationship to your school and PTA</h2>
        <p>
          DragonHub is a tool your PTA chose to use. We provide the software;
          your PTA decides what goes in it, who may join, and how it is used.
          Your school and school district are not parties to these Terms and
          have no role in operating DragonHub unless your PTA has separately
          invited school staff to participate.
        </p>
        {/* These Terms say "we" for the operator and "your PTA" for the
            organization, and right now that is the same household. Saying so
            outright is better than leaving a parent to notice the overlap and
            wonder what else went unsaid. */}
        <p>
          The person who builds and runs DragonHub also serves on your PTA
          board. Where these Terms distinguish between &ldquo;we&rdquo; and
          &ldquo;your PTA,&rdquo; they are describing two roles held at the
          moment by the same volunteer: one operating the software, one running
          the PTA. Decisions about your PTA&rsquo;s space are made by the board
          as a whole.
        </p>
        <p>
          References to your school&rsquo;s name, mascot, or events inside
          DragonHub are entered by your PTA to identify its own community. They
          do not indicate any sponsorship, affiliation, or approval by the
          school or district.
        </p>
        <p>
          The PTA board at your school administers its own DragonHub space:
          approving members, setting roles, publishing content, and connecting
          any Google Calendar, Sheets, or Drive material it wishes to display.
          Content posted by your PTA and by other members is theirs, not ours,
          and we do not review it before it appears.
        </p>

        <h2>2. Who can use DragonHub</h2>
        <p>
          DragonHub accounts are for adults in participating PTA communities —
          parents, guardians, teachers, school staff, and PTA board members. You
          must be at least 18 years old to create an account, and you must give
          accurate information when you sign up.
        </p>
        <p>
          Some public activities do not require an account. A scavenger hunt run
          at a school event, for example, can be played from a phone with no
          sign-in at all, under an anonymous handle the app assigns (see
          section 8).
        </p>

        <h2>3. Your account</h2>
        <ul>
          <li>
            You can sign in with an emailed magic link, or with Google or Apple
            if your PTA has those options enabled. All of them reach the same
            account.
          </li>
          <li>
            Keep the email account you sign in with secure. Anyone with access
            to that inbox can request a sign-in link and reach your DragonHub
            account.
          </li>
          <li>
            Do not share account access with others or impersonate another
            person.
          </li>
          <li>
            Some sign-up doors — a join code or QR code your PTA shares — place
            you in a pending state until a PTA board member approves you. Access
            to a school&rsquo;s space is always the PTA&rsquo;s decision.
          </li>
          <li>
            Tell your PTA board or email us promptly if you believe your account
            has been compromised.
          </li>
        </ul>

        <h2>4. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>
            Post content that is unlawful, harassing, defamatory,
            discriminatory, or that violates the privacy of others, particularly
            students or minors.
          </li>
          <li>Upload malware or attempt to disrupt the service.</li>
          <li>
            Access or attempt to access data belonging to schools or users other
            than your own.
          </li>
          <li>
            Use DragonHub for commercial solicitation, political campaigning, or
            mass messaging outside of PTA-sanctioned activity.
          </li>
          <li>
            Use contact details you can see here — a classmate&rsquo;s
            parent&rsquo;s phone number, a committee roster — for anything other
            than the PTA activity that gave you access to them.
          </li>
          <li>
            Scrape, mass-export, or copy data from DragonHub without
            authorization.
          </li>
        </ul>
        <p>
          Your PTA board can remove content and remove members from its space.
          We can suspend accounts that violate these Terms.
        </p>

        <h2>5. Your content</h2>
        <p>
          You keep ownership of what you post — messages, photos, volunteer
          notes, event plans, and the rest. By posting, you grant us a limited,
          non-exclusive license to store, display, and process that content as
          needed to operate DragonHub for your PTA community, and you grant your
          PTA the right to use it for PTA purposes.
        </p>
        <p>
          You are responsible for what you post. In particular: do not post
          photos, names, or information about other people&rsquo;s children
          without their parent&rsquo;s permission, and follow whatever photo
          rules your school and PTA already have.
        </p>

        <h2>6. Communications you will receive</h2>
        <p>
          Creating an account means we send you email that is part of the
          service: sign-in links, sign-up confirmations, and notices about your
          account. Your PTA may also send announcements and digests, and the
          mobile app can send push notifications if you allow them.
        </p>
        <p>
          You control the optional ones. Notification types and quiet hours live
          under <strong>Profile → Notifications</strong>, every non-essential
          email has an unsubscribe link, and push can be turned off in your
          device settings. Sign-in and account emails cannot be turned off while
          your account exists.
        </p>

        <h2>7. AI features</h2>
        <p>
          DragonHub includes AI-assisted features — board onboarding guides,
          knowledge base summaries, drafted email content, and question
          answering over your PTA&rsquo;s own documents. AI output can be wrong
          or incomplete. Review it before relying on it, and never treat it as
          financial, legal, or safety advice. We are not responsible for
          inaccuracies in AI-generated content, and a person on your PTA board
          is responsible for anything published from it.
        </p>

        <h2>8. Activities involving children</h2>
        <p>
          DragonHub accounts are for adults, and we do not collect student
          names. Where children take part directly — most often a scavenger hunt
          run at a school event — participation is anonymous: the app assigns a
          handle such as &ldquo;Turbo Narwhal&rdquo; instead of accepting a typed
          name, and a grown-up&rsquo;s name and email are requested only if a
          prize needs to be handed off, and only optionally.
        </p>
        <p>
          Children should take part with a parent or guardian&rsquo;s
          permission, and a parent or guardian remains responsible for their
          child&rsquo;s participation. Do not enter a child&rsquo;s name
          anywhere in DragonHub. If you believe one has been entered, email{" "}
          <a href="mailto:privacy@shredstack.net">privacy@shredstack.net</a> and
          we will remove it.
        </p>

        <h2>9. Feedback</h2>
        <p>
          The in-app feedback button sends your message, along with the page you
          were on, to the person who maintains DragonHub. We may use feedback to
          improve DragonHub without obligation or compensation to you. Do not
          include confidential or sensitive personal information in it.
        </p>

        <h2>10. Cost</h2>
        <p>
          Members are not charged to use DragonHub. Any arrangement about the
          platform is between your PTA and Shredstack, and your PTA can stop
          using DragonHub at any time.
        </p>

        <h2>11. Not for emergencies</h2>
        <p>
          DragonHub is not monitored and must not be used to report an
          emergency, a safety concern, a child-welfare concern, or anything
          time-critical. Contact your school office or emergency services
          directly. Messages and notifications may be delayed or fail to
          deliver.
        </p>

        <h2>12. Service availability</h2>
        <p>
          DragonHub is provided on an &ldquo;as is&rdquo; and &ldquo;as
          available&rdquo; basis. We do not guarantee uninterrupted access, that
          the service will be free of bugs or errors, or that any particular
          feature will keep existing. We may change, suspend, or discontinue
          features, and we will give reasonable notice of significant changes
          where we can.
        </p>

        <h2>13. Termination and deleting your account</h2>
        <p>
          You may stop using DragonHub at any time. You can delete your account
          and personal data yourself from <strong>Profile → Delete account</strong>{" "}
          in the app, or without signing in at{" "}
          <a href="/account/delete">dragonhub.shredstack.net/account/delete</a>,
          or by emailing{" "}
          <a href="mailto:privacy@shredstack.net">privacy@shredstack.net</a>.
          What deletion removes and what it leaves behind is described in the{" "}
          <Link href="/privacy">Privacy Policy</Link>.
        </p>
        <p>
          We may suspend or terminate access for users who violate these Terms,
          and access ends if your PTA discontinues use of the platform.
        </p>

        <h2>14. Disclaimers and limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, Shredstack disclaims all
          warranties, express or implied, including merchantability, fitness for
          a particular purpose, and non-infringement. We are not responsible for
          content posted by your PTA or other members, for decisions made by
          your PTA, or for anything that happens at a PTA or school event
          organized using DragonHub.
        </p>
        <p>
          To the maximum extent permitted by law, Shredstack will not be liable
          for indirect, incidental, special, consequential, or punitive damages,
          and Shredstack&rsquo;s aggregate liability arising out of or relating
          to your use of DragonHub will not exceed one hundred dollars
          (US$100).
        </p>
        <p>
          Some jurisdictions do not allow certain limitations, so parts of this
          section may not apply to you.
        </p>

        <h2>15. Changes to these Terms</h2>
        <p>
          We may update these Terms from time to time. Material changes will be
          communicated by email or in-app notice, and the effective date at the
          top of this page will change. Continued use of DragonHub after a
          change constitutes acceptance of the updated Terms.
        </p>

        <h2>16. Governing law</h2>
        <p>
          These Terms are governed by the laws of the State of Utah, without
          regard to its conflict-of-laws principles. Any dispute will be
          resolved exclusively in the state or federal courts located in Salt
          Lake County, Utah. Before filing anything, please email us — nearly
          everything is faster to fix that way.
        </p>

        <h2>17. Contact</h2>
        <p>
          Questions about these Terms?{" "}
          <a href="mailto:support@shredstack.net">support@shredstack.net</a>
          <br />
          Questions about your data?{" "}
          <a href="mailto:privacy@shredstack.net">privacy@shredstack.net</a>
        </p>
      </div>
    </main>
  );
}
