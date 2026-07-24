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
 * Consent here is by submitting rather than by ticking a box. The disclosure is
 * specific, it is adjacent to the button, and there is no way to submit without
 * passing it — a checkbox would add a step to a form being filled in on a phone
 * in a loud gym without telling anyone anything the sentence above doesn't.
 */
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
        committee you join. They are never sold, and never shown outside your
        school.
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
