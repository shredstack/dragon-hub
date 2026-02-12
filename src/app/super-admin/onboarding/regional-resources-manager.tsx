"use client";

import { useState, useEffect, useTransition } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  ExternalLink,
  Pencil,
  MapPin,
  Building2,
} from "lucide-react";
import {
  getAllStateResources,
  createStateResource,
  updateStateResource,
  deleteStateResource,
  getAllDistrictResources,
  createDistrictResource,
  updateDistrictResource,
  deleteDistrictResource,
} from "@/actions/regional-onboarding-resources";
import {
  PTA_BOARD_POSITIONS,
  US_STATES,
  ONBOARDING_RESOURCE_CATEGORIES,
} from "@/lib/constants";
import { DistrictSelect } from "@/components/ui/district-select";
import type {
  PtaBoardPosition,
  StateOnboardingResourceWithCreator,
  DistrictOnboardingResourceWithCreator,
} from "@/types";

type Tab = "state" | "district";

export function RegionalResourcesManager() {
  const [activeTab, setActiveTab] = useState<Tab>("state");
  const [stateResources, setStateResources] = useState<
    StateOnboardingResourceWithCreator[]
  >([]);
  const [districtResources, setDistrictResources] = useState<
    DistrictOnboardingResourceWithCreator[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Form states
  const [showStateForm, setShowStateForm] = useState(false);
  const [showDistrictForm, setShowDistrictForm] = useState(false);
  const [editingStateResource, setEditingStateResource] =
    useState<StateOnboardingResourceWithCreator | null>(null);
  const [editingDistrictResource, setEditingDistrictResource] =
    useState<DistrictOnboardingResourceWithCreator | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [stateData, districtData] = await Promise.all([
        getAllStateResources(),
        getAllDistrictResources(),
      ]);
      setStateResources(stateData as StateOnboardingResourceWithCreator[]);
      setDistrictResources(
        districtData as DistrictOnboardingResourceWithCreator[]
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStateResource = (id: string) => {
    if (!confirm("Are you sure you want to delete this resource?")) return;
    startTransition(async () => {
      await deleteStateResource(id);
      await loadData();
    });
  };

  const handleDeleteDistrictResource = (id: string) => {
    if (!confirm("Are you sure you want to delete this resource?")) return;
    startTransition(async () => {
      await deleteDistrictResource(id);
      await loadData();
    });
  };

  // Group resources by state/district for better display
  const stateResourcesByState = stateResources.reduce(
    (acc, resource) => {
      if (!acc[resource.state]) acc[resource.state] = [];
      acc[resource.state].push(resource);
      return acc;
    },
    {} as Record<string, StateOnboardingResourceWithCreator[]>
  );

  const districtResourcesByLocation = districtResources.reduce(
    (acc, resource) => {
      const key = `${resource.state}|${resource.district}`;
      if (!acc[key]) acc[key] = { state: resource.state, district: resource.district, resources: [] };
      acc[key].resources.push(resource);
      return acc;
    },
    {} as Record<string, { state: string; district: string; resources: DistrictOnboardingResourceWithCreator[] }>
  );

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
          onClick={() => setActiveTab("state")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "state"
              ? "border-purple-500 text-purple-500"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <MapPin className="h-4 w-4" />
          State Resources ({stateResources.length})
        </button>
        <button
          onClick={() => setActiveTab("district")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "district"
              ? "border-purple-500 text-purple-500"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Building2 className="h-4 w-4" />
          District Resources ({districtResources.length})
        </button>
      </div>

      {/* State Resources Tab */}
      {activeTab === "state" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              State-level resources are available to all schools in that state.
            </p>
            <button
              onClick={() => {
                setEditingStateResource(null);
                setShowStateForm(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
            >
              <Plus className="h-4 w-4" />
              Add State Resource
            </button>
          </div>

          {showStateForm && (
            <StateResourceForm
              resource={editingStateResource}
              onSave={async (data) => {
                startTransition(async () => {
                  if (editingStateResource) {
                    await updateStateResource(editingStateResource.id, data);
                  } else {
                    await createStateResource(data);
                  }
                  setShowStateForm(false);
                  setEditingStateResource(null);
                  await loadData();
                });
              }}
              onCancel={() => {
                setShowStateForm(false);
                setEditingStateResource(null);
              }}
              isPending={isPending}
            />
          )}

          {Object.keys(stateResourcesByState).length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <MapPin className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-muted-foreground">
                No state resources configured yet.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add resources for states like Utah, California, etc.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(stateResourcesByState).map(([state, resources]) => (
                <div key={state} className="rounded-lg border border-border">
                  <div className="border-b border-border bg-muted/50 px-4 py-3">
                    <h3 className="font-semibold flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-purple-500" />
                      {state}
                      <span className="text-sm font-normal text-muted-foreground">
                        ({resources.length} resources)
                      </span>
                    </h3>
                  </div>
                  <div className="divide-y divide-border">
                    {resources.map((resource) => (
                      <ResourceRow
                        key={resource.id}
                        resource={resource}
                        onEdit={() => {
                          setEditingStateResource(resource);
                          setShowStateForm(true);
                        }}
                        onDelete={() => handleDeleteStateResource(resource.id)}
                        isPending={isPending}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* District Resources Tab */}
      {activeTab === "district" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              District-level resources are available to schools in that specific
              district.
            </p>
            <button
              onClick={() => {
                setEditingDistrictResource(null);
                setShowDistrictForm(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
            >
              <Plus className="h-4 w-4" />
              Add District Resource
            </button>
          </div>

          {showDistrictForm && (
            <DistrictResourceForm
              resource={editingDistrictResource}
              onSave={async (data) => {
                startTransition(async () => {
                  if (editingDistrictResource) {
                    await updateDistrictResource(editingDistrictResource.id, data);
                  } else {
                    await createDistrictResource(data);
                  }
                  setShowDistrictForm(false);
                  setEditingDistrictResource(null);
                  await loadData();
                });
              }}
              onCancel={() => {
                setShowDistrictForm(false);
                setEditingDistrictResource(null);
              }}
              isPending={isPending}
            />
          )}

          {Object.keys(districtResourcesByLocation).length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <Building2 className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-muted-foreground">
                No district resources configured yet.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add resources for specific school districts.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.values(districtResourcesByLocation).map((location) => (
                <div
                  key={`${location.state}|${location.district}`}
                  className="rounded-lg border border-border"
                >
                  <div className="border-b border-border bg-muted/50 px-4 py-3">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-purple-500" />
                      {location.district}
                      <span className="text-sm font-normal text-muted-foreground">
                        {location.state} ({location.resources.length} resources)
                      </span>
                    </h3>
                  </div>
                  <div className="divide-y divide-border">
                    {location.resources.map((resource) => (
                      <ResourceRow
                        key={resource.id}
                        resource={resource}
                        onEdit={() => {
                          setEditingDistrictResource(resource);
                          setShowDistrictForm(true);
                        }}
                        onDelete={() => handleDeleteDistrictResource(resource.id)}
                        isPending={isPending}
                      />
                    ))}
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

// Shared Resource Row Component
function ResourceRow({
  resource,
  onEdit,
  onDelete,
  isPending,
}: {
  resource: StateOnboardingResourceWithCreator | DistrictOnboardingResourceWithCreator;
  onEdit: () => void;
  onDelete: () => void;
  isPending: boolean;
}) {
  return (
    <div className="flex items-start gap-3 p-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{resource.title}</span>
          {resource.position && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
              {PTA_BOARD_POSITIONS[resource.position]}
            </span>
          )}
          {resource.category && (
            <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-xs text-purple-500">
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
          className="mt-1 inline-flex items-center gap-1 text-xs text-purple-500 hover:underline"
        >
          {resource.url}
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={onEdit}
          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={onDelete}
          disabled={isPending}
          className="rounded p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// State Resource Form Component
function StateResourceForm({
  resource,
  onSave,
  onCancel,
  isPending,
}: {
  resource: StateOnboardingResourceWithCreator | null;
  onSave: (data: {
    state: string;
    title: string;
    url: string;
    description?: string;
    category?: string;
    position?: PtaBoardPosition | null;
  }) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [state, setState] = useState(resource?.state || "");
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
        {resource ? "Edit State Resource" : "Add State Resource"}
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">State *</label>
          <select
            value={state}
            onChange={(e) => setState(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Select a state...</option>
            {Object.entries(US_STATES).map(([code, name]) => (
              <option key={code} value={name}>
                {name}
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
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium">Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            placeholder="e.g., Utah PTA Handbook"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium">URL *</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            placeholder="https://..."
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
              state,
              title,
              url,
              description: description || undefined,
              category: category || undefined,
              position: position || null,
            })
          }
          disabled={!state || !title || !url || isPending}
          className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
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

// District Resource Form Component
function DistrictResourceForm({
  resource,
  onSave,
  onCancel,
  isPending,
}: {
  resource: DistrictOnboardingResourceWithCreator | null;
  onSave: (data: {
    state: string;
    district: string;
    title: string;
    url: string;
    description?: string;
    category?: string;
    position?: PtaBoardPosition | null;
  }) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [state, setState] = useState(resource?.state || "");
  const [district, setDistrict] = useState(resource?.district || "");
  const [title, setTitle] = useState(resource?.title || "");
  const [url, setUrl] = useState(resource?.url || "");
  const [description, setDescription] = useState(resource?.description || "");
  const [category, setCategory] = useState(resource?.category || "");
  const [position, setPosition] = useState<PtaBoardPosition | "">(
    resource?.position || ""
  );

  // Reset district when state changes (unless editing)
  const handleStateChange = (newState: string) => {
    setState(newState);
    if (!resource) {
      setDistrict("");
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-4 font-medium">
        {resource ? "Edit District Resource" : "Add District Resource"}
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">State *</label>
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
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">District *</label>
          <DistrictSelect
            stateName={state}
            value={district}
            onChange={setDistrict}
            placeholder="Search or select a district..."
            allowCustom={true}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium">Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            placeholder="Resource title"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium">URL *</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            placeholder="https://..."
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
              state,
              district,
              title,
              url,
              description: description || undefined,
              category: category || undefined,
              position: position || null,
            })
          }
          disabled={!state || !district || !title || !url || isPending}
          className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
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
