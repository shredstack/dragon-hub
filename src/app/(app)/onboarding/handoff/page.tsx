import { auth } from "@/lib/auth";
import {
  assertPtaBoard,
  getCurrentSchoolId,
  getSchoolMembership,
} from "@/lib/auth-helpers";
import { CURRENT_SCHOOL_YEAR, PTA_BOARD_POSITIONS } from "@/lib/constants";
import {
  getMyHandoffNote,
  getMyPositionHandoffNotes,
} from "@/actions/handoff-notes";
import { HandoffNoteForm } from "@/components/onboarding/handoff-note-form";
import { HandoffNotePreview } from "@/components/onboarding/handoff-note-preview";
import { FileText, ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { PtaBoardPosition } from "@/types";

export default async function HandoffPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  // Get user's board position
  const membership = await getSchoolMembership(session.user.id, schoolId);
  const position = membership?.boardPosition as PtaBoardPosition | undefined;
  const positionLabel = position ? PTA_BOARD_POSITIONS[position] : undefined;

  if (!position) {
    return (
      <div className="space-y-6">
        <Link
          href="/onboarding"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Onboarding
        </Link>
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-muted-foreground">
            You need a PTA board position to create handoff notes.
          </p>
        </div>
      </div>
    );
  }

  // Get user's own handoff note (for editing) and predecessor notes (for reading)
  const [myNote, predecessorNotes] = await Promise.all([
    getMyHandoffNote(),
    getMyPositionHandoffNotes(),
  ]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <Link
          href="/onboarding"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Onboarding
        </Link>
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-amber-500/10 p-2 text-amber-500">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Handoff Notes</h1>
            <p className="text-sm text-muted-foreground">
              {positionLabel} - {CURRENT_SCHOOL_YEAR}
            </p>
          </div>
        </div>
      </div>

      {/* Predecessor Notes (if any) */}
      {predecessorNotes.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">
            Notes from Previous {positionLabel}s
          </h2>
          <div className="space-y-4">
            {predecessorNotes.map((note) => (
              <HandoffNotePreview key={note.id} note={note} />
            ))}
          </div>
        </div>
      )}

      {/* My Handoff Note Form */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">
            {myNote ? "Edit Your Handoff Note" : "Create Your Handoff Note"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Leave notes for the next {positionLabel} to help them succeed in the
            role.
          </p>
        </div>
        <HandoffNoteForm
          initialData={
            myNote
              ? {
                  keyAccomplishments: myNote.keyAccomplishments ?? "",
                  ongoingProjects: myNote.ongoingProjects ?? "",
                  tipsAndAdvice: myNote.tipsAndAdvice ?? "",
                  importantContacts: myNote.importantContacts ?? "",
                  filesAndResources: myNote.filesAndResources ?? "",
                }
              : undefined
          }
        />
      </div>
    </div>
  );
}
