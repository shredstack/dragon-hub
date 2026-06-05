import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service - DragonHub",
  description: "Terms governing your use of DragonHub.",
};

const EFFECTIVE_DATE = "May 24, 2026";

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

      <div className="prose prose-slate mt-8 max-w-none">
        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) govern your use of
          DragonHub, a Parent Teacher Association (PTA) coordination platform
          operated by Shredstack (&ldquo;we&rdquo;, &ldquo;us&rdquo;). By
          accessing or using DragonHub on the web or through the mobile app,
          you agree to be bound by these Terms.
        </p>

        <h2>1. Who can use DragonHub</h2>
        <p>
          DragonHub is intended for adult members of participating PTA
          communities (parents, guardians, teachers, school staff, and PTA
          board members). You must be at least 18 years old to create an
          account.
        </p>

        <h2>2. Your account</h2>
        <ul>
          <li>You are responsible for keeping the email address associated with your account secure, since sign-in is via email magic link.</li>
          <li>You will not share account access with others or impersonate another person.</li>
          <li>Promptly notify your PTA board admin or us if you believe your account has been compromised.</li>
        </ul>

        <h2>3. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Post content that is unlawful, harassing, defamatory, discriminatory, or that violates the privacy of others, particularly students or minors.</li>
          <li>Upload malware or attempt to disrupt the service.</li>
          <li>Access or attempt to access data belonging to schools or users other than your own.</li>
          <li>Use DragonHub for commercial solicitation outside of PTA-sanctioned fundraising.</li>
          <li>Scrape, mass-export, or copy data from DragonHub without authorization.</li>
        </ul>

        <h2>4. Your content</h2>
        <p>
          You retain ownership of content you post (messages, photos, volunteer
          notes, etc.). By posting content, you grant DragonHub a limited,
          non-exclusive license to store, display, and process it as needed to
          operate the app for your PTA community.
        </p>
        <p>
          You are responsible for the content you post. Do not post photos or
          information about other people&rsquo;s children without their
          permission.
        </p>

        <h2>5. PTA-managed data</h2>
        <p>
          Your PTA board controls administrative settings such as connected
          Google Calendar, budget sheets, and Drive folders. Synchronized
          content displayed in DragonHub is owned and controlled by your PTA,
          not by us.
        </p>

        <h2>6. AI features</h2>
        <p>
          DragonHub offers AI-generated content (e.g. board onboarding guides,
          knowledge base summaries). AI output may contain errors and should be
          reviewed before being relied upon for important decisions. We are not
          responsible for inaccuracies in AI-generated content.
        </p>

        <h2>7. Service availability</h2>
        <p>
          DragonHub is provided on an &ldquo;as is&rdquo; and &ldquo;as
          available&rdquo; basis. We do not guarantee uninterrupted access or
          that the service will be free of bugs or errors.
        </p>

        <h2>8. Termination</h2>
        <p>
          You may stop using DragonHub at any time and request account deletion
          via your PTA admin or by emailing{" "}
          <a href="mailto:privacy@shredstack.net">privacy@shredstack.net</a>.
          We may suspend or terminate access for users who violate these Terms
          or whose PTA discontinues use of the platform.
        </p>

        <h2>9. Disclaimers and limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, Shredstack disclaims all
          warranties, express or implied, including merchantability, fitness
          for a particular purpose, and non-infringement. In no event will
          Shredstack&rsquo;s aggregate liability arising out of or relating to
          your use of DragonHub exceed one hundred dollars (US$100).
        </p>

        <h2>10. Changes to these Terms</h2>
        <p>
          We may update these Terms from time to time. Material changes will be
          communicated by email or in-app notice. Continued use of DragonHub
          after a change constitutes acceptance of the updated Terms.
        </p>

        <h2>11. Governing law</h2>
        <p>
          These Terms are governed by the laws of the State of Utah, without
          regard to its conflict-of-laws principles. Any dispute will be
          resolved exclusively in the state or federal courts located in Salt
          Lake County, Utah.
        </p>

        <h2>12. Contact</h2>
        <p>
          Questions about these Terms?{" "}
          <a href="mailto:support@shredstack.net">support@shredstack.net</a>
        </p>
      </div>
    </main>
  );
}
