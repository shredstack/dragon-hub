"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  promoteRoomParentFromWaitlist,
  removeVolunteerSignup,
  updateVolunteerSignup,
} from "@/actions/volunteer-signups";
import { WaitlistPanel } from "@/components/volunteer/waitlist-panel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  formatPhoneInput,
  formatPhoneNumber,
  isValidEmail,
  isValidPhoneNumber,
} from "@/lib/utils";

interface VolunteerSignup {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: "room_parent" | "party_volunteer";
  partyTypes: string[] | null;
  signupSource: "qr_code" | "manual";
  createdAt: Date | null;
}

/** A room parent signup that's waiting for a spot rather than holding one. */
export interface WaitlistedVolunteer extends VolunteerSignup {
  position: number;
}

interface Props {
  classroomId: string;
  classroomName: string;
  roomParents: VolunteerSignup[];
  partyVolunteers: VolunteerSignup[];
  /** In promotion order. Empty when the room isn't full or nobody is waiting. */
  roomParentWaitlist?: WaitlistedVolunteer[];
  partyTypes: string[];
  onAddVolunteer: () => void;
}

export function VolunteerDetails({
  classroomName,
  roomParents,
  partyVolunteers,
  roomParentWaitlist = [],
  onAddVolunteer,
}: Props) {
  const [editingVolunteer, setEditingVolunteer] = useState<VolunteerSignup | null>(null);
  const [removingVolunteer, setRemovingVolunteer] = useState<VolunteerSignup | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const handleEditOpen = (volunteer: VolunteerSignup) => {
    setEditingVolunteer(volunteer);
    setEditName(volunteer.name);
    setEditEmail(volunteer.email);
    setEditPhone(formatPhoneNumber(volunteer.phone));
    setEditError(null);
  };

  const handleEditSave = async () => {
    if (!editingVolunteer) return;

    if (!isValidEmail(editEmail)) {
      setEditError("Enter a valid email address, e.g. jane@example.com");
      return;
    }
    if (editPhone && !isValidPhoneNumber(editPhone)) {
      setEditError("Enter a 10-digit phone number, e.g. (555) 123-4567");
      return;
    }

    setIsSaving(true);
    setEditError(null);
    try {
      await updateVolunteerSignup(editingVolunteer.id, {
        name: editName,
        email: editEmail,
        phone: editPhone,
      });
      setEditingVolunteer(null);
    } catch (error) {
      console.error("Failed to update volunteer:", error);
      setEditError("Could not save changes. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!removingVolunteer) return;
    setIsRemoving(true);
    try {
      await removeVolunteerSignup(removingVolunteer.id);
      setRemovingVolunteer(null);
    } catch (error) {
      console.error("Failed to remove volunteer:", error);
    } finally {
      setIsRemoving(false);
    }
  };

  const VolunteerCard = ({ volunteer }: { volunteer: VolunteerSignup }) => (
    <div className="flex items-start justify-between rounded-lg border border-border bg-card p-3">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-medium">{volunteer.name}</span>
          <Badge variant="secondary" className="text-xs">
            {volunteer.signupSource === "qr_code" ? "QR" : "Manual"}
          </Badge>
        </div>
        <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
          <div>{volunteer.email}</div>
          {volunteer.phone && <div>{formatPhoneNumber(volunteer.phone)}</div>}
          {volunteer.partyTypes && volunteer.partyTypes.length > 0 && (
            <div className="capitalize">
              Parties: {volunteer.partyTypes.join(", ")}
            </div>
          )}
        </div>
      </div>
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => handleEditOpen(volunteer)}
        >
          Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-red-600 hover:text-red-700"
          onClick={() => setRemovingVolunteer(volunteer)}
        >
          Remove
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Room Parents */}
      <div>
        <h4 className="mb-2 font-medium">Room Parents</h4>
        {roomParents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No room parents assigned yet.</p>
        ) : (
          <div className="space-y-2">
            {roomParents.map((rp) => (
              <VolunteerCard key={rp.id} volunteer={rp} />
            ))}
          </div>
        )}
      </div>

      {/* Room parents waiting for a spot. Vacancies promote #1 automatically —
          this is here for promoting out of order, and so the board can see that
          a "full" room actually has people behind it. */}
      <WaitlistPanel
        entries={roomParentWaitlist.map((w) => ({
          id: w.id,
          name: w.name,
          email: w.email,
          phone: formatPhoneNumber(w.phone) || null,
          position: w.position,
        }))}
        heading="Waiting to be a room parent"
        where={classroomName}
        onPromote={(person) => promoteRoomParentFromWaitlist(person.id)}
        onRemove={(person) => removeVolunteerSignup(person.id)}
      />

      {/* Party Volunteers */}
      <div>
        <h4 className="mb-2 font-medium">Party Volunteers</h4>
        {partyVolunteers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No party volunteers signed up yet.</p>
        ) : (
          <div className="space-y-2">
            {partyVolunteers.map((pv) => (
              <VolunteerCard key={pv.id} volunteer={pv} />
            ))}
          </div>
        )}
      </div>

      <Button size="sm" onClick={onAddVolunteer}>
        Add Volunteer to {classroomName}
      </Button>

      {/* Edit Dialog */}
      <Dialog open={!!editingVolunteer} onOpenChange={() => setEditingVolunteer(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Volunteer</DialogTitle>
            <DialogDescription>
              Update volunteer contact information.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="edit-phone">Phone</Label>
              <Input
                id="edit-phone"
                type="tel"
                value={editPhone}
                onChange={(e) => setEditPhone(formatPhoneInput(e.target.value))}
              />
            </div>
            {editError && (
              <p className="text-sm text-red-600">{editError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingVolunteer(null)}>
              Cancel
            </Button>
            <Button onClick={handleEditSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation Dialog */}
      <Dialog open={!!removingVolunteer} onOpenChange={() => setRemovingVolunteer(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Volunteer?</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove {removingVolunteer?.name}?
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
            <p className="text-amber-800">
              <strong>This will:</strong>
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-amber-700">
              {removingVolunteer?.role === "room_parent" && (
                <>
                  <li>Free up room parent spot for this classroom</li>
                  <li>Remove their access to private room parent message boards</li>
                </>
              )}
              <li>Remove them from the volunteer list</li>
              <li>They will need to contact you to re-volunteer</li>
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemovingVolunteer(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemove}
              disabled={isRemoving}
            >
              {isRemoving ? "Removing..." : "Remove Volunteer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
