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

      // Detect source type
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
        "transition-colors",
        state === "dragging" && "border-primary bg-primary/5",
        state === "error" && "border-red-300",
        state === "success" && "border-green-300",
        className
      )}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <CardContent className="flex flex-col items-center justify-center py-8 px-4 text-center">
        {state === "idle" || state === "dragging" ? (
          <>
            <Upload
              className={cn(
                "h-10 w-10 mb-3",
                state === "dragging"
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
            />
            <p className="text-sm font-medium">
              {state === "dragging"
                ? "Drop your file here"
                : "Drag & drop a conversation export"}
            </p>
            <p className="text-xs text-muted-foreground mt-1 mb-3">
              ChatGPT (.zip or .json) or Claude (.json)
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
            >
              <FileText className="h-4 w-4 mr-1" />
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
            <Loader2 className="h-10 w-10 text-primary animate-spin mb-3" />
            <p className="text-sm font-medium">{fileName}</p>
            <p className="text-xs text-muted-foreground mt-1">{message}</p>
            <Progress value={null} className="w-48 mt-3" />
          </>
        ) : state === "success" ? (
          <>
            <CheckCircle className="h-10 w-10 text-green-500 mb-3" />
            <p className="text-sm font-medium">{fileName}</p>
            <p className="text-xs text-muted-foreground mt-1">{message}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={reset}>
              Upload Another
            </Button>
          </>
        ) : (
          <>
            <XCircle className="h-10 w-10 text-red-500 mb-3" />
            <p className="text-sm font-medium">Upload Failed</p>
            <p className="text-xs text-red-600 mt-1">{message}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={reset}>
              Try Again
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
