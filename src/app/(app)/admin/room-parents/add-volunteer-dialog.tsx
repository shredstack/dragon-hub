"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addVolunteerManually } from "@/actions/volunteer-signups";

interface Classroom {
  id: string;
  name: string;
  gradeLevel: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classroomId: string | null;
  classrooms: Classroom[];
  partyTypes: string[];
}

export function AddVolunteerDialog({
  open,
  onOpenChange,
  classroomId,
  classrooms,
  partyTypes,
}: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedClassroom, setSelectedClassroom] = useState(classroomId || "");
  const [role, setRole] = useState<"room_parent" | "party_volunteer">("room_parent");
  const [selectedPartyTypes, setSelectedPartyTypes] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setName("");
      setEmail("");
      setPhone("");
      setSelectedClassroom(classroomId || "");
      setRole("room_parent");
      setSelectedPartyTypes([]);
      setNotes("");
      setError(null);
    }
  }, [open, classroomId]);

  const togglePartyType = (type: string) => {
    setSelectedPartyTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !selectedClassroom) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await addVolunteerManually({
        name,
        email,
        phone: phone || undefined,
        classroomSignups: [
          {
            classroomId: selectedClassroom,
            role,
            partyTypes: role === "party_volunteer" ? selectedPartyTypes : undefined,
          },
        ],
        notes: notes || undefined,
      });

      if (result.success) {
        onOpenChange(false);
      } else {
        const errors = result.results
          .filter((r) => !r.success)
          .map((r) => r.error)
          .join(", ");
        setError(errors || "Failed to add volunteer");
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Volunteer Manually</DialogTitle>
          <DialogDescription>
            Add a volunteer who missed Back to School Night or signed up on paper.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Smith"
              required
            />
          </div>

          <div>
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
              required
            />
          </div>

          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 123-4567"
            />
          </div>

          <div>
            <Label htmlFor="classroom">Classroom *</Label>
            <Select
              value={selectedClassroom}
              onValueChange={setSelectedClassroom}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select classroom" />
              </SelectTrigger>
              <SelectContent>
                {classrooms.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} {c.gradeLevel && `(${c.gradeLevel})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="role">Role *</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as "room_parent" | "party_volunteer")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="room_parent">Room Parent</SelectItem>
                <SelectItem value="party_volunteer">Party Volunteer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {role === "party_volunteer" && (
            <div>
              <Label>Party Types</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {partyTypes.map((type) => (
                  <label
                    key={type}
                    className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selectedPartyTypes.includes(type)}
                      onChange={() => togglePartyType(type)}
                    />
                    <span className="capitalize">{type}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="notes">Notes (optional)</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Signed up on paper at BTSN"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !name || !email || !selectedClassroom}
            >
              {isSubmitting ? "Adding..." : "Add Volunteer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
