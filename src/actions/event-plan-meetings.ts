"use server";

import {
  assertAuthenticated,
  assertEventPlanAccess,
  getCurrentSchoolId,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  eventPlanMeetings,
  eventPlanMeetingParticipants,
  eventPlanMeetingNotes,
  eventPlanMembers,
} from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import type { MeetingStatus, MeetingRsvpStatus } from "@/types";
import { revalidatePath } from "next/cache";

// ─── Meeting CRUD ───────────────────────────────────────────────────────────

// Helper to parse a date string (YYYY-MM-DD) as noon UTC to avoid timezone issues
function parseDateAsNoonUTC(dateStr: string): Date {
  // If it's already an ISO string with time, extract just the date part
  const datePart = dateStr.split("T")[0];
  // Create a date at noon UTC to ensure the date is preserved in all timezones
  return new Date(`${datePart}T12:00:00Z`);
}

export async function createMeeting(
  eventPlanId: string,
  data: {
    title: string;
    location: string;
    meetingRoom?: string; // Optional room name within the location
    meetingDate: string; // YYYY-MM-DD format
    startTime: string; // Display string like "7:00 PM"
    endTime?: string;
    topic: string;
    description?: string;
    agenda?: string;
  }
) {
  const user = await assertAuthenticated();
  await assertEventPlanAccess(user.id!, eventPlanId);

  const [meeting] = await db
    .insert(eventPlanMeetings)
    .values({
      eventPlanId,
      title: data.title,
      location: data.location,
      meetingRoom: data.meetingRoom || null,
      meetingDate: parseDateAsNoonUTC(data.meetingDate),
      startTime: data.startTime,
      endTime: data.endTime || null,
      topic: data.topic,
      description: data.description || null,
      agenda: data.agenda || null,
      createdBy: user.id!,
    })
    .returning();

  // Auto-add creator as participant (accepted)
  await db.insert(eventPlanMeetingParticipants).values({
    meetingId: meeting.id,
    userId: user.id!,
    rsvpStatus: "accepted",
  });

  revalidatePath(`/events/${eventPlanId}`);
  return meeting;
}

export async function updateMeeting(
  meetingId: string,
  data: {
    title?: string;
    location?: string;
    meetingRoom?: string;
    meetingDate?: string;
    startTime?: string;
    endTime?: string;
    topic?: string;
    description?: string;
    agenda?: string;
    status?: MeetingStatus;
  }
) {
  // Fetch meeting to get eventPlanId for auth check
  const meeting = await db.query.eventPlanMeetings.findFirst({
    where: eq(eventPlanMeetings.id, meetingId),
  });
  if (!meeting) throw new Error("Meeting not found");

  const user = await assertAuthenticated();
  await assertEventPlanAccess(user.id!, meeting.eventPlanId, ["lead"]);

  await db
    .update(eventPlanMeetings)
    .set({
      ...(data.title !== undefined && { title: data.title }),
      ...(data.location !== undefined && { location: data.location }),
      ...(data.meetingRoom !== undefined && {
        meetingRoom: data.meetingRoom || null,
      }),
      ...(data.meetingDate !== undefined && {
        meetingDate: parseDateAsNoonUTC(data.meetingDate),
      }),
      ...(data.startTime !== undefined && { startTime: data.startTime }),
      ...(data.endTime !== undefined && { endTime: data.endTime || null }),
      ...(data.topic !== undefined && { topic: data.topic }),
      ...(data.description !== undefined && {
        description: data.description || null,
      }),
      ...(data.agenda !== undefined && { agenda: data.agenda || null }),
      ...(data.status !== undefined && { status: data.status }),
      updatedAt: new Date(),
    })
    .where(eq(eventPlanMeetings.id, meetingId));

  revalidatePath(`/events/${meeting.eventPlanId}`);
}

export async function deleteMeeting(meetingId: string) {
  const meeting = await db.query.eventPlanMeetings.findFirst({
    where: eq(eventPlanMeetings.id, meetingId),
  });
  if (!meeting) throw new Error("Meeting not found");

  const user = await assertAuthenticated();
  await assertEventPlanAccess(user.id!, meeting.eventPlanId, ["lead"]);

  await db
    .delete(eventPlanMeetings)
    .where(eq(eventPlanMeetings.id, meetingId));

  revalidatePath(`/events/${meeting.eventPlanId}`);
}

// ─── Participant Management ─────────────────────────────────────────────────

export async function inviteParticipants(
  meetingId: string,
  userIds: string[]
) {
  const meeting = await db.query.eventPlanMeetings.findFirst({
    where: eq(eventPlanMeetings.id, meetingId),
  });
  if (!meeting) throw new Error("Meeting not found");

  const user = await assertAuthenticated();
  await assertEventPlanAccess(user.id!, meeting.eventPlanId);

  // Only invite users who are members of the event plan
  const eventMembers = await db.query.eventPlanMembers.findMany({
    where: eq(eventPlanMembers.eventPlanId, meeting.eventPlanId),
  });
  const memberUserIds = new Set(eventMembers.map((m) => m.userId));

  const validUserIds = userIds.filter((id) => memberUserIds.has(id));

  if (validUserIds.length > 0) {
    await db
      .insert(eventPlanMeetingParticipants)
      .values(
        validUserIds.map((userId) => ({
          meetingId,
          userId,
          rsvpStatus: "invited" as const,
        }))
      )
      .onConflictDoNothing(); // Skip if already invited
  }

  revalidatePath(`/events/${meeting.eventPlanId}`);
}

export async function updateMeetingRsvp(
  meetingId: string,
  rsvpStatus: MeetingRsvpStatus
) {
  const meeting = await db.query.eventPlanMeetings.findFirst({
    where: eq(eventPlanMeetings.id, meetingId),
  });
  if (!meeting) throw new Error("Meeting not found");

  const user = await assertAuthenticated();

  // User must be a participant - update their RSVP status
  await db
    .update(eventPlanMeetingParticipants)
    .set({ rsvpStatus })
    .where(
      and(
        eq(eventPlanMeetingParticipants.meetingId, meetingId),
        eq(eventPlanMeetingParticipants.userId, user.id!)
      )
    );

  revalidatePath(`/events/${meeting.eventPlanId}`);
}

export async function removeParticipant(meetingId: string, userId: string) {
  const meeting = await db.query.eventPlanMeetings.findFirst({
    where: eq(eventPlanMeetings.id, meetingId),
  });
  if (!meeting) throw new Error("Meeting not found");

  const user = await assertAuthenticated();
  await assertEventPlanAccess(user.id!, meeting.eventPlanId, ["lead"]);

  await db
    .delete(eventPlanMeetingParticipants)
    .where(
      and(
        eq(eventPlanMeetingParticipants.meetingId, meetingId),
        eq(eventPlanMeetingParticipants.userId, userId)
      )
    );

  revalidatePath(`/events/${meeting.eventPlanId}`);
}

// ─── Meeting Notes ──────────────────────────────────────────────────────────

export async function saveMeetingNotes(
  meetingId: string,
  data: {
    content: string; // HTML content
    summary?: string;
    actionItems?: string; // JSON stringified MeetingActionItem[]
    attendees?: string; // JSON stringified string[]
  }
) {
  const meeting = await db.query.eventPlanMeetings.findFirst({
    where: eq(eventPlanMeetings.id, meetingId),
  });
  if (!meeting) throw new Error("Meeting not found");

  const user = await assertAuthenticated();
  await assertEventPlanAccess(user.id!, meeting.eventPlanId);

  // Upsert — one set of notes per meeting
  const existing = await db.query.eventPlanMeetingNotes.findFirst({
    where: eq(eventPlanMeetingNotes.meetingId, meetingId),
  });

  if (existing) {
    await db
      .update(eventPlanMeetingNotes)
      .set({
        content: data.content,
        summary: data.summary || null,
        actionItems: data.actionItems || null,
        attendees: data.attendees || null,
        updatedAt: new Date(),
      })
      .where(eq(eventPlanMeetingNotes.id, existing.id));
  } else {
    await db.insert(eventPlanMeetingNotes).values({
      meetingId,
      content: data.content,
      summary: data.summary || null,
      actionItems: data.actionItems || null,
      attendees: data.attendees || null,
      recordedBy: user.id!,
    });
  }

  // Auto-set meeting status to completed if still scheduled or in_progress
  if (meeting.status === "scheduled" || meeting.status === "in_progress") {
    await db
      .update(eventPlanMeetings)
      .set({
        status: "completed",
        updatedAt: new Date(),
      })
      .where(eq(eventPlanMeetings.id, meetingId));
  }

  revalidatePath(`/events/${meeting.eventPlanId}`);
}

export async function getMeetingNotes(meetingId: string) {
  const meeting = await db.query.eventPlanMeetings.findFirst({
    where: eq(eventPlanMeetings.id, meetingId),
  });
  if (!meeting) throw new Error("Meeting not found");

  const user = await assertAuthenticated();
  await assertEventPlanAccess(user.id!, meeting.eventPlanId);

  const notes = await db.query.eventPlanMeetingNotes.findFirst({
    where: eq(eventPlanMeetingNotes.meetingId, meetingId),
  });

  return notes;
}

// ─── Whiteboard Transcription ────────────────────────────────────────────────

import {
  transcribeWhiteboardImage,
  organizeTranscribedContent,
  formatMeetingNotes,
  type OrganizedContent,
} from "@/lib/ai/whiteboard-transcription";
import { eventPlanMeetingImages } from "@/lib/db/schema";

export async function transcribeWhiteboard(
  meetingId: string,
  imageUrl: string,
  imageId?: string
) {
  const meeting = await db.query.eventPlanMeetings.findFirst({
    where: eq(eventPlanMeetings.id, meetingId),
  });
  if (!meeting) throw new Error("Meeting not found");

  const user = await assertAuthenticated();
  await assertEventPlanAccess(user.id!, meeting.eventPlanId);

  const result = await transcribeWhiteboardImage(imageUrl);

  // Save the raw transcription to the image record if we have an imageId
  if (imageId) {
    await db
      .update(eventPlanMeetingImages)
      .set({
        rawTranscription: result.rawText,
        confidence: result.confidence,
      })
      .where(eq(eventPlanMeetingImages.id, imageId));
  }

  return result;
}

export async function organizeTranscription(
  meetingId: string,
  rawText: string,
  imageId?: string
) {
  const meeting = await db.query.eventPlanMeetings.findFirst({
    where: eq(eventPlanMeetings.id, meetingId),
  });
  if (!meeting) throw new Error("Meeting not found");

  const user = await assertAuthenticated();
  await assertEventPlanAccess(user.id!, meeting.eventPlanId);

  const result = await organizeTranscribedContent(rawText, {
    meetingTitle: meeting.title,
    topic: meeting.topic,
    agenda: meeting.agenda ?? undefined,
  });

  // Save the organized content to the image record if we have an imageId
  if (imageId) {
    // Build HTML from sections
    const organizedHtml = result.sections
      .map((s) => `<h3>${s.heading}</h3>${s.content}`)
      .join("");

    await db
      .update(eventPlanMeetingImages)
      .set({
        correctedTranscription: rawText,
        organizedContent: organizedHtml,
      })
      .where(eq(eventPlanMeetingImages.id, imageId));
  }

  return result;
}

export async function formatMeetingNotesAction(
  meetingId: string,
  organizedContent: OrganizedContent
) {
  const meeting = await db.query.eventPlanMeetings.findFirst({
    where: eq(eventPlanMeetings.id, meetingId),
    with: {
      eventPlan: true,
      participants: {
        with: {
          user: true,
        },
      },
    },
  });
  if (!meeting) throw new Error("Meeting not found");

  const user = await assertAuthenticated();
  await assertEventPlanAccess(user.id!, meeting.eventPlanId);

  // Get attendee names from participants who accepted
  const attendees = meeting.participants
    .filter((p) => p.rsvpStatus === "accepted")
    .map((p) => p.user.name || p.user.email);

  const result = await formatMeetingNotes(organizedContent, {
    meetingTitle: meeting.title,
    topic: meeting.topic,
    meetingDate: meeting.meetingDate?.toISOString(),
    location: meeting.meetingRoom
      ? `${meeting.location} (${meeting.meetingRoom})`
      : meeting.location,
    attendees: attendees.length > 0 ? attendees : undefined,
    eventTitle: meeting.eventPlan?.title,
    agenda: meeting.agenda ?? undefined,
  });

  return result;
}

// ─── Google Docs Export ──────────────────────────────────────────────────────

import { Readable } from "stream";
import {
  getSchoolGoogleCredentials,
  getDriveClientWithWrite,
} from "@/lib/google";
import { schoolDriveIntegrations } from "@/lib/db/schema";
import type { MeetingActionItem } from "@/types";

export async function exportMeetingNotesToDrive(meetingId: string) {
  const meeting = await db.query.eventPlanMeetings.findFirst({
    where: eq(eventPlanMeetings.id, meetingId),
    with: {
      notes: true,
      eventPlan: true,
    },
  });
  if (!meeting) throw new Error("Meeting not found");
  if (!meeting.notes || meeting.notes.length === 0) {
    throw new Error("No notes to export");
  }

  const user = await assertAuthenticated();
  await assertEventPlanAccess(user.id!, meeting.eventPlanId, ["lead"]);

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  // Find the upload folder (folderType = "general" with active status)
  const uploadFolder = await db.query.schoolDriveIntegrations.findFirst({
    where: and(
      eq(schoolDriveIntegrations.schoolId, schoolId),
      eq(schoolDriveIntegrations.active, true)
    ),
  });
  if (!uploadFolder) {
    throw new Error(
      "No Google Drive folder configured. Set up a Drive integration in Admin > Integrations."
    );
  }

  const credentials = await getSchoolGoogleCredentials(schoolId);
  if (!credentials) {
    throw new Error("Google credentials not configured for this school");
  }

  const drive = getDriveClientWithWrite(credentials);
  const notes = meeting.notes[0];
  const eventTitle = meeting.eventPlan?.title ?? "Event";

  // Build HTML document for Google Docs import
  const meetingDateStr = meeting.meetingDate
    ? new Date(meeting.meetingDate).toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "Date TBD";

  const attendeesList = notes.attendees
    ? JSON.parse(notes.attendees).join(", ")
    : "Not recorded";

  const actionItemsHtml = notes.actionItems
    ? (JSON.parse(notes.actionItems) as (string | MeetingActionItem)[])
        .map((item) => {
          if (typeof item === "string") {
            return `<li>${item}</li>`;
          }
          let itemText = item.text;
          const assignee = item.assigneeName || item.assigneeId;
          if (assignee) {
            itemText += ` — <em>${assignee}</em>`;
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
          return `<li>${itemText}</li>`;
        })
        .join("")
    : "";

  const locationDisplay = meeting.meetingRoom
    ? `${meeting.location} (${meeting.meetingRoom})`
    : meeting.location;

  const htmlContent = `
    <html>
      <body>
        <h1>${eventTitle} — ${meeting.title}</h1>
        <p><strong>Date:</strong> ${meetingDateStr}</p>
        <p><strong>Time:</strong> ${meeting.startTime}${meeting.endTime ? ` – ${meeting.endTime}` : ""}</p>
        <p><strong>Location:</strong> ${locationDisplay}</p>
        <p><strong>Topic:</strong> ${meeting.topic}</p>
        <p><strong>Attendees:</strong> ${attendeesList}</p>
        ${meeting.agenda ? `<h2>Agenda</h2><p>${meeting.agenda}</p>` : ""}
        <h2>Meeting Notes</h2>
        ${notes.content}
        ${notes.summary ? `<h2>Summary</h2><p>${notes.summary}</p>` : ""}
        ${actionItemsHtml ? `<h2>Action Items</h2><ul>${actionItemsHtml}</ul>` : ""}
      </body>
    </html>
  `;

  // Upload as Google Doc (Drive API converts HTML to Google Docs format)
  const fileName = `${eventTitle} - ${meeting.title} Notes - ${meetingDateStr}`;

  let res;
  try {
    res = await drive.files.create({
      requestBody: {
        name: fileName,
        mimeType: "application/vnd.google-apps.document", // Tells Drive to convert
        parents: [uploadFolder.folderId],
      },
      media: {
        mimeType: "text/html", // Source format
        body: Readable.from(htmlContent), // Node stream from string
      },
      supportsAllDrives: true, // Support shared drives
      fields: "id, webViewLink",
    });

    // Try to transfer ownership to make the file not count against service account quota
    // This works when the folder is in a shared drive or when domain-wide delegation is set up
    try {
      await drive.permissions.create({
        fileId: res.data.id!,
        transferOwnership: true,
        supportsAllDrives: true,
        requestBody: {
          type: "anyone",
          role: "writer",
        },
      });
    } catch {
      // Ownership transfer may fail in some configurations - that's OK, file is still created
      console.log("Could not transfer file ownership (this is normal for most setups)");
    }
  } catch (error) {
    console.error("Google Drive upload error:", error);
    const message = error instanceof Error ? error.message : String(error);

    // Check for quota exceeded
    if (message.includes("quota") || message.includes("storage")) {
      throw new Error(
        `The service account's Google Drive storage is full. This happens because files created by the service account count against its 15GB quota. To fix this: (1) Go to Google Cloud Console > IAM > Service Accounts, (2) Find your service account, (3) Access its Drive at drive.google.com (sign in as the service account or use the API to list/delete old files). Alternatively, contact your Google Workspace admin to increase the service account's storage quota.`
      );
    }

    // Check for permission errors
    if (message.includes("Insufficient permissions") || message.includes("403")) {
      throw new Error(
        `Cannot upload to Google Drive folder. Please ensure the service account (${credentials.email}) has Editor access to the folder. Go to the folder in Google Drive, click Share, and add the service account email as an Editor.`
      );
    }

    throw new Error(`Failed to upload to Google Drive: ${message}`);
  }

  const googleDocUrl =
    res.data.webViewLink ??
    `https://docs.google.com/document/d/${res.data.id}`;

  // Save the Google Doc URL back to the meeting
  await db
    .update(eventPlanMeetings)
    .set({
      googleDocUrl,
      updatedAt: new Date(),
    })
    .where(eq(eventPlanMeetings.id, meetingId));

  revalidatePath(`/events/${meeting.eventPlanId}`);

  return { googleDocUrl };
}
