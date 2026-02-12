import { Resend } from "resend";

const resend = new Resend(process.env.AUTH_RESEND_KEY);

// Base email address (domain must be verified in Resend)
const FROM_EMAIL_ADDRESS =
  process.env.EMAIL_FROM_ADDRESS || "dragonhub@shredstack.net";

interface WelcomeEmailParams {
  to: string;
  name: string;
  schoolName: string;
  classroomNames: string[];
  roles: string[];
  signInUrl: string;
}

export async function sendVolunteerWelcomeEmail({
  to,
  name,
  schoolName,
  classroomNames,
  roles,
  signInUrl,
}: WelcomeEmailParams) {
  const roleList = roles.join(", ");
  const classroomList = classroomNames.join(", ");

  // Use school name in the from field so recipients recognize it
  const fromName = `${schoolName} PTA Hub`;

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

  <p>Thank you for volunteering at ${schoolName}! You've signed up as:</p>

  <div style="background: #f3f4f6; border-radius: 8px; padding: 15px; margin: 20px 0;">
    <p style="margin: 0 0 10px;"><strong>Role(s):</strong> ${roleList}</p>
    <p style="margin: 0;"><strong>Classroom(s):</strong> ${classroomList}</p>
  </div>

  <p>As a volunteer, you'll have access to:</p>
  <ul style="color: #555;">
    <li>Private classroom message boards</li>
    <li>Party planning coordination</li>
    <li>Communication with teachers and other room parents</li>
  </ul>

  <div style="text-align: center; margin: 30px 0;">
    <a href="${signInUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">Sign In to PTA Hub</a>
  </div>

  <p style="color: #666; font-size: 14px;">
    Click the button above to sign in using your email address. You'll receive a magic link to access your account.
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

Thank you for volunteering at ${schoolName}! You've signed up as:

Role(s): ${roleList}
Classroom(s): ${classroomList}

As a volunteer, you'll have access to:
- Private classroom message boards
- Party planning coordination
- Communication with teachers and other room parents

Sign in to PTA Hub: ${signInUrl}

Click the link above to sign in using your email address. You'll receive a magic link to access your account.

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
