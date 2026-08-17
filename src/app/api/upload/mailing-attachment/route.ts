import { put, del } from "@vercel/blob";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { mailingAttachments, mailings } from "@/lib/db/schema";
import { getCurrentSchoolId, isPtaBoardMember } from "@/lib/auth-helpers";

const MAX_FILE_SIZE = 25 * 1024 * 1024;

/**
 * A file to attach to every group's email in a mailing.
 *
 * Unlike `upload/document`, this is *not* indexed and not searchable — it is a
 * handbook PDF or a party sign-up sheet that a board member will drag into
 * Gmail, and putting it into the school's document index would file a transient
 * attachment alongside the Knowledge Base. It is stored, downloaded, and
 * deleted with the mailing.
 *
 * No file type restriction beyond the size cap: an attachment is whatever the
 * board wants to send, and nothing here parses it.
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const schoolId = await getCurrentSchoolId();
    if (!schoolId) {
      return NextResponse.json({ error: "No school selected" }, { status: 400 });
    }
    if (!(await isPtaBoardMember(session.user.id, schoolId))) {
      return NextResponse.json(
        { error: "Unauthorized: PTA Board access required" },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const mailingId = (formData.get("mailingId") as string | null) || null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!mailingId) {
      return NextResponse.json({ error: "No mailing provided" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 25MB." },
        { status: 400 }
      );
    }

    const mailing = await db.query.mailings.findFirst({
      where: and(eq(mailings.id, mailingId), eq(mailings.schoolId, schoolId)),
      columns: { id: true },
    });
    if (!mailing) {
      return NextResponse.json({ error: "Mailing not found" }, { status: 404 });
    }

    const blob = await put(
      `mailings/${schoolId}/${mailingId}/${file.name}`,
      file,
      { access: "public", addRandomSuffix: true }
    );

    const [created] = await db
      .insert(mailingAttachments)
      .values({
        mailingId,
        fileName: file.name,
        blobUrl: blob.url,
        fileSize: file.size,
        contentType: file.type || null,
        uploadedBy: session.user.id,
      })
      .returning();

    revalidatePath(`/admin/mailings/${mailingId}`);
    return NextResponse.json({ attachment: created });
  } catch (error) {
    console.error("Mailing attachment upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload attachment" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const schoolId = await getCurrentSchoolId();
    if (!schoolId) {
      return NextResponse.json({ error: "No school selected" }, { status: 400 });
    }
    if (!(await isPtaBoardMember(session.user.id, schoolId))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const attachmentId = new URL(request.url).searchParams.get("attachmentId");
    if (!attachmentId) {
      return NextResponse.json({ error: "No attachment ID" }, { status: 400 });
    }

    // Join through the mailing so the school check is on the row that carries
    // one — an attachment id alone says nothing about who owns it.
    const [row] = await db
      .select({
        id: mailingAttachments.id,
        blobUrl: mailingAttachments.blobUrl,
        mailingId: mailingAttachments.mailingId,
      })
      .from(mailingAttachments)
      .innerJoin(mailings, eq(mailingAttachments.mailingId, mailings.id))
      .where(
        and(
          eq(mailingAttachments.id, attachmentId),
          eq(mailings.schoolId, schoolId)
        )
      );
    if (!row) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    if (row.blobUrl.includes("blob.vercel-storage.com")) {
      try {
        await del(row.blobUrl);
      } catch {
        // Blob already gone — still remove the row.
      }
    }

    await db
      .delete(mailingAttachments)
      .where(eq(mailingAttachments.id, attachmentId));

    revalidatePath(`/admin/mailings/${row.mailingId}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Mailing attachment delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete attachment" },
      { status: 500 }
    );
  }
}
