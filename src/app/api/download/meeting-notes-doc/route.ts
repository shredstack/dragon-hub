import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { eventPlanMeetings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { assertEventPlanAccess } from "@/lib/auth-helpers";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
} from "docx";
import type { MeetingActionItem } from "@/types";

// Decode HTML entities
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

// Extract text content and formatting from HTML
interface TextSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  highlight?: boolean;
}

function parseInlineFormatting(html: string): TextSegment[] {
  const segments: TextSegment[] = [];

  // Simple regex-based parser for inline formatting
  // This handles nested tags by processing from innermost to outermost
  let remaining = html;

  // Replace <br> with a special marker
  remaining = remaining.replace(/<br\s*\/?>/gi, "\n");

  // Process the HTML character by character, tracking open tags
  let currentText = "";
  let inBold = false;
  let inItalic = false;
  let inUnderline = false;
  let inHighlight = false;
  let i = 0;

  while (i < remaining.length) {
    if (remaining[i] === "<") {
      // Found a tag
      const tagEnd = remaining.indexOf(">", i);
      if (tagEnd === -1) {
        currentText += remaining[i];
        i++;
        continue;
      }

      const tag = remaining.substring(i, tagEnd + 1).toLowerCase();

      // Save current text if any
      if (currentText) {
        segments.push({
          text: decodeHtmlEntities(currentText),
          bold: inBold,
          italic: inItalic,
          underline: inUnderline,
          highlight: inHighlight,
        });
        currentText = "";
      }

      // Process tag
      if (tag.startsWith("<strong") || tag.startsWith("<b>") || tag.startsWith("<b ")) {
        inBold = true;
      } else if (tag === "</strong>" || tag === "</b>") {
        inBold = false;
      } else if (tag.startsWith("<em") || tag.startsWith("<i>") || tag.startsWith("<i ")) {
        inItalic = true;
      } else if (tag === "</em>" || tag === "</i>") {
        inItalic = false;
      } else if (tag.startsWith("<u>") || tag.startsWith("<u ")) {
        inUnderline = true;
      } else if (tag === "</u>") {
        inUnderline = false;
      } else if (tag.includes('class="highlight"') || tag.includes("class='highlight'")) {
        inHighlight = true;
      } else if (tag === "</span>") {
        inHighlight = false;
      } else if (tag.startsWith("<a ")) {
        // For links, just continue (we'll extract the text)
      } else if (tag === "</a>") {
        // End of link
      }
      // Skip other tags (including block tags, which are handled separately)

      i = tagEnd + 1;
    } else {
      currentText += remaining[i];
      i++;
    }
  }

  // Save any remaining text
  if (currentText) {
    segments.push({
      text: decodeHtmlEntities(currentText),
      bold: inBold,
      italic: inItalic,
      underline: inUnderline,
      highlight: inHighlight,
    });
  }

  return segments;
}

function segmentsToTextRuns(segments: TextSegment[]): TextRun[] {
  return segments.map((seg) => {
    return new TextRun({
      text: seg.text,
      bold: seg.bold || undefined,
      italics: seg.italic || undefined,
      underline: seg.underline ? {} : undefined,
      highlight: seg.highlight ? "yellow" : undefined,
    });
  });
}

// Convert HTML to docx paragraphs with proper formatting
function htmlToDocxParagraphs(html: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  // First, normalize line breaks
  let content = html.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Replace nested lists with markers
  content = content.replace(/<ul[^>]*>/gi, "[[UL_START]]");
  content = content.replace(/<\/ul>/gi, "[[UL_END]]");
  content = content.replace(/<ol[^>]*>/gi, "[[OL_START]]");
  content = content.replace(/<\/ol>/gi, "[[OL_END]]");

  // Extract blocks
  const h2Matches = content.match(/<h2[^>]*>([\s\S]*?)<\/h2>/gi) || [];
  const h3Matches = content.match(/<h3[^>]*>([\s\S]*?)<\/h3>/gi) || [];
  const pMatches = content.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [];

  // Process in order by finding positions
  const allBlocks: { pos: number; type: string; content: string; level: number }[] = [];

  // Find all h2
  let searchContent = content;
  let offset = 0;
  for (const h2 of h2Matches) {
    const pos = searchContent.indexOf(h2);
    if (pos !== -1) {
      const innerMatch = h2.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
      if (innerMatch) {
        allBlocks.push({ pos: pos + offset, type: "h2", content: innerMatch[1], level: 0 });
      }
      offset += pos + h2.length;
      searchContent = searchContent.substring(pos + h2.length);
    }
  }

  // Reset and find h3
  searchContent = content;
  offset = 0;
  for (const h3 of h3Matches) {
    const pos = searchContent.indexOf(h3);
    if (pos !== -1) {
      const innerMatch = h3.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
      if (innerMatch) {
        allBlocks.push({ pos: pos + offset, type: "h3", content: innerMatch[1], level: 0 });
      }
      offset += pos + h3.length;
      searchContent = searchContent.substring(pos + h3.length);
    }
  }

  // Reset and find p
  searchContent = content;
  offset = 0;
  for (const p of pMatches) {
    const pos = searchContent.indexOf(p);
    if (pos !== -1) {
      const innerMatch = p.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      if (innerMatch) {
        allBlocks.push({ pos: pos + offset, type: "p", content: innerMatch[1], level: 0 });
      }
      offset += pos + p.length;
      searchContent = searchContent.substring(pos + p.length);
    }
  }

  // Reset and find li (track nesting level)
  searchContent = content;
  offset = 0;
  let currentLevel = 0;
  for (let i = 0; i < content.length; i++) {
    if (content.substring(i).startsWith("[[UL_START]]") || content.substring(i).startsWith("[[OL_START]]")) {
      currentLevel++;
    } else if (content.substring(i).startsWith("[[UL_END]]") || content.substring(i).startsWith("[[OL_END]]")) {
      currentLevel = Math.max(0, currentLevel - 1);
    } else if (content.substring(i).match(/^<li[^>]*>/i)) {
      const liEnd = content.indexOf("</li>", i);
      if (liEnd !== -1) {
        const liContent = content.substring(i, liEnd + 5);
        const innerMatch = liContent.match(/<li[^>]*>([\s\S]*?)<\/li>/i);
        if (innerMatch) {
          // Remove nested list markers from li content
          const cleanContent = innerMatch[1]
            .replace(/\[\[UL_START\]\]/g, "")
            .replace(/\[\[UL_END\]\]/g, "")
            .replace(/\[\[OL_START\]\]/g, "")
            .replace(/\[\[OL_END\]\]/g, "");
          allBlocks.push({ pos: i, type: "li", content: cleanContent, level: currentLevel });
        }
      }
    }
  }

  // Sort by position
  allBlocks.sort((a, b) => a.pos - b.pos);

  // Convert to paragraphs
  for (const block of allBlocks) {
    const segments = parseInlineFormatting(block.content);

    // Check if content is empty
    const hasContent = segments.some(seg => seg.text.trim().length > 0);
    if (!hasContent) {
      continue; // Skip empty blocks
    }

    switch (block.type) {
      case "h2":
        paragraphs.push(
          new Paragraph({
            children: segments.map(seg => new TextRun({
              text: seg.text,
              bold: true,
              italics: seg.italic || undefined,
              underline: seg.underline ? {} : undefined,
              highlight: seg.highlight ? "yellow" : undefined,
              size: 28,
            })),
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 240, after: 120 },
          })
        );
        break;
      case "h3":
        paragraphs.push(
          new Paragraph({
            children: segments.map(seg => new TextRun({
              text: seg.text,
              bold: true,
              italics: seg.italic || undefined,
              underline: seg.underline ? {} : undefined,
              highlight: seg.highlight ? "yellow" : undefined,
              size: 24,
            })),
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 200, after: 100 },
          })
        );
        break;
      case "li":
        const bullet = block.level > 0 ? "  ".repeat(block.level) + "◦ " : "• ";
        paragraphs.push(
          new Paragraph({
            children: [new TextRun(bullet), ...segmentsToTextRuns(segments)],
            spacing: { after: 80 },
            indent: { left: block.level * 360 },
          })
        );
        break;
      case "p":
      default:
        paragraphs.push(
          new Paragraph({
            children: segmentsToTextRuns(segments),
            spacing: { after: 120 },
          })
        );
        break;
    }
  }

  // If no blocks were found, fall back to plain text
  if (paragraphs.length === 0) {
    const plainText = html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .split("\n")
      .filter((line) => line.trim());

    for (const line of plainText) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun(line.trim())],
          spacing: { after: 120 },
        })
      );
    }
  }

  return paragraphs;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const meetingId = searchParams.get("meetingId");

  if (!meetingId) {
    return NextResponse.json(
      { error: "Missing meetingId parameter" },
      { status: 400 }
    );
  }

  // Fetch meeting with notes and event plan
  const meeting = await db.query.eventPlanMeetings.findFirst({
    where: eq(eventPlanMeetings.id, meetingId),
    with: {
      notes: true,
      eventPlan: true,
    },
  });

  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  if (!meeting.notes || meeting.notes.length === 0) {
    return NextResponse.json({ error: "No notes to export" }, { status: 400 });
  }

  // Check authorization
  try {
    await assertEventPlanAccess(session.user.id, meeting.eventPlanId, ["lead"]);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const notes = meeting.notes[0];
  const eventTitle = meeting.eventPlan?.title ?? "Event";

  // Format meeting date
  const meetingDateStr = meeting.meetingDate
    ? new Date(meeting.meetingDate).toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "Date TBD";

  // Format attendees
  const attendeesList = notes.attendees
    ? JSON.parse(notes.attendees).join(", ")
    : "Not recorded";

  // Format location
  const locationDisplay = meeting.meetingRoom
    ? `${meeting.location} (${meeting.meetingRoom})`
    : meeting.location;

  // Build document sections
  const documentChildren: Paragraph[] = [];

  // Title
  documentChildren.push(
    new Paragraph({
      children: [new TextRun({ text: `${eventTitle} — ${meeting.title}`, bold: true, size: 32 })],
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 240 },
    })
  );

  // Meeting details
  documentChildren.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Date: ", bold: true }),
        new TextRun(meetingDateStr),
      ],
      spacing: { after: 80 },
    })
  );

  documentChildren.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Time: ", bold: true }),
        new TextRun(
          meeting.startTime + (meeting.endTime ? ` – ${meeting.endTime}` : "")
        ),
      ],
      spacing: { after: 80 },
    })
  );

  documentChildren.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Location: ", bold: true }),
        new TextRun(locationDisplay),
      ],
      spacing: { after: 80 },
    })
  );

  documentChildren.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Topic: ", bold: true }),
        new TextRun(meeting.topic),
      ],
      spacing: { after: 80 },
    })
  );

  documentChildren.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Attendees: ", bold: true }),
        new TextRun(attendeesList),
      ],
      spacing: { after: 240 },
    })
  );

  // Agenda (if exists)
  if (meeting.agenda) {
    documentChildren.push(
      new Paragraph({
        children: [new TextRun({ text: "Agenda", bold: true, size: 28 })],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 240, after: 120 },
      })
    );
    documentChildren.push(
      new Paragraph({
        children: [new TextRun(meeting.agenda)],
        spacing: { after: 240 },
      })
    );
  }

  // Meeting Notes
  documentChildren.push(
    new Paragraph({
      children: [new TextRun({ text: "Meeting Notes", bold: true, size: 28 })],
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 120 },
    })
  );

  // Convert HTML content to paragraphs
  const noteParagraphs = htmlToDocxParagraphs(notes.content);
  documentChildren.push(...noteParagraphs);

  // Summary (if exists)
  if (notes.summary) {
    documentChildren.push(
      new Paragraph({
        children: [new TextRun({ text: "Summary", bold: true, size: 28 })],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 240, after: 120 },
      })
    );
    documentChildren.push(
      new Paragraph({
        children: [new TextRun(notes.summary)],
        spacing: { after: 240 },
      })
    );
  }

  // Action Items (if exist)
  if (notes.actionItems) {
    const actionItems = JSON.parse(notes.actionItems) as (
      | string
      | MeetingActionItem
    )[];
    if (actionItems.length > 0) {
      documentChildren.push(
        new Paragraph({
          children: [
            new TextRun({ text: "Action Items", bold: true, size: 28 }),
          ],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 240, after: 120 },
        })
      );

      for (const item of actionItems) {
        let itemText: string;
        if (typeof item === "string") {
          itemText = item;
        } else {
          itemText = item.text;
          const assignee = item.assigneeName || item.assigneeId;
          if (assignee) {
            itemText += ` — ${assignee}`;
          }
          if (item.deadline) {
            const deadlineDate = new Date(item.deadline + "T12:00:00Z");
            const formattedDeadline = deadlineDate.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            });
            itemText += ` (due: ${formattedDeadline})`;
          }
        }

        documentChildren.push(
          new Paragraph({
            children: [new TextRun(`• ${itemText}`)],
            spacing: { after: 80 },
          })
        );
      }
    }
  }

  // Create document
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: documentChildren,
      },
    ],
  });

  // Generate buffer and convert to Uint8Array for NextResponse compatibility
  const buffer = await Packer.toBuffer(doc);
  const uint8Array = new Uint8Array(buffer);

  // Create filename
  const safeEventTitle = eventTitle.replace(/[^a-zA-Z0-9\s]/g, "").trim();
  const safeMeetingTitle = meeting.title.replace(/[^a-zA-Z0-9\s]/g, "").trim();
  const safeDateStr = meetingDateStr.replace(/[^a-zA-Z0-9\s]/g, "").trim();
  const fileName = `${safeEventTitle} - ${safeMeetingTitle} Notes - ${safeDateStr}.docx`;

  // Return as downloadable file
  return new NextResponse(uint8Array, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
