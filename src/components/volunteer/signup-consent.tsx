/**
 * What a parent is told before they hand over their name and phone number.
 *
 * This sits above the submit button on every public signup form, and it is
 * deliberately one shared component rather than three bits of copy: the three
 * forms collect the same fields, create the same account, and share the same
 * contact details with the same people, so they should not be able to drift
 * into telling parents three different things.
 *
 * Two disclosures, both of which used to happen only *after* submitting:
 *
 *   1. Submitting creates a DragonHub account. The welcome email carries a
 *      one-click sign-in link, which is a pleasant surprise but a bad one to
 *      spring on someone who thought they were filling in a paper form.
 *   2. Their contact details are shared — with the board unconditionally, since
 *      a signup nobody can act on is not a signup, and with the parents and
 *      teacher of any classroom or committee they join, which is the whole
 *      point of a room parent group but is not obvious from a form.
 *
 * And one correction, added for the back-to-school-night QR code: a form handed
 * to a parent inside a school gym reads as coming from the school. It doesn't.
 * Saying so here, rather than only in the Terms, is what keeps a complaint about
 * this app from arriving at the district office — and the same sentence is the
 * reassurance that nothing typed here lands in a school record.
 *
 * Consent here is by submitting rather than by ticking a box. The disclosure is
 * specific, it is adjacent to the button, and there is no way to submit without
 * passing it — a checkbox would add a step to a form being filled in on a phone
 * in a loud gym without telling anyone anything the sentence above doesn't.
 */
import { SUPPORT_EMAIL } from "@/lib/support-contact";

export function SignupConsent({ schoolName }: { schoolName: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/50 p-4 text-sm text-muted-foreground">
      <p>
        Signing up creates a free DragonHub account for you at {schoolName}.
        We&apos;ll email you a one-click sign-in link — no password — so you can
        reach your classroom&apos;s message board, the PTA calendar, and the
        volunteer tools.
      </p>
      <p className="mt-2">
        Your name, email address, and phone number are shared with the PTA board,
        and with the other volunteers and the teacher in any classroom or
        committee you join. They are never sold, never shown outside your
        school, and never used for advertising. We don&apos;t ask for your
        child&apos;s name — picking a classroom tells us the room, not the kid.
      </p>
      <p className="mt-2">
        DragonHub is an app your PTA uses, built by a parent volunteer on the
        board. It is{" "}
        <strong className="font-medium">
          not a school or school district app
        </strong>{" "}
        and is not endorsed by them, so nothing you enter here goes into a
        school record. Questions or problems with the app come to{" "}
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="font-medium text-dragon-blue-600 underline underline-offset-2"
        >
          {SUPPORT_EMAIL}
        </a>
        .
      </p>
      <p className="mt-2">
        By signing up you agree to our{" "}
        <a
          href="/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-dragon-blue-600 underline underline-offset-2"
        >
          Terms of Service
        </a>{" "}
        and{" "}
        <a
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-dragon-blue-600 underline underline-offset-2"
        >
          Privacy Policy
        </a>
        .
      </p>
    </div>
  );
}
