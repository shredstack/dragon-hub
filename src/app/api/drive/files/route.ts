import { NextResponse } from "next/server";
import { assertAuthenticated } from "@/lib/auth-helpers";
import { listDriveFiles } from "@/lib/drive";

export async function GET() {
  try {
    await assertAuthenticated();
    const files = await listDriveFiles();
    return NextResponse.json({ files });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list files";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
