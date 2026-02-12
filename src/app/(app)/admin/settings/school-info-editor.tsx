"use client";

import { useState, useTransition } from "react";
import { Pencil, Loader2, Check, X } from "lucide-react";
import { updateSchoolInfo } from "@/actions/school-membership";
import { US_STATES } from "@/lib/constants";
import { DistrictSelect } from "@/components/ui/district-select";

interface SchoolInfoEditorProps {
  schoolId: string;
  initialData: {
    name: string;
    mascot: string | null;
    address: string | null;
    state: string | null;
    district: string | null;
  };
}

export function SchoolInfoEditor({ schoolId, initialData }: SchoolInfoEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState(initialData.name);
  const [mascot, setMascot] = useState(initialData.mascot || "");
  const [address, setAddress] = useState(initialData.address || "");
  const [state, setState] = useState(initialData.state || "");
  const [district, setDistrict] = useState(initialData.district || "");

  // Reset district when state changes
  const handleStateChange = (newState: string) => {
    setState(newState);
    if (newState !== initialData.state) {
      setDistrict("");
    }
  };

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      try {
        await updateSchoolInfo(schoolId, {
          name,
          mascot: mascot || null,
          address: address || null,
          state: state || null,
          district: district || null,
        });
        setIsEditing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update school info");
      }
    });
  };

  const handleCancel = () => {
    // Reset to initial values
    setName(initialData.name);
    setMascot(initialData.mascot || "");
    setAddress(initialData.address || "");
    setState(initialData.state || "");
    setDistrict(initialData.district || "");
    setError(null);
    setIsEditing(false);
  };

  if (!isEditing) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold">School Information</h2>
          <button
            onClick={() => setIsEditing(true)}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>
        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="text-muted-foreground">School Name</dt>
            <dd className="font-medium">{name}</dd>
          </div>
          {mascot && (
            <div>
              <dt className="text-muted-foreground">Mascot</dt>
              <dd className="font-medium">{mascot}</dd>
            </div>
          )}
          {address && (
            <div>
              <dt className="text-muted-foreground">Address</dt>
              <dd className="font-medium">{address}</dd>
            </div>
          )}
          {state && (
            <div>
              <dt className="text-muted-foreground">State</dt>
              <dd className="font-medium">{state}</dd>
            </div>
          )}
          {district && (
            <div>
              <dt className="text-muted-foreground">District</dt>
              <dd className="font-medium">{district}</dd>
            </div>
          )}
          {!mascot && !address && !state && !district && (
            <p className="text-muted-foreground italic">
              Click edit to add more school details.
            </p>
          )}
        </dl>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-start justify-between">
        <h2 className="text-lg font-semibold">Edit School Information</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={handleSave}
            disabled={isPending || !name.trim()}
            className="rounded p-1.5 text-green-500 hover:bg-green-500/10 disabled:opacity-50"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={handleCancel}
            disabled={isPending}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-500">
          {error}
        </div>
      )}

      <div className="mt-4 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">
            School Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            placeholder="Enter school name"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Mascot</label>
          <input
            type="text"
            value={mascot}
            onChange={(e) => setMascot(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            placeholder="e.g., Dragons, Eagles, Lions"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Address</label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            placeholder="School street address"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">State</label>
            <select
              value={state}
              onChange={(e) => handleStateChange(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Select a state...</option>
              {Object.entries(US_STATES).map(([code, name]) => (
                <option key={code} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              Used for state-level PTA resources
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">District</label>
            <DistrictSelect
              stateName={state}
              value={district}
              onChange={setDistrict}
              placeholder="Search or select a district..."
              allowCustom={true}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Used for district-level PTA resources
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
