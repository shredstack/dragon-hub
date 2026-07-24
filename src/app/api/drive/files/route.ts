import { NextResponse } from "next/server";
import {
  assertAuthenticated,
  getCurrentSchoolId,
  isPtaBoardMember,
} from "@/lib/auth-helpers";
import { listAllDriveFiles } from "@/lib/drive";

export async function GET() {
  try {
    const user = await assertAuthenticated();
    const schoolId = await getCurrentSchoolId();
    if (!schoolId) {
      return NextResponse.json(
        { error: "No school selected", files: [] },
        { status: 200 }
      );
    }

    // The connected Drive is the board's filing cabinet — minutes, budgets,
    // vendor contracts. /knowledge/documents is board-only for the same reason,
    // and this endpoint is the same data without the page around it.
    if (!(await isPtaBoardMember(user.id!, schoolId))) {
      return NextResponse.json(
        { error: "Unauthorized: PTA Board access required" },
        { status: 403 }
      );
    }
    const files = await listAllDriveFiles(schoolId);
    return NextResponse.json({ files });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list files";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
