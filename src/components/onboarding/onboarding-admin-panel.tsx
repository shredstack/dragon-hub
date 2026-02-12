"use client";

import { useState, useEffect, useTransition } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  ExternalLink,
  Pencil,
  Download,
  MapPin,
} from "lucide-react";
import {
  getAllResources,
  createResource,
  updateResource,
  deleteResource,
  getAvailableRegionalDefaultsCount,
  importRegionalDefaults,
} from "@/actions/onboarding-resources";
import {
  getAllChecklistItems,
  createChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
} from "@/actions/onboarding-checklist";
import {
  PTA_BOARD_POSITIONS,
  ONBOARDING_RESOURCE_CATEGORIES,
} from "@/lib/constants";
import type {
  PtaBoardPosition,
  OnboardingResource,
  OnboardingChecklistItem,
} from "@/types";

type ResourceWithCreator = OnboardingResource & {
  creator: { id: string; name: string | null; email: string } | null;
};

type ChecklistItemWithCreator = OnboardingChecklistItem & {
  creator: { id: string; name: string | null; email: string } | null;
};

type RegionalDefaultsInfo = {
  state: string | null;
  district: string | null;
  stateCount: number;
  districtCount: number;
  totalCount: number;
};

export function OnboardingAdminPanel() {
  const [activeTab, setActiveTab] = useState<"resources" | "checklist">(
    "resources"
  );
  const [resources, setResources] = useState<ResourceWithCreator[]>([]);
  const [checklistItems, setChecklistItems] = useState<
    ChecklistItemWithCreator[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Form state
  const [showResourceForm, setShowResourceForm] = useState(false);
  const [showChecklistForm, setShowChecklistForm] = useState(false);
  const [editingResource, setEditingResource] =
    useState<ResourceWithCreator | null>(null);
  const [editingChecklistItem, setEditingChecklistItem] =
    useState<ChecklistItemWithCreator | null>(null);

  // Regional defaults state
  const [regionalDefaults, setRegionalDefaults] =
    useState<RegionalDefaultsInfo | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [resourcesData, checklistData, regionalData] = await Promise.all([
        getAllResources(),
        getAllChecklistItems(),
        getAvailableRegionalDefaultsCount(),
      ]);
      setResources(resourcesData as ResourceWithCreator[]);
      setChecklistItems(checklistData as ChecklistItemWithCreator[]);
      setRegionalDefaults(regionalData);
    } finally {
      setLoading(false);
    }
  };

  const handleImportDefaults = async (includeState: boolean, includeDistrict: boolean) => {
    startTransition(async () => {
      try {
        const result = await importRegionalDefaults({
          includeState,
          includeDistrict,
        });
        setImportMessage(`Successfully imported ${result.importedCount} resources`);
        setShowImportDialog(false);
        await loadData();
        // Clear message after 3 seconds
        setTimeout(() => setImportMessage(null), 3000);
      } catch (error) {
        setImportMessage(
          error instanceof Error ? error.message : "Failed to import resources"
        );
      }
    });
  };

  const handleDeleteResource = (id: string) => {
    if (!confirm("Are you sure you want to delete this resource?")) return;
    startTransition(async () => {
      await deleteResource(id);
      await loadData();
    });
  };

  const handleDeleteChecklistItem = (id: string) => {
    if (!confirm("Are you sure you want to delete this checklist item?")) return;
    startTransition(async () => {
      await deleteChecklistItem(id);
      await loadData();
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setActiveTab("resources")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "resources"
              ? "border-dragon-blue-500 text-dragon-blue-500"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Resources ({resources.length})
        </button>
        <button
          onClick={() => setActiveTab("checklist")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "checklist"
              ? "border-dragon-blue-500 text-dragon-blue-500"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Checklist Items ({checklistItems.length})
        </button>
      </div>

      {/* Resources Tab */}
      {activeTab === "resources" && (
        <div className="space-y-4">
          {/* Import Success/Error Message */}
          {importMessage && (
            <div
              className={`rounded-lg p-3 text-sm ${
                importMessage.includes("Successfully")
                  ? "bg-green-500/10 text-green-500"
                  : "bg-red-500/10 text-red-500"
              }`}
            >
              {importMessage}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setEditingResource(null);
                setShowResourceForm(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-dragon-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-dragon-blue-600"
            >
              <Plus className="h-4 w-4" />
              Add Resource
            </button>
            {regionalDefaults && regionalDefaults.totalCount > 0 && (
              <button
                onClick={() => setShowImportDialog(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                <Download className="h-4 w-4" />
                Import Regional Defaults
                <span className="rounded-full bg-dragon-blue-500/10 px-2 py-0.5 text-xs text-dragon-blue-500">
                  {regionalDefaults.totalCount}
                </span>
              </button>
            )}
          </div>

          {/* Import Dialog */}
          {showImportDialog && regionalDefaults && (
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="mb-4 font-medium flex items-center gap-2">
                <MapPin className="h-4 w-4 text-dragon-blue-500" />
                Import Regional Defaults
              </h3>
              <p className="mb-4 text-sm text-muted-foreground">
                Import default onboarding resources configured for your region.
                Resources with the same title as existing ones will be skipped.
              </p>

              <div className="space-y-3 mb-4">
                {regionalDefaults.stateCount > 0 && (
                  <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div>
                      <p className="font-medium">{regionalDefaults.state} Resources</p>
                      <p className="text-sm text-muted-foreground">
                        {regionalDefaults.stateCount} state-level resources
                      </p>
                    </div>
                    <button
                      onClick={() => handleImportDefaults(true, false)}
                      disabled={isPending}
                      className="rounded-lg bg-dragon-blue-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-dragon-blue-600 disabled:opacity-50"
                    >
                      {isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Import"
                      )}
                    </button>
                  </div>
                )}

                {regionalDefaults.districtCount > 0 && (
                  <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div>
                      <p className="font-medium">{regionalDefaults.district}</p>
                      <p className="text-sm text-muted-foreground">
                        {regionalDefaults.districtCount} district-level resources
                      </p>
                    </div>
                    <button
                      onClick={() => handleImportDefaults(false, true)}
                      disabled={isPending}
                      className="rounded-lg bg-dragon-blue-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-dragon-blue-600 disabled:opacity-50"
                    >
                      {isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Import"
                      )}
                    </button>
                  </div>
                )}

                {regionalDefaults.stateCount > 0 && regionalDefaults.districtCount > 0 && (
                  <div className="flex items-center justify-between rounded-lg border border-dragon-blue-500 bg-dragon-blue-500/5 p-3">
                    <div>
                      <p className="font-medium">Import All</p>
                      <p className="text-sm text-muted-foreground">
                        {regionalDefaults.totalCount} total resources
                      </p>
                    </div>
                    <button
                      onClick={() => handleImportDefaults(true, true)}
                      disabled={isPending}
                      className="rounded-lg bg-dragon-blue-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-dragon-blue-600 disabled:opacity-50"
                    >
                      {isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Import All"
                      )}
                    </button>
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => setShowImportDialog(false)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* No Regional Defaults Notice */}
          {regionalDefaults && regionalDefaults.totalCount === 0 && !regionalDefaults.state && (
            <div className="rounded-lg border border-dashed border-border bg-muted/50 p-4">
              <p className="text-sm text-muted-foreground">
                <strong>Tip:</strong> Set your school&apos;s state and district in{" "}
                <a href="/admin/settings" className="text-dragon-blue-500 hover:underline">
                  School Settings
                </a>{" "}
                to access regional default resources.
              </p>
            </div>
          )}

          {/* Resource Form */}
          {showResourceForm && (
            <ResourceForm
              resource={editingResource}
              onSave={async (data) => {
                startTransition(async () => {
                  if (editingResource) {
                    await updateResource(editingResource.id, data);
                  } else {
                    await createResource(data);
                  }
                  setShowResourceForm(false);
                  setEditingResource(null);
                  await loadData();
                });
              }}
              onCancel={() => {
                setShowResourceForm(false);
                setEditingResource(null);
              }}
              isPending={isPending}
            />
          )}

          {/* Resources List */}
          {resources.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <p className="text-muted-foreground">No resources added yet.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add links to PTA handbooks, training materials, and tools for board members.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {resources.map((resource) => (
                <div
                  key={resource.id}
                  className="flex items-start gap-3 rounded-lg border border-border bg-card p-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{resource.title}</span>
                      {resource.position && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                          {PTA_BOARD_POSITIONS[resource.position]}
                        </span>
                      )}
                      {resource.category && (
                        <span className="rounded-full bg-dragon-blue-500/10 px-2 py-0.5 text-xs text-dragon-blue-500">
                          {resource.category}
                        </span>
                      )}
                      {!resource.active && (
                        <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-500">
                          Inactive
                        </span>
                      )}
                    </div>
                    {resource.description && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {resource.description}
                      </p>
                    )}
                    <a
                      href={resource.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-dragon-blue-500 hover:underline"
                    >
                      {resource.url}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditingResource(resource);
                        setShowResourceForm(true);
                      }}
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteResource(resource.id)}
                      disabled={isPending}
                      className="rounded p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Checklist Tab */}
      {activeTab === "checklist" && (
        <div className="space-y-4">
          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setEditingChecklistItem(null);
                setShowChecklistForm(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-dragon-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-dragon-blue-600"
            >
              <Plus className="h-4 w-4" />
              Add Checklist Item
            </button>
          </div>

          {/* Checklist Form */}
          {showChecklistForm && (
            <ChecklistForm
              item={editingChecklistItem}
              onSave={async (data) => {
                startTransition(async () => {
                  if (editingChecklistItem) {
                    await updateChecklistItem(editingChecklistItem.id, data);
                  } else {
                    await createChecklistItem(data);
                  }
                  setShowChecklistForm(false);
                  setEditingChecklistItem(null);
                  await loadData();
                });
              }}
              onCancel={() => {
                setShowChecklistForm(false);
                setEditingChecklistItem(null);
              }}
              isPending={isPending}
            />
          )}

          {/* Checklist Items List */}
          {checklistItems.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <p className="text-muted-foreground">No checklist items added yet.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add onboarding tasks that new board members should complete.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {checklistItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 rounded-lg border border-border bg-card p-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{item.title}</span>
                      {item.position && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                          {PTA_BOARD_POSITIONS[item.position]}
                        </span>
                      )}
                      {!item.active && (
                        <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-500">
                          Inactive
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditingChecklistItem(item);
                        setShowChecklistForm(true);
                      }}
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteChecklistItem(item.id)}
                      disabled={isPending}
                      className="rounded p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Resource Form Component
function ResourceForm({
  resource,
  onSave,
  onCancel,
  isPending,
}: {
  resource: ResourceWithCreator | null;
  onSave: (data: {
    title: string;
    url: string;
    description?: string;
    category?: string;
    position?: PtaBoardPosition | null;
  }) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [title, setTitle] = useState(resource?.title || "");
  const [url, setUrl] = useState(resource?.url || "");
  const [description, setDescription] = useState(resource?.description || "");
  const [category, setCategory] = useState(resource?.category || "");
  const [position, setPosition] = useState<PtaBoardPosition | "">(
    resource?.position || ""
  );

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-4 font-medium">
        {resource ? "Edit Resource" : "Add Resource"}
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium">Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            placeholder="Utah PTA Handbook"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium">URL *</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            placeholder="https://utahpta.org/..."
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            placeholder="Brief description of this resource"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Select a category...</option>
            {ONBOARDING_RESOURCE_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">
            Board Position
          </label>
          <select
            value={position}
            onChange={(e) =>
              setPosition(e.target.value as PtaBoardPosition | "")
            }
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">All Positions</option>
            {Object.entries(PTA_BOARD_POSITIONS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Cancel
        </button>
        <button
          onClick={() =>
            onSave({
              title,
              url,
              description: description || undefined,
              category: category || undefined,
              position: position || null,
            })
          }
          disabled={!title || !url || isPending}
          className="rounded-lg bg-dragon-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-dragon-blue-600 disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : resource ? (
            "Save"
          ) : (
            "Add"
          )}
        </button>
      </div>
    </div>
  );
}

// Checklist Form Component
function ChecklistForm({
  item,
  onSave,
  onCancel,
  isPending,
}: {
  item: ChecklistItemWithCreator | null;
  onSave: (data: {
    title: string;
    description?: string;
    position?: PtaBoardPosition | null;
  }) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [title, setTitle] = useState(item?.title || "");
  const [description, setDescription] = useState(item?.description || "");
  const [position, setPosition] = useState<PtaBoardPosition | "">(
    item?.position || ""
  );

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-4 font-medium">
        {item ? "Edit Checklist Item" : "Add Checklist Item"}
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium">Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            placeholder="Complete National PTA training"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            placeholder="Additional details or instructions"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">
            Board Position
          </label>
          <select
            value={position}
            onChange={(e) =>
              setPosition(e.target.value as PtaBoardPosition | "")
            }
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">All Positions</option>
            {Object.entries(PTA_BOARD_POSITIONS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Cancel
        </button>
        <button
          onClick={() =>
            onSave({
              title,
              description: description || undefined,
              position: position || null,
            })
          }
          disabled={!title || isPending}
          className="rounded-lg bg-dragon-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-dragon-blue-600 disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : item ? (
            "Save"
          ) : (
            "Add"
          )}
        </button>
      </div>
    </div>
  );
}
