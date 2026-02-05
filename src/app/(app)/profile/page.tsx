"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { updateProfile, getProfile } from "@/actions/profile";
import { Button } from "@/components/ui/button";

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [profile, setProfile] = useState<{
    name: string | null;
    email: string;
    phone: string | null;
  } | null>(null);

  useEffect(() => {
    getProfile().then((p) => {
      if (p) setProfile(p);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const fd = new FormData(e.currentTarget);
    try {
      await updateProfile({
        name: fd.get("name") as string,
        phone: fd.get("phone") as string,
      });
      setSaved(true);
      router.refresh();
    } catch (error) {
      console.error("Failed to update profile:", error);
      alert("Failed to update profile");
    } finally {
      setLoading(false);
    }
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-lg">
        <h1 className="mb-6 text-2xl font-bold">Profile</h1>
        <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-bold">Profile</h1>
      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-lg border border-border bg-card p-6"
      >
        <div>
          <label className="mb-1 block text-sm font-medium">Email</label>
          <input
            type="email"
            value={profile.email}
            disabled
            className="w-full rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Email cannot be changed
          </p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Name</label>
          <input
            name="name"
            defaultValue={profile.name ?? ""}
            placeholder="Your full name"
            onChange={() => setSaved(false)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Phone</label>
          <input
            name="phone"
            type="tel"
            defaultValue={profile.phone ?? ""}
            placeholder="(555) 123-4567"
            onChange={() => setSaved(false)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        {saved && (
          <p className="text-sm text-green-600">Profile saved successfully.</p>
        )}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Saving..." : "Save Changes"}
        </Button>
      </form>
    </div>
  );
}
