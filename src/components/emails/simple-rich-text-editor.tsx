"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { Bold, Italic, Link, Unlink, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SimpleRichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SimpleRichTextEditor({
  value,
  onChange,
  placeholder = "Start typing...",
}: SimpleRichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const savedSelectionRef = useRef<Range | null>(null);

  // Initialize content only once on mount or when value changes externally
  useEffect(() => {
    if (editorRef.current) {
      // Only update if the content actually differs (to preserve cursor position)
      const currentContent = editorRef.current.innerHTML;
      if (currentContent !== value && document.activeElement !== editorRef.current) {
        editorRef.current.innerHTML = value;
      }
    }
  }, [value]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const execCommand = (command: string, cmdValue?: string) => {
    document.execCommand(command, false, cmdValue);
    editorRef.current?.focus();
    handleInput();
  };

  const handleBold = () => execCommand("bold");
  const handleItalic = () => execCommand("italic");

  const saveSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      savedSelectionRef.current = selection.getRangeAt(0).cloneRange();
    }
  };

  const restoreSelection = () => {
    if (savedSelectionRef.current) {
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(savedSelectionRef.current);
      }
    }
  };

  const handleLinkClick = () => {
    saveSelection();
    // Check if current selection is a link
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;
      const parentLink =
        container.nodeType === Node.ELEMENT_NODE
          ? (container as Element).closest("a")
          : container.parentElement?.closest("a");
      if (parentLink) {
        setLinkUrl(parentLink.getAttribute("href") || "");
      } else {
        setLinkUrl("");
      }
    }
    setShowLinkInput(true);
  };

  const handleAddLink = () => {
    restoreSelection();
    if (linkUrl) {
      execCommand("createLink", linkUrl);
      // Add target="_blank" to the created link
      if (editorRef.current) {
        const links = editorRef.current.querySelectorAll("a");
        links.forEach((link) => {
          if (link.getAttribute("href") === linkUrl && !link.getAttribute("target")) {
            link.setAttribute("target", "_blank");
            link.setAttribute("rel", "noopener noreferrer");
          }
        });
      }
    }
    setShowLinkInput(false);
    setLinkUrl("");
    handleInput();
  };

  const handleRemoveLink = () => {
    restoreSelection();
    execCommand("unlink");
    setShowLinkInput(false);
    setLinkUrl("");
  };

  const handleCancelLink = () => {
    setShowLinkInput(false);
    setLinkUrl("");
    restoreSelection();
    editorRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle keyboard shortcuts
    if (e.metaKey || e.ctrlKey) {
      switch (e.key.toLowerCase()) {
        case "b":
          e.preventDefault();
          handleBold();
          break;
        case "i":
          e.preventDefault();
          handleItalic();
          break;
        case "k":
          e.preventDefault();
          handleLinkClick();
          break;
      }
    }
  };

  const isEmpty = value === "" || value === "<br>" || value === "<p><br></p>";

  return (
    <div className="rounded-md border border-input focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-input bg-muted/30 px-2 py-1.5">
        {showLinkInput ? (
          // Link input mode
          <div className="flex flex-1 items-center gap-2">
            <Input
              type="url"
              placeholder="https://..."
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddLink();
                } else if (e.key === "Escape") {
                  handleCancelLink();
                }
              }}
              className="h-7 flex-1 text-sm"
              autoFocus
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleAddLink}
              className="h-7 w-7 p-0 text-green-600 hover:text-green-700"
              title="Apply"
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRemoveLink}
              className="h-7 w-7 p-0 text-destructive"
              title="Remove link"
            >
              <Unlink className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCancelLink}
              className="h-7 w-7 p-0"
              title="Cancel"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          // Normal toolbar
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleBold}
              className="h-7 w-7 p-0"
              title="Bold (⌘B)"
            >
              <Bold className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleItalic}
              className="h-7 w-7 p-0"
              title="Italic (⌘I)"
            >
              <Italic className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleLinkClick}
              className="h-7 w-7 p-0"
              title="Add Link (⌘K)"
            >
              <Link className="h-4 w-4" />
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">
              Select text to format
            </span>
          </>
        )}
      </div>

      {/* Editor with placeholder */}
      <div className="relative">
        <div
          ref={editorRef}
          contentEditable
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          className="min-h-[150px] p-3 text-sm outline-none [&_a]:text-primary [&_a]:underline"
          suppressContentEditableWarning
        />
        {isEmpty && (
          <div className="pointer-events-none absolute left-3 top-3 text-sm text-muted-foreground">
            {placeholder}
          </div>
        )}
      </div>
    </div>
  );
}
