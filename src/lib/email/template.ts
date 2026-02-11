import type { EmailAudience } from "@/types";

interface EmailSection {
  title: string;
  body: string;
  linkUrl?: string;
  linkText?: string;
  imageUrl?: string;
  imageAlt?: string;
  imageLinkUrl?: string;
}

interface CompileEmailParams {
  schoolName: string;
  schoolLogoUrl?: string;
  greeting: string;
  sections: EmailSection[];
  audience: EmailAudience;
}

/**
 * Compiles email sections into a complete HTML email.
 * The output is inline-styled HTML compatible with email clients.
 */
export function compileEmailHtml(params: CompileEmailParams): string {
  const { schoolName, schoolLogoUrl, greeting, sections } = params;

  // Generate sections HTML
  const sectionsHtml = sections
    .map((section) => renderSection(section))
    .join(`
      <tr>
        <td style="padding: 0 20px;">
          <hr style="border: none; border-top: 2px solid #e5e7eb; margin: 30px 0;" />
        </td>
      </tr>
    `);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${schoolName} PTA Update</title>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
  <!--[if mso]>
  <style type="text/css">
    body, table, td {font-family: Arial, Helvetica, sans-serif !important;}
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f3f4f6;">
    <tr>
      <td style="padding: 20px 0;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="598" align="center" style="max-width: 598px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          ${schoolLogoUrl ? renderLogoHeader(schoolLogoUrl, schoolName) : ""}

          <!-- Greeting -->
          <tr>
            <td style="padding: 30px 20px 10px 20px;">
              <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #1f2937;">${greeting}</p>
              <p style="margin: 15px 0 0 0; font-size: 16px; line-height: 1.6; color: #1f2937;">Here are some upcoming events and news to share:</p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0 20px;">
              <hr style="border: none; border-top: 2px solid #e5e7eb; margin: 20px 0;" />
            </td>
          </tr>

          <!-- Sections -->
          ${sectionsHtml}

          <!-- Footer padding -->
          <tr>
            <td style="padding: 30px 20px;">
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderLogoHeader(logoUrl: string, schoolName: string): string {
  return `
          <!-- Logo Header -->
          <tr>
            <td style="padding: 30px 20px; text-align: center; border-bottom: 2px solid #e5e7eb;">
              <img src="${logoUrl}" alt="${schoolName}" width="200" style="max-width: 200px; height: auto;" />
            </td>
          </tr>`;
}

function renderSection(section: EmailSection): string {
  const titleHtml = section.title
    ? `<h1 style="margin: 0 0 15px 0; font-size: 18px; font-weight: 700; color: #1f2937; line-height: 1.3;">${section.title}</h1>`
    : "";

  const bodyHtml = section.body
    ? `<div style="font-size: 15px; line-height: 1.6; color: #374151;">${processBodyHtml(section.body)}</div>`
    : "";

  const linkHtml =
    section.linkUrl && section.linkText
      ? `<p style="margin: 15px 0 0 0;"><a href="${section.linkUrl}" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: underline; font-weight: 500;">${section.linkText}</a></p>`
      : "";

  const imageHtml = section.imageUrl
    ? renderImage(section.imageUrl, section.imageAlt, section.imageLinkUrl)
    : "";

  return `
          <tr>
            <td style="padding: 0 20px;">
              ${titleHtml}
              ${bodyHtml}
              ${linkHtml}
              ${imageHtml}
            </td>
          </tr>`;
}

function renderImage(
  imageUrl: string,
  imageAlt?: string,
  imageLinkUrl?: string
): string {
  const imgTag = `<img src="${imageUrl}" alt="${imageAlt || ""}" width="500" style="max-width: 100%; height: auto; display: block; margin: 20px auto 0 auto; border-radius: 4px;" />`;

  if (imageLinkUrl) {
    return `<p style="margin: 20px 0 0 0; text-align: center;"><a href="${imageLinkUrl}" target="_blank" rel="noopener noreferrer">${imgTag}</a></p>`;
  }

  return `<p style="margin: 20px 0 0 0; text-align: center;">${imgTag}</p>`;
}

function processBodyHtml(body: string): string {
  // Ensure paragraphs have proper styling
  return body
    .replace(/<p>/g, '<p style="margin: 0 0 15px 0;">')
    .replace(/<a /g, '<a style="color: #2563eb; text-decoration: underline;" ')
    .replace(
      /<strong>/g,
      '<strong style="font-weight: 600; color: #1f2937;">'
    );
}

/**
 * Generates a plain text version of the email for accessibility.
 */
export function compileEmailPlainText(params: CompileEmailParams): string {
  const { greeting, sections } = params;

  const sectionsText = sections
    .map((section) => {
      let text = "";
      if (section.title) {
        text += `${section.title}\n${"=".repeat(section.title.length)}\n\n`;
      }
      if (section.body) {
        // Strip HTML tags for plain text
        const plainBody = section.body
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<\/p>/gi, "\n\n")
          .replace(/<[^>]+>/g, "")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .trim();
        text += `${plainBody}\n\n`;
      }
      if (section.linkUrl) {
        text += `Link: ${section.linkUrl}\n\n`;
      }
      return text;
    })
    .join("\n---\n\n");

  return `${greeting}

Here are some upcoming events and news to share:

---

${sectionsText}`;
}
