"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Archive, Edit, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  getAgendaById,
  updateAgenda,
  deleteAgenda,
  archiveAgenda,
} from "@/actions/minutes";
import { ArticleRenderer } from "@/components/knowledge/article-renderer";

type Agenda = Awaited<ReturnType<typeof getAgendaById>>;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function AgendaDetailPage() {
  const router = useRouter();
  const params = useParams();
  const agendaId = params.id as string;

  const [agenda, setAgenda] = useState<Agenda | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { confirm, confirmDialog, closeConfirm } = useConfirm();
  const [editedContent, setEditedContent] = useState("");
  const [editedTitle, setEditedTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAgenda();
  }, [agendaId]);

  async function loadAgenda() {
    try {
      const result = await getAgendaById(agendaId);
      if (!result) {
        router.push("/minutes/agenda");
        return;
      }
      setAgenda(result);
      setEditedContent(result.content);
      setEditedTitle(result.title);
    } catch (err) {
      console.error("Failed to load agenda:", err);
      setError("Failed to load agenda");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    try {
      await updateAgenda(agendaId, {
        title: editedTitle,
        content: editedContent,
      });
      setAgenda((prev) =>
        prev
          ? { ...prev, title: editedTitle, content: editedContent }
          : null
      );
      setEditing(false);
    } catch (err) {
      console.error("Failed to save agenda:", err);
      setError("Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    const ok = await confirm({
      title: "Archive this agenda?",
      description:
        "It comes off the agenda list but stays in the database as the plan of record for that meeting. You can restore it later.",
      confirmLabel: "Archive agenda",
      tone: "default",
    });
    if (!ok) return;

    setDeleting(true);
    setError(null);
    try {
      await archiveAgenda(agendaId);
      router.push("/minutes/agenda");
    } catch (err) {
      console.error("Failed to archive agenda:", err);
      setError("Failed to archive agenda");
      setDeleting(false);
    } finally {
      closeConfirm();
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: "Delete this agenda?",
      description:
        "This is permanent. If the meeting actually happened, archive it instead so the agenda stays on the record.",
      confirmLabel: "Delete agenda",
    });
    if (!ok) return;

    setDeleting(true);
    setError(null);

    try {
      await deleteAgenda(agendaId);
      router.push("/minutes/agenda");
    } catch (err) {
      console.error("Failed to delete agenda:", err);
      setError("Failed to delete agenda");
      setDeleting(false);
    } finally {
      closeConfirm();
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!agenda) {
    return null;
  }

  const monthName = MONTHS[agenda.targetMonth - 1];

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/minutes/agenda"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Agendas
      </Link>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive bg-destructive/10 p-4 text-destructive">
          {error}
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {editing ? (
            <input
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              className="mb-2 w-full rounded-md border border-input bg-background px-3 py-2 text-2xl font-bold outline-none focus:ring-2 focus:ring-ring"
            />
          ) : (
            <h1 className="text-2xl font-bold">{agenda.title}</h1>
          )}
          <p className="text-muted-foreground">
            {monthName} {agenda.targetYear}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {agenda.creator?.name && `Created by ${agenda.creator.name} · `}
            {agenda.createdAt && new Date(agenda.createdAt).toLocaleDateString()}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setEditing(false);
                  setEditedContent(agenda.content);
                  setEditedTitle(agenda.title);
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
              {/* Archiving is the softer default for an agenda whose meeting
                  actually happened — it stays the plan of record. */}
              <Button
                variant="outline"
                onClick={handleArchive}
                disabled={deleting}
              >
                <Archive className="mr-2 h-4 w-4" />
                Archive
              </Button>
              <Button
                variant="outline"
                onClick={handleDelete}
                disabled={deleting}
                className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="rounded-lg border border-border bg-card p-6">
        {editing ? (
          <textarea
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            rows={25}
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        ) : (
          <ArticleRenderer content={agenda.content} />
        )}
      </div>

      {/* AI Generated Info */}
      {agenda.aiGeneratedContent && (
        <div className="mt-4 rounded-lg border border-border bg-muted/50 p-4">
          <p className="text-sm text-muted-foreground">
            This agenda was generated using AI based on historical meeting patterns.
          </p>
        </div>
      )}

      {confirmDialog}
    </div>
  );
}
