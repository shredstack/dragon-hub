import type { EmailAudience } from "@/types";
import {
  renderEmailHeaderHtml,
  renderEmailHeaderPlainText,
  type EmailHeader,
} from "./header";
import {
  parseImagePosition,
  type EmailImagePosition,
} from "./image-position";
import {
  emailImageWidthPx,
  type EmailImageWidth,
} from "./image-width";

interface EmailSection {
  title: string;
  body: string;
  linkUrl?: string;
  linkText?: string;
  imageUrl?: string;
  imageAlt?: string;
  imageLinkUrl?: string;
  imagePosition?: EmailImagePosition | string | null;
  /** A slug into `EMAIL_IMAGE_WIDTHS`; unset reads as "large" (500px). */
  imageWidth?: EmailImageWidth | string | null;
}

interface CompileEmailParams {
  schoolName: string;
  schoolLogoUrl?: string;
  /**
   * The editable block above the first section. Omit it and the built-in
   * greeting stands — see src/lib/email/header.ts.
   */
  header?: EmailHeader;
  sections: EmailSection[];
  audience: EmailAudience;
}

const EMPTY_HEADER: EmailHeader = {
  headerHtml: null,
  headerImageUrl: null,
  headerImageAlt: null,
  headerImageWidth: null,
};

/**
 * Compiles email sections into a complete HTML email.
 * The output is inline-styled HTML compatible with email clients.
 */
export function compileEmailHtml(params: CompileEmailParams): string {
  const { schoolName, schoolLogoUrl, sections, audience } = params;

  const headerHtml = renderEmailHeaderHtml({
    header: params.header ?? EMPTY_HEADER,
    schoolName,
    audience,
  });

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

          <!-- Header (editable per campaign) -->
          ${headerHtml}

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

  const position = parseImagePosition(section.imagePosition);
  const imageHtml = section.imageUrl
    ? renderImage({
        imageUrl: section.imageUrl,
        position,
        widthPx: emailImageWidthPx(section.imageWidth),
        imageAlt: section.imageAlt,
        imageLinkUrl: section.imageLinkUrl,
      })
    : "";

  // Above the text or below it — the section's own choice. The title stays put
  // either way: it names the section, so it belongs at the top of the block.
  const stack =
    position === "above"
      ? [titleHtml, imageHtml, bodyHtml, linkHtml]
      : [titleHtml, bodyHtml, linkHtml, imageHtml];

  return `
          <tr>
            <td style="padding: 0 20px;">
              ${stack.filter(Boolean).join("\n              ")}
            </td>
          </tr>`;
}

function renderImage(params: {
  imageUrl: string;
  position: EmailImagePosition;
  /**
   * The secretary's size choice, already resolved to pixels. It goes in the
   * `width` attribute rather than the style block because Outlook lays out
   * from the attribute and ignores a CSS width; `max-width: 100%` is what
   * still lets a wide image shrink on a phone.
   */
  widthPx: number;
  imageAlt?: string;
  imageLinkUrl?: string;
}): string {
  const { imageUrl, position, widthPx, imageAlt, imageLinkUrl } = params;

  // An image above the body needs breathing room under it, not over it.
  const margin = position === "above" ? "0 auto 20px auto" : "20px auto 0 auto";
  const wrapperMargin = position === "above" ? "0 0 20px 0" : "20px 0 0 0";
  const imgTag = `<img src="${imageUrl}" alt="${imageAlt || ""}" width="${widthPx}" style="max-width: 100%; height: auto; display: block; margin: ${margin}; border-radius: 4px;" />`;

  if (imageLinkUrl) {
    return `<p style="margin: ${wrapperMargin}; text-align: center;"><a href="${imageLinkUrl}" target="_blank" rel="noopener noreferrer">${imgTag}</a></p>`;
  }

  return `<p style="margin: ${wrapperMargin}; text-align: center;">${imgTag}</p>`;
}

function processBodyHtml(body: string): string {
  // Ensure paragraphs have proper styling
  return body
    .replace(/<p>/g, '<p style="margin: 0 0 15px 0;">')
    .replace(/<a /g, '<a style="color: #2563eb; text-decoration: underline;" ')
    .replace(/<strong>/g, '<strong style="font-weight: 600;">');
}

/**
 * Generates a plain text version of the email for accessibility.
 */
export function compileEmailPlainText(params: CompileEmailParams): string {
  const { sections, schoolName, audience } = params;

  const header = renderEmailHeaderPlainText({
    header: params.header ?? EMPTY_HEADER,
    schoolName,
    audience,
  });

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

  return header ? `${header}\n\n---\n\n${sectionsText}` : sectionsText;
}
