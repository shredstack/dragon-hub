"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RESOURCE_SOURCES, type ResourceSource } from "@/lib/constants";

interface ResourceSourceSelectProps {
  value: ResourceSource;
  onValueChange: (value: ResourceSource) => void;
  label?: string;
  description?: string;
}

export function ResourceSourceSelect({
  value,
  onValueChange,
  label = "Source Type",
  description,
}: ResourceSourceSelectProps) {
  return (
    <div>
      {label && (
        <label className="mb-1 block text-sm font-medium">{label}</label>
      )}
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select source" />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(RESOURCE_SOURCES).map(([key, label]) => (
            <SelectItem key={key} value={key}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {description && (
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  );
}
