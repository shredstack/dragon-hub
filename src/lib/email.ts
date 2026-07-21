import { Resend } from "resend";

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
