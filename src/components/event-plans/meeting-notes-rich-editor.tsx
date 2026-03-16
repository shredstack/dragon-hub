"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import {
  Bold,
  Italic,
  Underline,
  Heading2,
  Heading3,
  Pilcrow,
  List,
  ListOrdered,
  IndentIncrease,
  IndentDecrease,
  Link,
  Unlink,
  Highlighter,
  Palette,
  Image as ImageIcon,
  Table,
  Check,
  X,
  Upload,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface MeetingNotesRichEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  meetingId?: string;
  eventPlanId?: string;
}

const TEXT_COLORS = [
  { name: "Default", color: "", className: "" },
  { name: "Red", color: "#dc2626", className: "text-color-red" },
  { name: "Blue", color: "#2563eb", className: "text-color-blue" },
  { name: "Green", color: "#16a34a", className: "text-color-green" },
];

export function MeetingNotesRichEditor({
  value,
  onChange,
  placeholder = "Start typing your meeting notes...",
  meetingId,
  eventPlanId,
}: MeetingNotesRichEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [showImageDialog, setShowImageDialog] = useState(false);
  const [showTableDialog, setShowTableDialog] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const savedSelectionRef = useRef<Range | null>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  // Initialize content only once on mount or when value changes externally
  useEffect(() => {
    if (editorRef.current) {
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

  // Structure commands
  const handleHeading2 = () => execCommand("formatBlock", "<h2>");
  const handleHeading3 = () => execCommand("formatBlock", "<h3>");
  const handleParagraph = () => execCommand("formatBlock", "<p>");

  // Text formatting
  const handleBold = () => execCommand("bold");
  const handleItalic = () => execCommand("italic");
  const handleUnderline = () => execCommand("underline");

  // Lists
  const handleBulletList = () => execCommand("insertUnorderedList");
  const handleNumberedList = () => execCommand("insertOrderedList");
  const handleIndent = () => execCommand("indent");
  const handleOutdent = () => execCommand("outdent");

  // Highlight
  const handleHighlight = () => execCommand("backColor", "#fef08a");

  // Colors
  const handleTextColor = (color: string) => {
    if (color === "") {
      execCommand("removeFormat");
    } else {
      execCommand("foreColor", color);
    }
  };

  // Link handling
  const handleLinkClick = () => {
    saveSelection();
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

  // Image insertion
  const insertImage = (url: string, alt: string = "") => {
    restoreSelection();
    const imgHtml = `<img src="${url}" alt="${alt}" class="meeting-note-image">`;
    execCommand("insertHTML", imgHtml);
    setShowImageDialog(false);
    handleInput();
  };

  // Table insertion
  const insertTable = (rows: number, cols: number, hasHeader: boolean) => {
    restoreSelection();
    let tableHtml = '<table class="meeting-note-table">';

    for (let i = 0; i < rows; i++) {
      tableHtml += "<tr>";
      for (let j = 0; j < cols; j++) {
        if (i === 0 && hasHeader) {
          tableHtml += "<th>Header</th>";
        } else {
          tableHtml += "<td>Cell</td>";
        }
      }
      tableHtml += "</tr>";
    }

    tableHtml += "</table><p><br></p>";
    execCommand("insertHTML", tableHtml);
    setShowTableDialog(false);
    handleInput();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
        case "u":
          e.preventDefault();
          handleUnderline();
          break;
        case "k":
          e.preventDefault();
          handleLinkClick();
          break;
      }
      // Shift+Cmd combinations
      if (e.shiftKey) {
        switch (e.key) {
          case "1":
            e.preventDefault();
            handleHeading2();
            break;
          case "2":
            e.preventDefault();
            handleHeading3();
            break;
          case "0":
            e.preventDefault();
            handleParagraph();
            break;
        }
      }
    }
  };

  const isEmpty = value === "" || value === "<br>" || value === "<p><br></p>";

  return (
    <div className="rounded-md border border-input focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-input bg-muted/30 px-1.5 py-1">
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
            {/* Structure */}
            <div className="flex items-center border-r border-input pr-1 mr-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleHeading2}
                className="h-7 w-7 p-0"
                title="Heading 2 (⌘⇧1)"
              >
                <Heading2 className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleHeading3}
                className="h-7 w-7 p-0"
                title="Heading 3 (⌘⇧2)"
              >
                <Heading3 className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleParagraph}
                className="h-7 w-7 p-0"
                title="Paragraph (⌘⇧0)"
              >
                <Pilcrow className="h-4 w-4" />
              </Button>
            </div>

            {/* Text formatting */}
            <div className="flex items-center border-r border-input pr-1 mr-1">
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
                onClick={handleUnderline}
                className="h-7 w-7 p-0"
                title="Underline (⌘U)"
              >
                <Underline className="h-4 w-4" />
              </Button>
            </div>

            {/* Lists */}
            <div className="flex items-center border-r border-input pr-1 mr-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleBulletList}
                className="h-7 w-7 p-0"
                title="Bullet list"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleNumberedList}
                className="h-7 w-7 p-0"
                title="Numbered list"
              >
                <ListOrdered className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleOutdent}
                className="h-7 w-7 p-0"
                title="Decrease indent"
              >
                <IndentDecrease className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleIndent}
                className="h-7 w-7 p-0"
                title="Increase indent"
              >
                <IndentIncrease className="h-4 w-4" />
              </Button>
            </div>

            {/* Link */}
            <div className="flex items-center border-r border-input pr-1 mr-1">
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
            </div>

            {/* Colors */}
            <div className="relative flex items-center border-r border-input pr-1 mr-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleHighlight}
                className="h-7 w-7 p-0"
                title="Highlight"
              >
                <Highlighter className="h-4 w-4" />
              </Button>
              <div ref={colorPickerRef} className="relative">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    saveSelection();
                    setShowColorPicker(!showColorPicker);
                  }}
                  className="h-7 w-7 p-0"
                  title="Text color"
                >
                  <Palette className="h-4 w-4" />
                </Button>
                {showColorPicker && (
                  <div className="absolute left-0 top-full z-50 mt-1 rounded-md border border-border bg-card p-1 shadow-md">
                    {TEXT_COLORS.map((tc) => (
                      <button
                        key={tc.name}
                        type="button"
                        onClick={() => {
                          restoreSelection();
                          handleTextColor(tc.color);
                          setShowColorPicker(false);
                        }}
                        className="flex w-full items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted"
                      >
                        <span
                          className="h-4 w-4 rounded-full border"
                          style={{
                            backgroundColor: tc.color || "#000",
                          }}
                        />
                        {tc.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Media */}
            <div className="flex items-center">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  saveSelection();
                  setShowImageDialog(true);
                }}
                className="h-7 w-7 p-0"
                title="Insert image"
              >
                <ImageIcon className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  saveSelection();
                  setShowTableDialog(true);
                }}
                className="h-7 w-7 p-0"
                title="Insert table"
              >
                <Table className="h-4 w-4" />
              </Button>
            </div>

            <span className="ml-auto text-xs text-muted-foreground hidden sm:inline">
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
          className="rich-editor-content text-sm outline-none"
          suppressContentEditableWarning
        />
        {isEmpty && (
          <div className="pointer-events-none absolute left-3 top-3 text-sm text-muted-foreground">
            {placeholder}
          </div>
        )}
      </div>

      {/* Image Insert Dialog */}
      <ImageInsertDialog
        open={showImageDialog}
        onOpenChange={setShowImageDialog}
        onInsert={insertImage}
        meetingId={meetingId}
        eventPlanId={eventPlanId}
      />

      {/* Table Insert Dialog */}
      <TableInsertDialog
        open={showTableDialog}
        onOpenChange={setShowTableDialog}
        onInsert={insertTable}
      />
    </div>
  );
}

// Image Insert Dialog Component
function ImageInsertDialog({
  open,
  onOpenChange,
  onInsert,
  meetingId,
  eventPlanId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (url: string, alt: string) => void;
  meetingId?: string;
  eventPlanId?: string;
}) {
  const [imageUrl, setImageUrl] = useState("");
  const [altText, setAltText] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleReset = () => {
    setImageUrl("");
    setAltText("");
    setError(null);
    setIsUploading(false);
  };

  const handleClose = () => {
    handleReset();
    onOpenChange(false);
  };

  const handleInsert = () => {
    if (!imageUrl.trim()) {
      setError("Please enter an image URL or upload a file");
      return;
    }
    onInsert(imageUrl.trim(), altText.trim());
    handleReset();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!meetingId || !eventPlanId) {
      setError("Cannot upload images - meeting context not available");
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("meetingId", meetingId);
      formData.append("eventPlanId", eventPlanId);

      const res = await fetch("/api/upload/meeting-notes-image", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to upload image");
      }

      const { url } = await res.json();
      setImageUrl(url);
      setAltText(file.name.replace(/\.[^/.]+$/, "")); // Use filename as alt
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload image");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Insert Image</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="image-url">Image URL</Label>
            <Input
              id="image-url"
              type="url"
              placeholder="https://example.com/image.png"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
            />
          </div>

          {meetingId && eventPlanId && (
            <>
              <div className="flex items-center gap-4">
                <div className="h-px flex-1 bg-border" />
                <span className="text-sm text-muted-foreground">or</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="w-full"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload Image
                  </>
                )}
              </Button>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="alt-text">Alt Text (optional)</Label>
            <Input
              id="alt-text"
              placeholder="Description of the image"
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
            />
          </div>

          {imageUrl && (
            <div className="rounded-lg border bg-muted/50 p-2">
              <p className="mb-2 text-xs text-muted-foreground">Preview:</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt={altText || "Preview"}
                className="max-h-40 w-full rounded object-contain"
                onError={() => setError("Could not load image from this URL")}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleInsert}
            disabled={!imageUrl.trim() || isUploading}
          >
            Insert Image
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Table Insert Dialog Component
function TableInsertDialog({
  open,
  onOpenChange,
  onInsert,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (rows: number, cols: number, hasHeader: boolean) => void;
}) {
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const [hasHeader, setHasHeader] = useState(true);

  const handleReset = () => {
    setRows(3);
    setCols(3);
    setHasHeader(true);
  };

  const handleClose = () => {
    handleReset();
    onOpenChange(false);
  };

  const handleInsert = () => {
    onInsert(rows, cols, hasHeader);
    handleReset();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Insert Table</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="table-rows">Rows</Label>
              <Input
                id="table-rows"
                type="number"
                min={2}
                max={10}
                value={rows}
                onChange={(e) => setRows(Math.max(2, Math.min(10, parseInt(e.target.value) || 2)))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="table-cols">Columns</Label>
              <Input
                id="table-cols"
                type="number"
                min={2}
                max={8}
                value={cols}
                onChange={(e) => setCols(Math.max(2, Math.min(8, parseInt(e.target.value) || 2)))}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="has-header"
              checked={hasHeader}
              onChange={(e) => setHasHeader(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="has-header" className="font-normal">
              Include header row
            </Label>
          </div>

          {/* Preview */}
          <div className="rounded-lg border bg-muted/50 p-2 overflow-auto">
            <p className="mb-2 text-xs text-muted-foreground">Preview:</p>
            <table className="w-full border-collapse text-xs">
              <tbody>
                {Array.from({ length: Math.min(rows, 4) }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: Math.min(cols, 4) }).map((_, j) => {
                      if (i === 0 && hasHeader) {
                        return (
                          <th
                            key={j}
                            className="border border-border bg-muted px-2 py-1"
                          >
                            H{j + 1}
                          </th>
                        );
                      }
                      return (
                        <td key={j} className="border border-border px-2 py-1">
                          {i + 1},{j + 1}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {(rows > 4 || cols > 4) && (
              <p className="mt-1 text-xs text-muted-foreground">
                ...and {rows > 4 ? `${rows - 4} more rows` : ""}
                {rows > 4 && cols > 4 ? ", " : ""}
                {cols > 4 ? `${cols - 4} more columns` : ""}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleInsert}>
            Insert Table
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
