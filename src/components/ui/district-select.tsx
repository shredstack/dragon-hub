"use client";

import { useState, useEffect, useRef } from "react";
import { getDistrictsByState } from "@/actions/districts";
import { Loader2, ChevronDown, X, Search } from "lucide-react";

interface District {
  id: string;
  name: string;
  ncesId: string | null;
}

interface DistrictSelectProps {
  stateName: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  allowCustom?: boolean;
}

export function DistrictSelect({
  stateName,
  value,
  onChange,
  placeholder = "Select a district...",
  disabled = false,
  allowCustom = true,
}: DistrictSelectProps) {
  const [districts, setDistricts] = useState<District[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch districts when state changes
  useEffect(() => {
    if (!stateName) {
      setDistricts([]);
      return;
    }

    setLoading(true);
    getDistrictsByState(stateName)
      .then((data) => {
        setDistricts(data);
      })
      .catch((error) => {
        console.error("Error fetching districts:", error);
        setDistricts([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [stateName]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter districts based on search term
  const filteredDistricts = districts.filter((d) =>
    d.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Check if search term matches a custom entry (not in list)
  const isCustomEntry =
    allowCustom &&
    searchTerm &&
    !districts.some((d) => d.name.toLowerCase() === searchTerm.toLowerCase());

  const handleSelect = (districtName: string) => {
    onChange(districtName);
    setSearchTerm("");
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange("");
    setSearchTerm("");
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    if (!isOpen) setIsOpen(true);
  };

  const handleInputFocus = () => {
    if (stateName && !disabled) {
      setIsOpen(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && isCustomEntry && allowCustom) {
      e.preventDefault();
      handleSelect(searchTerm);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  if (!stateName) {
    return (
      <div className="relative">
        <input
          type="text"
          disabled
          placeholder="Select a state first..."
          className="w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm text-muted-foreground"
        />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <Search className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <input
          ref={inputRef}
          type="text"
          value={isOpen ? searchTerm : value}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          disabled={disabled || loading}
          placeholder={loading ? "Loading districts..." : placeholder}
          className="w-full rounded-lg border border-input bg-background pl-9 pr-16 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:bg-muted disabled:text-muted-foreground"
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-2 gap-1">
          {value && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 rounded hover:bg-muted"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </div>
      </div>

      {isOpen && !loading && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-card shadow-lg max-h-60 overflow-y-auto">
          {filteredDistricts.length === 0 && !isCustomEntry ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              {districts.length === 0
                ? "No districts found for this state"
                : "No matching districts"}
            </div>
          ) : (
            <>
              {isCustomEntry && (
                <button
                  type="button"
                  onClick={() => handleSelect(searchTerm)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2 border-b border-border"
                >
                  <span className="text-purple-500">+</span>
                  Add &quot;{searchTerm}&quot;
                </button>
              )}
              {filteredDistricts.map((district) => (
                <button
                  key={district.id}
                  type="button"
                  onClick={() => handleSelect(district.name)}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-muted ${
                    district.name === value ? "bg-muted" : ""
                  }`}
                >
                  {district.name}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
