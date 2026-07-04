"use client";

import { useState, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, FileText, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  onUploadComplete?: (result: UploadResult) => void;
  accept?: string;
  className?: string;
}

interface UploadResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

type UploadState = "idle" | "dragging" | "uploading" | "success" | "error";

export function FileUpload({
  onUploadComplete,
  accept = ".json,.zip",
  className,
}: FileUploadProps) {
  const [state, setState] = useState<UploadState>("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setFileName(file.name);
      setState("uploading");
      setMessage("Processing...");

      const formData = new FormData();
      formData.append("file", file);

      const name = file.name.toLowerCase();
      let sourceType = "chatgpt_export";
      if (name.includes("claude")) {
        sourceType = "claude_export";
      }
      formData.append("sourceType", sourceType);
      formData.append(
        "sourceName",
        sourceType === "chatgpt_export" ? "ChatGPT Export" : "Claude Export"
      );

      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();

        if (data.skipped) {
          setState("success");
          setMessage("This file has already been processed.");
          onUploadComplete?.({ success: true, data });
        } else if (res.ok) {
          setState("success");
          setMessage(
            `${data.memoriesExtracted} memories extracted, ${data.reviewItemsCreated} for review`
          );
          onUploadComplete?.({ success: true, data });
        } else {
          setState("error");
          setMessage(data.error || "Upload failed");
          onUploadComplete?.({ success: false, error: data.error });
        }
      } catch (err) {
        setState("error");
        setMessage("Failed to connect to server");
        onUploadComplete?.({
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },
    [onUploadComplete]
  );

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setState("idle");
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setState("dragging");
  }

  function handleDragLeave() {
    setState("idle");
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  function reset() {
    setState("idle");
    setFileName(null);
    setMessage(null);
  }

  return (
    <Card
      className={cn(
        "transition-all duration-200 border-dashed",
        state === "dragging" && "border-lime bg-lime-muted shadow-sm",
        state === "error" && "border-destructive/40",
        state === "success" && "border-lime/40",
        className
      )}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <CardContent className="flex flex-col items-center justify-center py-10 px-4 text-center">
        {state === "idle" || state === "dragging" ? (
          <>
            <div className={cn(
              "flex h-12 w-12 items-center justify-center rounded-xl mb-4 transition-colors",
              state === "dragging" ? "bg-lime/20" : "bg-muted"
            )}>
              <Upload
                className={cn(
                  "h-5 w-5",
                  state === "dragging" ? "text-lime-foreground" : "text-muted-foreground"
                )}
              />
            </div>
            <p className="text-sm font-medium">
              {state === "dragging"
                ? "Drop your file here"
                : "Drag & drop a conversation export"}
            </p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              ChatGPT (.zip or .json) or Claude (.json)
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => inputRef.current?.click()}
            >
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              Browse Files
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept={accept}
              className="hidden"
              onChange={handleInputChange}
            />
          </>
        ) : state === "uploading" ? (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-lime/15 mb-4">
              <Loader2 className="h-5 w-5 text-lime-foreground animate-spin" />
            </div>
            <p className="text-sm font-medium">{fileName}</p>
            <p className="text-xs text-muted-foreground mt-1">{message}</p>
            <Progress value={null} className="w-48 mt-4" />
          </>
        ) : state === "success" ? (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-lime/15 mb-4">
              <CheckCircle className="h-5 w-5 text-lime-foreground" />
            </div>
            <p className="text-sm font-medium">{fileName}</p>
            <p className="text-xs text-muted-foreground mt-1">{message}</p>
            <Button variant="outline" size="sm" className="mt-4 h-8 text-xs" onClick={reset}>
              Upload Another
            </Button>
          </>
        ) : (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10 mb-4">
              <XCircle className="h-5 w-5 text-destructive" />
            </div>
            <p className="text-sm font-medium">Upload Failed</p>
            <p className="text-xs text-destructive mt-1">{message}</p>
            <Button variant="outline" size="sm" className="mt-4 h-8 text-xs" onClick={reset}>
              Try Again
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
