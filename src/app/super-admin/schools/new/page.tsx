"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSchool } from "@/actions/super-admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DistrictSelect } from "@/components/ui/district-select";
import { US_STATES } from "@/lib/constants";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NewSchoolPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedState, setSelectedState] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const mascot = formData.get("mascot") as string;
    const address = formData.get("address") as string;
    const state = selectedState;
    const district = selectedDistrict;

    try {
      const school = await createSchool({
        name,
        mascot: mascot || undefined,
        address: address || undefined,
        state: state || undefined,
        district: district || undefined,
      });
      router.push(`/super-admin/schools/${school.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create school");
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/super-admin/schools"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Schools
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold">Create New School</h1>
        <p className="text-muted-foreground">
          Add a new school to the system. A join code will be automatically generated.
        </p>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>School Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-foreground"
              >
                School Name *
              </label>
              <input
                type="text"
                id="name"
                name="name"
                required
                placeholder="e.g., Draper Elementary"
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                The join code will be generated from this name (e.g., DRAPER2026)
              </p>
            </div>

            <div>
              <label
                htmlFor="mascot"
                className="block text-sm font-medium text-foreground"
              >
                Mascot
              </label>
              <input
                type="text"
                id="mascot"
                name="mascot"
                placeholder="e.g., Dragons"
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>

            <div>
              <label
                htmlFor="address"
                className="block text-sm font-medium text-foreground"
              >
                Address
              </label>
              <input
                type="text"
                id="address"
                name="address"
                placeholder="e.g., 123 School St, City"
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="state"
                  className="block text-sm font-medium text-foreground"
                >
                  State
                </label>
                <select
                  id="state"
                  name="state"
                  value={selectedState}
                  onChange={(e) => {
                    setSelectedState(e.target.value);
                    setSelectedDistrict(""); // Reset district when state changes
                  }}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
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
                <label
                  htmlFor="district"
                  className="block text-sm font-medium text-foreground"
                >
                  District
                </label>
                <div className="mt-1">
                  <DistrictSelect
                    stateName={selectedState}
                    value={selectedDistrict}
                    onChange={setSelectedDistrict}
                    placeholder="Search or select a district..."
                    allowCustom={true}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Used for district-level PTA resources
                </p>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={isLoading}
                className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {isLoading ? "Creating..." : "Create School"}
              </button>
              <Link
                href="/super-admin/schools"
                className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
              >
                Cancel
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
