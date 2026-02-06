import { NextResponse } from "next/server";
import { assertAuthenticated, getCurrentSchoolId } from "@/lib/auth-helpers";
import { listAllDriveFiles } from "@/lib/drive";

export async function GET() {
  try {
    await assertAuthenticated();
    const schoolId = await getCurrentSchoolId();
    const files = await listAllDriveFiles(schoolId ?? undefined);
    return NextResponse.json({ files });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list files";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
