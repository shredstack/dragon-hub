import { Resend } from "resend";
import { escapeHtml } from "@/lib/signup-page-content";
import type { VolunteerEligibilityInfo } from "@/lib/volunteer-eligibility";

const resend = new Resend(process.env.AUTH_RESEND_KEY);

// Base email address (domain must be verified in Resend)
const FROM_EMAIL_ADDRESS =
  process.env.EMAIL_FROM_ADDRESS || "dragonhub@shredstack.net";

interface SignupInfo {
  /**
   * Omitted by flows that aren't classroom-scoped (e.g. volunteer interest
   * campaigns, where `role` already carries the event name).
   */
  classroomName?: string;
  role: string;
}

interface WelcomeEmailParams {
  to: string;
  name: string;
  schoolName: string;
  signups: SignupInfo[];
  /** Sentence introducing the list. Defaults to the room parent wording. */
  listIntro?: string;
  /** "You'll have access to" bullets. Defaults to the classroom-centric list. */
  benefits?: string[];
  /** One-click sign-in link when `directSignIn` is true, otherwise the sign-in page. */
  signInUrl: string;
  /** True when `signInUrl` logs the user in directly (no second magic-link email). */
  directSignIn?: boolean;
  /** How long the one-click link stays valid. Only used when `directSignIn`. */
  expiresInHours?: number;
  /** Sign-in page URL, offered as a fallback when the one-click link expires. */
  fallbackSignInUrl?: string;
  /**
   * District volunteer-application reminder. Null when the school hasn't
   * configured a link, in which case the block is omitted entirely.
   */
  eligibility?: VolunteerEligibilityInfo | null;
}

export async function sendVolunteerWelcomeEmail({
  to,
  name,
  schoolName,
  signups,
  listIntro = "You've signed up as:",
  benefits = [
    "Private classroom message boards",
    "Party planning coordination",
    "Communication with teachers and other room parents",
  ],
  signInUrl,
  directSignIn = false,
  expiresInHours = 72,
  fallbackSignInUrl,
  eligibility = null,
}: WelcomeEmailParams) {
  // Build the signup list for display
  const signupListHtml = signups
    .map(
      (s) =>
        `<li><strong>${s.role}</strong>${s.classroomName ? ` for ${s.classroomName}` : ""}</li>`
    )
    .join("\n    ");
  const signupListText = signups
    .map((s) => `- ${s.role}${s.classroomName ? ` for ${s.classroomName}` : ""}`)
    .join("\n");
  const benefitsHtml = benefits.map((b) => `<li>${b}</li>`).join("\n    ");
  const benefitsText = benefits.map((b) => `- ${b}`).join("\n");

  // Use school name in the from field so recipients recognize it
  const fromName = `${schoolName} PTA Hub`;

  // With a one-click link the volunteer lands in the hub straight from this
  // email; without one they have to request a magic link from the sign-in page.
  const expiryLabel =
    expiresInHours % 24 === 0
      ? `${expiresInHours / 24} day${expiresInHours === 24 ? "" : "s"}`
      : `${expiresInHours} hours`;
  const ctaLabel = directSignIn ? "Open Your PTA Hub" : "Sign In to PTA Hub";
  const ctaHelpHtml = directSignIn
    ? `The button above logs you in automatically &mdash; no password needed. It works for ${expiryLabel}${
        fallbackSignInUrl
          ? `; after that you can sign in any time at <a href="${fallbackSignInUrl}">${fallbackSignInUrl}</a>`
          : ""
      }.`
    : "Click the button above to sign in using your email address. You'll receive a magic link to access your account.";
  const ctaHelpText = directSignIn
    ? `The link above logs you in automatically - no password needed. It works for ${expiryLabel}${
        fallbackSignInUrl ? `; after that you can sign in any time at ${fallbackSignInUrl}` : ""
      }.`
    : "Click the link above to sign in using your email address. You'll receive a magic link to access your account.";

  // The district's annual volunteer application is the one thing that can stop
  // a new volunteer at the door, so it gets its own highlighted block above the
  // sign-in CTA rather than a line buried in the footer.
  const eligibilityHtml = eligibility
    ? `
  <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 15px; margin: 20px 0;">
    <p style="margin: 0 0 8px; font-weight: 600; color: #92400e;">One more step before you can volunteer</p>
    <p style="margin: 0 0 10px; color: #92400e; font-size: 14px;">${escapeHtml(eligibility.note)}</p>
    ${
      eligibility.deadline
        ? `<p style="margin: 0 0 10px; color: #92400e; font-size: 14px; font-weight: 600;">${escapeHtml(eligibility.deadline)}</p>`
        : ""
    }
    <a href="${escapeHtml(eligibility.url)}" style="display: inline-block; background: #d97706; color: white; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: 500; font-size: 14px;">${escapeHtml(eligibility.linkLabel)}</a>
  </div>`
    : "";
  const eligibilityText = eligibility
    ? `
ONE MORE STEP BEFORE YOU CAN VOLUNTEER
${eligibility.note}
${eligibility.deadline ? `${eligibility.deadline}\n` : ""}${eligibility.linkLabel}: ${eligibility.url}
`
    : "";

  const { error } = await resend.emails.send({
    from: `${fromName} <${FROM_EMAIL_ADDRESS}>`,
    to,
    subject: `Welcome to ${schoolName} PTA Hub!`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #2563eb; margin: 0;">${schoolName} PTA Hub</h1>
  </div>

  <h2 style="margin-bottom: 10px;">Welcome, ${name}!</h2>

  <p>Thank you for volunteering at ${schoolName}! ${listIntro}</p>

  <div style="background: #f3f4f6; border-radius: 8px; padding: 15px; margin: 20px 0;">
    <ul style="margin: 0; padding-left: 20px;">
    ${signupListHtml}
    </ul>
  </div>

  <p>As a volunteer, you'll have access to:</p>
  <ul style="color: #555;">
    ${benefitsHtml}
  </ul>
${eligibilityHtml}

  <div style="text-align: center; margin: 30px 0;">
    <a href="${signInUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">${ctaLabel}</a>
  </div>

  <p style="color: #666; font-size: 14px;">
    ${ctaHelpHtml}
  </p>

  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

  <p style="color: #999; font-size: 12px; text-align: center;">
    This email was sent because you signed up as a volunteer at ${schoolName}.
  </p>
</body>
</html>
    `.trim(),
    text: `
Welcome to ${schoolName} PTA Hub!

Hi ${name},

Thank you for volunteering at ${schoolName}! ${listIntro}

${signupListText}

As a volunteer, you'll have access to:
${benefitsText}
${eligibilityText}
${directSignIn ? "Open your PTA Hub" : "Sign in to PTA Hub"}: ${signInUrl}

${ctaHelpText}

---
This email was sent because you signed up as a volunteer at ${schoolName}.
    `.trim(),
  });

  if (error) {
    console.error("Failed to send welcome email:", error);
    throw new Error(`Failed to send welcome email: ${error.message}`);
  }

  return { success: true };
}

// ─── Magic Link Email ───────────────────────────────────────────────────────

interface MagicLinkEmailParams {
  to: string;
  url: string;
  schoolName?: string | null;
}

export async function sendMagicLinkEmail({
  to,
  url,
  schoolName,
}: MagicLinkEmailParams) {
  const baseUrl =
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  const logoUrl = `${baseUrl}/dragon-hub-logo.png`;

  // Personalized content for users with a school vs generic Dragon Hub users
  const isPersonalized = !!schoolName;
  const appName = isPersonalized ? `${schoolName} PTA Hub` : "Dragon Hub";
  const fromName = isPersonalized ? `${schoolName} PTA Hub` : "Dragon Hub";
  const subject = isPersonalized
    ? `Sign in to ${schoolName} PTA Hub`
    : "Your Dragon Hub sign-in link";

  // Different intro text based on whether we know their school
  const introText = isPersonalized
    ? `Click the button below to sign in to ${appName}. This link will expire in 24 hours.`
    : "Dragon Hub helps you stay connected with your school community. Access PTA events, volunteer opportunities, classroom updates, and more.";

  const headerHtml = isPersonalized
    ? `<h1 style="color: #2563eb; margin: 0;">${appName}</h1>`
    : `<img src="${logoUrl}" alt="Dragon Hub" width="80" height="80" style="display: block; margin: 0 auto 15px auto;">
    <h1 style="color: #2563eb; margin: 0;">Dragon Hub</h1>
    <p style="color: #666; margin: 10px 0 0 0; font-size: 14px;">Your school community, connected</p>`;

  const { error } = await resend.emails.send({
    from: `${fromName} <${FROM_EMAIL_ADDRESS}>`,
    to,
    subject,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="text-align: center; margin-bottom: 30px;">
    ${headerHtml}
  </div>

  <h2 style="margin-bottom: 10px;">Sign in to your account</h2>

  <p>${introText}</p>

  <div style="text-align: center; margin: 30px 0;">
    <a href="${url}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">Sign In to ${isPersonalized ? "PTA Hub" : "Dragon Hub"}</a>
  </div>

  ${
    !isPersonalized
      ? `
  <p style="color: #666; font-size: 14px;">This link will expire in 24 hours.</p>
  `
      : ""
  }

  <p style="color: #666; font-size: 14px;">
    If you didn't request this email, you can safely ignore it. Someone may have entered your email address by mistake.
  </p>

  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

  <p style="color: #999; font-size: 12px; text-align: center;">
    If the button doesn't work, copy and paste this link into your browser:<br>
    <a href="${url}" style="color: #2563eb; word-break: break-all;">${url}</a>
  </p>
</body>
</html>
    `.trim(),
    text: `
Sign in to ${appName}

${introText}

Click the link below to sign in. This link will expire in 24 hours.

${url}

If you didn't request this email, you can safely ignore it. Someone may have entered your email address by mistake.
    `.trim(),
  });

  if (error) {
    console.error("Failed to send magic link email:", error);
    throw new Error(`Failed to send magic link email: ${error.message}`);
  }

  return { success: true };
}

// ─── Verification Reminder Email ────────────────────────────────────────────

interface VerificationReminderParams {
  to: string;
  /** One-click sign-in link minted with `createSignInLink`. */
  url: string;
  schoolName: string;
  /** Blank when we only captured an email at signup. */
  name?: string | null;
  /** How long the one-click link stays valid. */
  expiresInHours?: number;
}

/**
 * Nudge someone who signed up to volunteer but never clicked their original
 * welcome link. Unlike `sendMagicLinkEmail` (a bare "sign in" link), this makes
 * clear we already have their spot saved and clicking just confirms their email
 * so they can get into DragonHub. Sent by the PTA board from the Member
 * Directory via `resendMemberInvite`.
 */
export async function sendVerificationReminderEmail({
  to,
  url,
  schoolName,
  name,
  expiresInHours = 72,
}: VerificationReminderParams) {
  const appName = `${schoolName} PTA Hub`;
  const greeting = name ? `Hi ${escapeHtml(name)},` : "Hi there,";

  const { error } = await resend.emails.send({
    from: `${appName} <${FROM_EMAIL_ADDRESS}>`,
    to,
    subject: `Confirm your email to get into ${schoolName} PTA Hub`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #2563eb; margin: 0;">${escapeHtml(appName)}</h1>
  </div>

  <p>${greeting}</p>

  <p>Thanks for signing up to help at ${escapeHtml(schoolName)}! We've saved
  your spot — you just need to confirm your email to get into DragonHub, where
  you can see your classroom message board and coordinate with other volunteers.</p>

  <div style="text-align: center; margin: 30px 0;">
    <a href="${url}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">Confirm my email &amp; sign in</a>
  </div>

  <p style="color: #666; font-size: 14px;">This link signs you in directly — no
  password needed — and expires in ${expiresInHours} hours.</p>

  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

  <p style="color: #999; font-size: 12px; text-align: center;">
    If the button doesn't work, copy and paste this link into your browser:<br>
    <a href="${url}" style="color: #2563eb; word-break: break-all;">${url}</a>
  </p>
</body>
</html>
    `.trim(),
    text: `
${greeting}

Thanks for signing up to help at ${schoolName}! We've saved your spot — you just
need to confirm your email to get into DragonHub, where you can see your
classroom message board and coordinate with other volunteers.

Confirm your email and sign in (no password needed, expires in ${expiresInHours} hours):
${url}
    `.trim(),
  });

  if (error) {
    console.error("Failed to send verification reminder email:", error);
    throw new Error(`Failed to send verification reminder: ${error.message}`);
  }

  return { success: true };
}

interface EventPlanInviteEmailParams {
  to: string;
  /** Blank for someone the inviter only knew by email address. */
  inviteeName?: string | null;
  eventTitle: string;
  /** Already formatted for display, or null when the date isn't set yet. */
  eventDate?: string | null;
  schoolName: string;
  inviterName: string;
  /** Whether they're being brought on to run the event or to help. */
  role: "lead" | "member";
  /** Accept link carrying the invite token. */
  acceptUrl: string;
  /** Note the inviter typed, shown in their words. */
  message?: string | null;
}

/**
 * Invitation to help with one event.
 *
 * Deliberately says what the invitee is being asked to do and by whom before it
 * asks them to click anything — most recipients have never heard of Dragon Hub,
 * and a bare "you've been invited" from an unfamiliar app reads as spam.
 */
export async function sendEventPlanInviteEmail({
  to,
  inviteeName,
  eventTitle,
  eventDate,
  schoolName,
  inviterName,
  role,
  acceptUrl,
  message,
}: EventPlanInviteEmailParams) {
  const appName = `${schoolName} PTA Hub`;
  const greeting = inviteeName ? `Hi ${escapeHtml(inviteeName)},` : "Hi,";
  const roleText =
    role === "lead"
      ? "help lead"
      : "help with";
  const safeEvent = escapeHtml(eventTitle);
  const safeInviter = escapeHtml(inviterName);
  const safeSchool = escapeHtml(schoolName);

  const dateLine = eventDate
    ? `<p style="margin: 0 0 8px 0;"><strong>When:</strong> ${escapeHtml(eventDate)}</p>`
    : "";

  const messageBlock = message
    ? `
  <div style="border-left: 3px solid #2563eb; padding: 4px 0 4px 14px; margin: 20px 0; color: #444;">
    <p style="margin: 0; font-style: italic;">${escapeHtml(message)}</p>
    <p style="margin: 6px 0 0 0; font-size: 13px; color: #666;">— ${safeInviter}</p>
  </div>`
    : "";

  const { error } = await resend.emails.send({
    from: `${appName} <${FROM_EMAIL_ADDRESS}>`,
    to,
    subject: `${inviterName} invited you to help with ${eventTitle}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #2563eb; margin: 0;">${safeSchool} PTA Hub</h1>
  </div>

  <p>${greeting}</p>

  <p><strong>${safeInviter}</strong> has invited you to ${roleText} <strong>${safeEvent}</strong> at ${safeSchool}.</p>

  <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 20px 0;">
    <p style="margin: 0 0 8px 0;"><strong>Event:</strong> ${safeEvent}</p>
    ${dateLine}
    <p style="margin: 0;"><strong>Your role:</strong> ${role === "lead" ? "Lead" : "Member"}</p>
  </div>

  ${messageBlock}

  <p>Accepting gets you into the event's planning space, where you'll find the task list, meeting notes, files, and the team's message board.</p>

  <div style="text-align: center; margin: 30px 0;">
    <a href="${acceptUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">Accept Invitation</a>
  </div>

  <p style="color: #666; font-size: 14px;">
    You'll be asked to sign in with this email address. No password to remember — we'll email you a sign-in link.
  </p>

  <p style="color: #666; font-size: 14px;">
    If you weren't expecting this, you can safely ignore this email and nothing will happen.
  </p>

  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

  <p style="color: #999; font-size: 12px; text-align: center;">
    If the button doesn't work, copy and paste this link into your browser:<br>
    <a href="${acceptUrl}" style="color: #2563eb; word-break: break-all;">${acceptUrl}</a>
  </p>
</body>
</html>
    `.trim(),
    text: `
${inviteeName ? `Hi ${inviteeName},` : "Hi,"}

${inviterName} has invited you to ${roleText} ${eventTitle} at ${schoolName}.

Event: ${eventTitle}${eventDate ? `\nWhen: ${eventDate}` : ""}
Your role: ${role === "lead" ? "Lead" : "Member"}
${message ? `\n"${message}"\n— ${inviterName}\n` : ""}
Accepting gets you into the event's planning space — task list, meeting notes, files, and the team's message board.

Accept your invitation:
${acceptUrl}

You'll be asked to sign in with this email address. If you weren't expecting this, you can safely ignore this email.
    `.trim(),
  });

  if (error) {
    console.error("Failed to send event plan invite email:", error);
    throw new Error(`Failed to send event plan invite email: ${error.message}`);
  }

  return { success: true };
}

// ─── Committee Weekly Digest ───────────────────────────────────────────────

interface DigestSection {
  committeeName: string;
  committeeUrl: string;
  newMessages: Array<{ author: string; excerpt: string }>;
  extraMessageCount: number;
  tasksCreated: string[];
  tasksCompleted: string[];
  tasksDueSoon: Array<{
    title: string;
    dueDate: Date | null;
    assigneeName: string | null;
  }>;
  newMembers: string[];
  promotedMembers: string[];
  stillNeeded: number | null;
  joinUrl: string | null;
}

interface CommitteeDigestEmailParams {
  to: string;
  name: string | null;
  schoolName: string;
  /** One per committee the recipient is on that had something to report. */
  sections: DigestSection[];
  /** Token-bearing URL that works without signing in. */
  unsubscribeUrl: string;
}

function digestDate(date: Date | null): string {
  if (!date) return "";
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function bulletList(items: string[]): string {
  return items.map((i) => `<li>${escapeHtml(i)}</li>`).join("");
}

/**
 * The weekly "here's what happened" email.
 *
 * The forward-looking block — tasks due in the next seven days — is deliberately
 * near the top of each section. It's the reason someone opens this rather than
 * archiving it, and burying it under a recap of things they already know would
 * waste the one thing the digest is good for.
 */
export async function sendCommitteeDigestEmail({
  to,
  name,
  schoolName,
  sections,
  unsubscribeUrl,
}: CommitteeDigestEmailParams) {
  const appName = `${schoolName} PTA Hub`;
  const greeting = name ? `Hi ${escapeHtml(name)},` : "Hi,";

  const sectionsHtml = sections
    .map((section) => {
      const blocks: string[] = [];

      if (section.tasksDueSoon.length > 0) {
        blocks.push(`
    <p style="margin: 14px 0 6px; font-weight: 600;">Due in the next week</p>
    <ul style="margin: 0; padding-left: 20px; color: #444;">
      ${section.tasksDueSoon
        .map(
          (t) =>
            `<li>${escapeHtml(t.title)}${
              t.dueDate ? ` — <strong>${escapeHtml(digestDate(t.dueDate))}</strong>` : ""
            }${t.assigneeName ? ` (${escapeHtml(t.assigneeName)})` : ""}</li>`
        )
        .join("")}
    </ul>`);
      }

      if (section.newMessages.length > 0) {
        blocks.push(`
    <p style="margin: 14px 0 6px; font-weight: 600;">New messages</p>
    ${section.newMessages
      .map(
        (m) => `
    <div style="border-left: 3px solid #e5e7eb; padding: 2px 0 2px 12px; margin: 0 0 8px; color: #444;">
      <p style="margin: 0; font-size: 14px;"><strong>${escapeHtml(m.author)}</strong></p>
      <p style="margin: 2px 0 0; font-size: 14px;">${escapeHtml(m.excerpt)}</p>
    </div>`
      )
      .join("")}
    ${
      section.extraMessageCount > 0
        ? `<p style="margin: 0; font-size: 13px; color: #666;">…and ${section.extraMessageCount} more.</p>`
        : ""
    }`);
      }

      if (section.tasksCompleted.length > 0) {
        blocks.push(`
    <p style="margin: 14px 0 6px; font-weight: 600;">Done this week</p>
    <ul style="margin: 0; padding-left: 20px; color: #444;">${bulletList(section.tasksCompleted)}</ul>`);
      }

      if (section.tasksCreated.length > 0) {
        blocks.push(`
    <p style="margin: 14px 0 6px; font-weight: 600;">New tasks</p>
    <ul style="margin: 0; padding-left: 20px; color: #444;">${bulletList(section.tasksCreated)}</ul>`);
      }

      const people = [
        ...section.newMembers.map((n) => `${n} joined`),
        ...section.promotedMembers.map((n) => `${n} came off the waitlist`),
      ];
      if (people.length > 0) {
        blocks.push(`
    <p style="margin: 14px 0 6px; font-weight: 600;">Who's new</p>
    <ul style="margin: 0; padding-left: 20px; color: #444;">${bulletList(people)}</ul>`);
      }

      if (section.stillNeeded !== null && section.joinUrl) {
        blocks.push(`
    <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 12px; margin: 14px 0 0;">
      <p style="margin: 0; color: #92400e; font-size: 14px;">
        We still need <strong>${section.stillNeeded} more</strong> volunteer${section.stillNeeded === 1 ? "" : "s"}.
        Know someone? <a href="${section.joinUrl}" style="color: #92400e;">Share the join link</a>.
      </p>
    </div>`);
      }

      return `
  <div style="margin: 0 0 28px;">
    <h2 style="margin: 0 0 4px; font-size: 18px;">
      <a href="${section.committeeUrl}" style="color: #2563eb; text-decoration: none;">${escapeHtml(section.committeeName)}</a>
    </h2>
    ${blocks.join("")}
  </div>`;
    })
    .join(`<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 0 0 24px;">`);

  const sectionsText = sections
    .map((section) => {
      const lines = [section.committeeName.toUpperCase(), section.committeeUrl, ""];
      if (section.tasksDueSoon.length > 0) {
        lines.push("Due in the next week:");
        for (const t of section.tasksDueSoon) {
          lines.push(
            `- ${t.title}${t.dueDate ? ` — ${digestDate(t.dueDate)}` : ""}${t.assigneeName ? ` (${t.assigneeName})` : ""}`
          );
        }
        lines.push("");
      }
      if (section.newMessages.length > 0) {
        lines.push("New messages:");
        for (const m of section.newMessages) lines.push(`- ${m.author}: ${m.excerpt}`);
        if (section.extraMessageCount > 0) {
          lines.push(`  …and ${section.extraMessageCount} more.`);
        }
        lines.push("");
      }
      if (section.tasksCompleted.length > 0) {
        lines.push("Done this week:", ...section.tasksCompleted.map((t) => `- ${t}`), "");
      }
      if (section.tasksCreated.length > 0) {
        lines.push("New tasks:", ...section.tasksCreated.map((t) => `- ${t}`), "");
      }
      const people = [
        ...section.newMembers.map((n) => `${n} joined`),
        ...section.promotedMembers.map((n) => `${n} came off the waitlist`),
      ];
      if (people.length > 0) {
        lines.push("Who's new:", ...people.map((p) => `- ${p}`), "");
      }
      if (section.stillNeeded !== null && section.joinUrl) {
        lines.push(
          `We still need ${section.stillNeeded} more volunteer${section.stillNeeded === 1 ? "" : "s"}. Share the join link: ${section.joinUrl}`,
          ""
        );
      }
      return lines.join("\n");
    })
    .join("\n---\n\n");

  const subject =
    sections.length === 1
      ? `${sections[0].committeeName}: this week`
      : `Your committees this week — ${schoolName} PTA`;

  const { error } = await resend.emails.send({
    from: `${appName} <${FROM_EMAIL_ADDRESS}>`,
    to,
    subject,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="text-align: center; margin-bottom: 24px;">
    <h1 style="color: #2563eb; margin: 0; font-size: 22px;">${escapeHtml(schoolName)} PTA Hub</h1>
  </div>

  <p>${greeting}</p>
  <p style="color: #444;">Here's what happened on your committee${sections.length === 1 ? "" : "s"} this week.</p>

  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">

  ${sectionsHtml}

  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

  <p style="color: #999; font-size: 12px; text-align: center;">
    You're getting this because you're on a PTA committee at ${escapeHtml(schoolName)}.<br>
    <a href="${unsubscribeUrl}" style="color: #999;">Turn off these weekly emails</a>
  </p>
</body>
</html>
    `.trim(),
    text: `
${name ? `Hi ${name},` : "Hi,"}

Here's what happened on your committee${sections.length === 1 ? "" : "s"} this week.

${sectionsText}
---
You're getting this because you're on a PTA committee at ${schoolName}.
Turn off these weekly emails: ${unsubscribeUrl}
    `.trim(),
  });

  if (error) {
    console.error("Failed to send committee digest email:", error);
    throw new Error(`Failed to send committee digest email: ${error.message}`);
  }

  return { success: true };
}
