"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addRoomParent, updateRoomParent, removeRoomParent } from "@/actions/classrooms";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Mail, Phone, Pencil, Trash2, UserPlus, PartyPopper } from "lucide-react";

interface RoomParentData {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: "member" | "legacy" | "signup";
}

interface PartyVolunteerData {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  partyTypes: string[];
}

interface VolunteersSectionProps {
  classroomId: string;
  roomParents: RoomParentData[];
  partyVolunteers: PartyVolunteerData[];
  canManage: boolean;
}

export function VolunteersSection({
  classroomId,
  roomParents,
  partyVolunteers,
  canManage,
}: VolunteersSectionProps) {
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
    if (!editingParent || editingParent.source !== "legacy") return;
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

  async function handleRemove(id: string, source: "member" | "legacy" | "signup") {
    if (source === "member") {
      alert("This room parent is a classroom member. To change their role, edit the classroom roster.");
      return;
    }
    if (source === "signup") {
      // For signup-based room parents, need to use different action
      // For now, show message to manage via admin dashboard
      alert("Volunteers from the signup system can be managed in the Room Parent VP dashboard.");
      return;
    }
    await removeRoomParent(id);
    router.refresh();
  }

  // Group party volunteers by party type
  const partyTypeGroups: Record<string, PartyVolunteerData[]> = {};
  partyVolunteers.forEach((pv) => {
    pv.partyTypes.forEach((type) => {
      if (!partyTypeGroups[type]) partyTypeGroups[type] = [];
      partyTypeGroups[type].push(pv);
    });
  });

  return (
    <div className="space-y-6">
      {/* Room Parents Section */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Room Parents</h3>
          {canManage && (
            <Button onClick={() => setShowAddDialog(true)} size="sm" variant="outline">
              <UserPlus className="mr-2 h-4 w-4" />
              Add
            </Button>
          )}
        </div>

        {roomParents.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            No room parents assigned yet.
          </p>
        ) : (
          <div className="space-y-2">
            {roomParents.map((rp) => (
              <div
                key={rp.id}
                className="flex items-center justify-between rounded-md border border-border bg-card p-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{rp.name}</p>
                    {rp.source === "member" && (
                      <Badge variant="default" className="text-xs">
                        Member
                      </Badge>
                    )}
                    {rp.source === "signup" && (
                      <Badge variant="secondary" className="text-xs">
                        Signup
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {rp.email && (
                      <a
                        href={`mailto:${rp.email}`}
                        className="flex items-center gap-1 hover:text-foreground"
                      >
                        <Mail className="h-3 w-3" />
                        {rp.email}
                      </a>
                    )}
                    {rp.phone && (
                      <a
                        href={`tel:${rp.phone}`}
                        className="flex items-center gap-1 hover:text-foreground"
                      >
                        <Phone className="h-3 w-3" />
                        {rp.phone}
                      </a>
                    )}
                  </div>
                </div>
                {canManage && rp.source === "legacy" && (
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
                      onClick={() => handleRemove(rp.id, rp.source)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Party Volunteers Section */}
      {Object.keys(partyTypeGroups).length > 0 && (
        <div>
          <h3 className="mb-3 font-semibold">Party Volunteers</h3>
          <div className="space-y-4">
            {Object.entries(partyTypeGroups).map(([type, volunteers]) => (
              <div key={type}>
                <div className="mb-2 flex items-center gap-2">
                  <PartyPopper className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium capitalize">{type}</span>
                  <Badge variant="secondary">{volunteers.length}</Badge>
                </div>
                <div className="space-y-2">
                  {volunteers.map((pv) => (
                    <div
                      key={pv.id}
                      className="flex items-center justify-between rounded-md border border-border bg-card/50 p-2"
                    >
                      <div className="flex flex-wrap items-center gap-3 text-sm">
                        <span className="font-medium">{pv.name}</span>
                        {pv.email && (
                          <a
                            href={`mailto:${pv.email}`}
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <Mail className="h-3 w-3" />
                            {pv.email}
                          </a>
                        )}
                        {pv.phone && (
                          <a
                            href={`tel:${pv.phone}`}
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <Phone className="h-3 w-3" />
                            {pv.phone}
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No volunteers message */}
      {roomParents.length === 0 && partyVolunteers.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Share the volunteer signup QR code to get room parents and party volunteers for this classroom.
        </p>
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
          <RoomParentForm
            onSubmit={handleAdd}
            loading={loading}
            onCancel={() => setShowAddDialog(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog
        open={!!editingParent}
        onOpenChange={(open) => !open && setEditingParent(null)}
      >
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
