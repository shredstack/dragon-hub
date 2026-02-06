"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { updateProfile, getProfile } from "@/actions/profile";
import { Button } from "@/components/ui/button";
import { isValidPhoneNumber, getInitials } from "@/lib/utils";
import { Camera, Trash2, Loader2 } from "lucide-react";
import Image from "next/image";

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [profile, setProfile] = useState<{
    name: string | null;
    email: string;
    phone: string | null;
    image: string | null;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getProfile().then((p) => {
      if (p) setProfile(p);
    });
  }, []);

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload/profile-picture", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to upload image");
      }

      setProfile((prev) => (prev ? { ...prev, image: data.url } : null));
      router.refresh();
    } catch (error) {
      console.error("Upload error:", error);
      alert(error instanceof Error ? error.message : "Failed to upload image");
    } finally {
      setImageLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleImageDelete() {
    if (!window.confirm("Are you sure you want to remove your profile picture?")) {
      return;
    }

    setImageLoading(true);
    try {
      const response = await fetch("/api/upload/profile-picture", {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete image");
      }

      setProfile((prev) => (prev ? { ...prev, image: null } : null));
      router.refresh();
    } catch (error) {
      console.error("Delete error:", error);
      alert("Failed to delete image");
    } finally {
      setImageLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPhoneError(null);
    setSuccessMessage(null);
    setLoading(true);

    const fd = new FormData(e.currentTarget);
    const phone = fd.get("phone") as string;

    if (phone && !isValidPhoneNumber(phone)) {
      setPhoneError("Please enter a valid phone number (e.g., (555) 123-4567)");
      setLoading(false);
      return;
    }

    try {
      await updateProfile({
        name: fd.get("name") as string,
        phone,
      });
      setSuccessMessage("Profile updated successfully");
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

  const initials = profile.name ? getInitials(profile.name) : profile.email[0].toUpperCase();

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-bold">Profile</h1>

      <div className="mb-6 rounded-lg border border-border bg-card p-6">
        <label className="mb-3 block text-sm font-medium">Profile Picture</label>
        <div className="flex items-center gap-4">
          <div className="relative">
            {profile.image ? (
              <Image
                src={profile.image}
                alt="Profile"
                width={80}
                height={80}
                className="h-20 w-20 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-dragon-blue-500 text-2xl font-bold text-white">
                {initials}
              </div>
            )}
            {imageLoading && (
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
                <Loader2 className="h-6 w-6 animate-spin text-white" />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={handleImageUpload}
              className="hidden"
              disabled={imageLoading}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={imageLoading}
            >
              <Camera className="mr-2 h-4 w-4" />
              {profile.image ? "Change" : "Upload"}
            </Button>
            {profile.image && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleImageDelete}
                disabled={imageLoading}
                className="text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Remove
              </Button>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          JPEG, PNG, GIF, or WebP. Max 4MB.
        </p>
      </div>

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
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            onChange={() => setSuccessMessage(null)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Phone</label>
          <input
            name="phone"
            type="tel"
            defaultValue={profile.phone ?? ""}
            placeholder="(555) 123-4567"
            className={`w-full rounded-md border bg-background px-3 py-2 text-sm ${
              phoneError ? "border-destructive" : "border-input"
            }`}
            onChange={() => { setPhoneError(null); setSuccessMessage(null); }}
          />
          {phoneError && (
            <p className="mt-1 text-xs text-destructive">{phoneError}</p>
          )}
        </div>
        {successMessage && (
          <div className="rounded-md bg-green-50 p-3 text-sm text-green-700">
            {successMessage}
          </div>
        )}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Saving..." : "Save Changes"}
        </Button>
      </form>
    </div>
  );
}
