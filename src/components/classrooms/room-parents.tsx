"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addRoomParent, updateRoomParent, removeRoomParent } from "@/actions/classrooms";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Mail, Phone, Pencil, Trash2, UserPlus } from "lucide-react";

interface RoomParentData {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

interface RoomParentsProps {
  classroomId: string;
  roomParents: RoomParentData[];
  canManage: boolean;
}

export function RoomParents({ classroomId, roomParents, canManage }: RoomParentsProps) {
  const router = useRouter();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingParent, setEditingParent] = useState<RoomParentData | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    await addRoomParent(classroomId, {
      name: formData.get("name") as string,
      email: (formData.get("email") as string) || undefined,
      phone: (formData.get("phone") as string) || undefined,
    });

    setLoading(false);
    setShowAddDialog(false);
    router.refresh();
  }

  async function handleEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingParent) return;
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    await updateRoomParent(editingParent.id, {
      name: formData.get("name") as string,
      email: (formData.get("email") as string) || undefined,
      phone: (formData.get("phone") as string) || undefined,
    });

    setLoading(false);
    setEditingParent(null);
    router.refresh();
  }

  async function handleRemove(id: string) {
    await removeRoomParent(id);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button onClick={() => setShowAddDialog(true)} size="sm">
            <UserPlus className="mr-2 h-4 w-4" />
            Add Room Parent
          </Button>
        </div>
      )}

      {roomParents.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No room parents added yet.
        </p>
      ) : (
        <div className="space-y-2">
          {roomParents.map((rp) => (
            <div
              key={rp.id}
              className="flex items-center justify-between rounded-md border border-border bg-card p-3"
            >
              <div className="space-y-1">
                <p className="text-sm font-medium">{rp.name}</p>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {rp.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {rp.email}
                    </span>
                  )}
                  {rp.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {rp.phone}
                    </span>
                  )}
                </div>
              </div>
              {canManage && (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingParent(rp)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemove(rp.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Room Parent</DialogTitle>
            <DialogDescription>
              Add a room parent contact. Email and phone are optional.
            </DialogDescription>
          </DialogHeader>
          <RoomParentForm onSubmit={handleAdd} loading={loading} onCancel={() => setShowAddDialog(false)} />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingParent} onOpenChange={(open) => !open && setEditingParent(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Room Parent</DialogTitle>
            <DialogDescription>
              Update room parent contact information.
            </DialogDescription>
          </DialogHeader>
          {editingParent && (
            <RoomParentForm
              onSubmit={handleEdit}
              loading={loading}
              onCancel={() => setEditingParent(null)}
              defaultValues={editingParent}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RoomParentForm({
  onSubmit,
  loading,
  onCancel,
  defaultValues,
}: {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  loading: boolean;
  onCancel: () => void;
  defaultValues?: { name: string; email: string | null; phone: string | null };
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium">Name</label>
        <input
          name="name"
          required
          defaultValue={defaultValues?.name}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Email</label>
        <input
          name="email"
          type="email"
          defaultValue={defaultValues?.email ?? ""}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Phone</label>
        <input
          name="phone"
          type="tel"
          defaultValue={defaultValues?.phone ?? ""}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  );
}
