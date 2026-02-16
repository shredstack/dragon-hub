"use client";

import { useState } from "react";
import {
  expirePreviousYearMemberships,
  generateNewYearJoinCode,
  bulkRenewMemberships,
  updateCurrentSchoolYear,
  addNextSchoolYear,
  removeAvailableSchoolYear,
} from "@/actions/school-year";
import { useRouter } from "next/navigation";

interface Member {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  role: string;
  alreadyRenewed: boolean;
}

interface SchoolYearManagerProps {
  currentSchoolYear: string;
  nextSchoolYear: string;
  currentJoinCode: string;
  availableYears: string[];
  members: Member[];
  transitionStarted: boolean;
  previousYearPending: number;
}

export function SchoolYearManager({
  currentSchoolYear,
  nextSchoolYear,
  availableYears,
  members,
  transitionStarted,
  previousYearPending,
}: SchoolYearManagerProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const eligibleMembers = members.filter((m) => !m.alreadyRenewed);
  const renewedCount = members.filter((m) => m.alreadyRenewed).length;

  const handleSelectAll = () => {
    if (selectedMembers.size === eligibleMembers.length) {
      setSelectedMembers(new Set());
    } else {
      setSelectedMembers(new Set(eligibleMembers.map((m) => m.id)));
    }
  };

  const handleToggleMember = (id: string) => {
    const newSet = new Set(selectedMembers);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedMembers(newSet);
  };

  const handleExpirePrevious = async () => {
    if (!confirm("This will expire all memberships from previous school years. Continue?")) {
      return;
    }
    setLoading("expire");
    setMessage(null);
    try {
      await expirePreviousYearMemberships();
      setMessage({ type: "success", text: "Previous year memberships expired successfully." });
      router.refresh();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to expire memberships" });
    } finally {
      setLoading(null);
    }
  };

  const handleGenerateCode = async () => {
    if (!confirm(`This will generate a new join code for ${nextSchoolYear}. The current code will be replaced. Continue?`)) {
      return;
    }
    setLoading("generate");
    setMessage(null);
    try {
      const result = await generateNewYearJoinCode();
      setMessage({ type: "success", text: `New join code generated: ${result.joinCode}` });
      router.refresh();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to generate code" });
    } finally {
      setLoading(null);
    }
  };

  const handleBulkRenew = async () => {
    if (selectedMembers.size === 0) {
      setMessage({ type: "error", text: "Please select members to renew" });
      return;
    }
    if (!confirm(`Renew ${selectedMembers.size} member(s) for ${nextSchoolYear}?`)) {
      return;
    }
    setLoading("renew");
    setMessage(null);
    try {
      const result = await bulkRenewMemberships(Array.from(selectedMembers));
      setMessage({ type: "success", text: `${result.renewed} member(s) renewed for ${nextSchoolYear}` });
      setSelectedMembers(new Set());
      router.refresh();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to renew memberships" });
    } finally {
      setLoading(null);
    }
  };

  const handleChangeCurrentYear = async (year: string) => {
    if (year === currentSchoolYear) return;

    setLoading("changeYear");
    setMessage(null);
    try {
      await updateCurrentSchoolYear(year);
      setMessage({ type: "success", text: `Current school year changed to ${year}` });
      router.refresh();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to update school year" });
    } finally {
      setLoading(null);
    }
  };

  const handleAddNextYear = async () => {
    setLoading("addYear");
    setMessage(null);
    try {
      const result = await addNextSchoolYear();
      setMessage({ type: "success", text: `Added ${nextSchoolYear} to available years` });
      router.refresh();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to add school year" });
    } finally {
      setLoading(null);
    }
  };

  const handleRemoveYear = async (year: string) => {
    if (!confirm(`Remove ${year} from available school years?`)) {
      return;
    }
    setLoading(`remove-${year}`);
    setMessage(null);
    try {
      await removeAvailableSchoolYear(year);
      setMessage({ type: "success", text: `Removed ${year} from available years` });
      router.refresh();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to remove school year" });
    } finally {
      setLoading(null);
    }
  };

  const canAddNextYear = !availableYears.includes(nextSchoolYear);

  return (
    <div className="space-y-8">
      {message && (
        <div
          className={`rounded-lg p-4 ${
            message.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* School Year Configuration */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">School Year Configuration</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure which school years are available and set the current active year.
        </p>

        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          {/* Current School Year */}
          <div>
            <label className="block text-sm font-medium mb-2">Current School Year</label>
            <select
              value={currentSchoolYear}
              onChange={(e) => handleChangeCurrentYear(e.target.value)}
              disabled={loading === "changeYear"}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            >
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              This is the default year for new classrooms, events, and memberships.
            </p>
          </div>

          {/* Available School Years */}
          <div>
            <label className="block text-sm font-medium mb-2">Available School Years</label>
            <div className="space-y-2">
              {availableYears.map((year) => (
                <div
                  key={year}
                  className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2"
                >
                  <span className="text-sm">
                    {year}
                    {year === currentSchoolYear && (
                      <span className="ml-2 text-xs text-muted-foreground">(current)</span>
                    )}
                  </span>
                  <button
                    onClick={() => handleRemoveYear(year)}
                    disabled={year === currentSchoolYear || loading === `remove-${year}`}
                    className="text-sm text-red-600 hover:text-red-800 disabled:opacity-30 disabled:cursor-not-allowed"
                    title={year === currentSchoolYear ? "Cannot remove current year" : "Remove year"}
                  >
                    {loading === `remove-${year}` ? "..." : "Remove"}
                  </button>
                </div>
              ))}
            </div>
            {canAddNextYear && (
              <button
                onClick={handleAddNextYear}
                disabled={loading === "addYear"}
                className="mt-3 w-full rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:border-dragon-blue-500 hover:text-dragon-blue-600 disabled:opacity-50"
              >
                {loading === "addYear" ? "Adding..." : `+ Add ${nextSchoolYear}`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Cleanup Section */}
      {previousYearPending > 0 && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <h3 className="font-semibold text-yellow-800">Cleanup Required</h3>
          <p className="mt-1 text-sm text-yellow-700">
            There are {previousYearPending} membership(s) from previous school years that need to be expired.
          </p>
          <button
            onClick={handleExpirePrevious}
            disabled={loading === "expire"}
            className="mt-3 rounded-md bg-yellow-600 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-700 disabled:opacity-50"
          >
            {loading === "expire" ? "Expiring..." : "Expire Previous Year Memberships"}
          </button>
        </div>
      )}

      {/* Transition Actions */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">School Year Transition</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Prepare for the {nextSchoolYear} school year.
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={handleGenerateCode}
            disabled={loading === "generate"}
            className="rounded-md bg-dragon-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-dragon-blue-600 disabled:opacity-50"
          >
            {loading === "generate" ? "Generating..." : `Generate Join Code for ${nextSchoolYear}`}
          </button>
        </div>

        {transitionStarted && (
          <p className="mt-3 text-sm text-green-600">
            Transition to {nextSchoolYear} has started. {renewedCount} member(s) already renewed.
          </p>
        )}
      </div>

      {/* Bulk Renewal Section */}
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Bulk Member Renewal</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Select members to renew their membership for {nextSchoolYear}.
            </p>
          </div>
          <button
            onClick={handleBulkRenew}
            disabled={loading === "renew" || selectedMembers.size === 0}
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {loading === "renew" ? "Renewing..." : `Renew Selected (${selectedMembers.size})`}
          </button>
        </div>

        {eligibleMembers.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            All members have already been renewed for {nextSchoolYear}.
          </p>
        ) : (
          <div className="mt-4">
            <div className="mb-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="select-all"
                checked={selectedMembers.size === eligibleMembers.length && eligibleMembers.length > 0}
                onChange={handleSelectAll}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="select-all" className="text-sm font-medium">
                Select All ({eligibleMembers.length} eligible)
              </label>
            </div>

            <div className="max-h-96 overflow-y-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="w-10 p-3"></th>
                    <th className="p-3 text-left font-medium">Name</th>
                    <th className="p-3 text-left font-medium">Email</th>
                    <th className="p-3 text-left font-medium">Role</th>
                    <th className="p-3 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {members.map((member) => (
                    <tr
                      key={member.id}
                      className={member.alreadyRenewed ? "bg-muted/30" : ""}
                    >
                      <td className="p-3">
                        {!member.alreadyRenewed && (
                          <input
                            type="checkbox"
                            checked={selectedMembers.has(member.id)}
                            onChange={() => handleToggleMember(member.id)}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                        )}
                      </td>
                      <td className="p-3">{member.userName}</td>
                      <td className="p-3 text-muted-foreground">{member.userEmail}</td>
                      <td className="p-3">
                        <span className="rounded-full bg-muted px-2 py-1 text-xs capitalize">
                          {member.role.replace("_", " ")}
                        </span>
                      </td>
                      <td className="p-3">
                        {member.alreadyRenewed ? (
                          <span className="text-green-600">Renewed</span>
                        ) : (
                          <span className="text-yellow-600">Pending</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
