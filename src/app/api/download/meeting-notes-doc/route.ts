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
  AlignmentType,
} from "docx";
import type { MeetingActionItem } from "@/types";

// Convert basic HTML to docx paragraphs
function htmlToDocxParagraphs(html: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  // Remove HTML tags and split by block elements
  // This is a simple conversion - handles basic HTML from the notes editor
  const text = html
    // Replace <br> with newlines
    .replace(/<br\s*\/?>/gi, "\n")
    // Replace closing block tags with newlines
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n")
    // Remove opening tags but keep content
    .replace(/<[^>]+>/g, "")
    // Decode common HTML entities
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Normalize whitespace
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  // Split into paragraphs
  const lines = text.split("\n").filter((line) => line.trim());

  for (const line of lines) {
    paragraphs.push(
      new Paragraph({
        children: [new TextRun(line.trim())],
        spacing: { after: 120 },
      })
    );
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
