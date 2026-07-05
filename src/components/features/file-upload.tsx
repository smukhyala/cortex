"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, FileText, CheckCircle, XCircle, Loader2 } from "lucide-react";

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

export function FileUpload({ onUploadComplete, accept = ".json,.zip", className }: FileUploadProps) {
  const [state, setState] = useState<UploadState>("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name);
    setState("uploading");
    setMessage("Extracting memories...");

    const formData = new FormData();
    formData.append("file", file);
    const name = file.name.toLowerCase();
    let sourceType = "chatgpt_export";
    if (name.includes("claude")) sourceType = "claude_export";
    formData.append("sourceType", sourceType);
    formData.append("sourceName", sourceType === "chatgpt_export" ? "ChatGPT Export" : "Claude Export");

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.skipped) {
        setState("success");
        setMessage("Already processed — no new memories.");
        onUploadComplete?.({ success: true, data });
      } else if (res.ok) {
        setState("success");
        setMessage(`${data.memoriesExtracted} memories extracted, ${data.reviewItemsCreated} for review`);
        onUploadComplete?.({ success: true, data });
      } else {
        setState("error");
        setMessage(data.error || "Upload failed");
        onUploadComplete?.({ success: false, error: data.error });
      }
    } catch (err) {
      setState("error");
      setMessage("Failed to connect to server");
      onUploadComplete?.({ success: false, error: err instanceof Error ? err.message : "Unknown error" });
    }
  }, [onUploadComplete]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setState("idle");
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleDragOver(e: React.DragEvent) { e.preventDefault(); setState("dragging"); }
  function handleDragLeave() { setState("idle"); }
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }
  function reset() { setState("idle"); setFileName(null); setMessage(null); }

  return (
    <div
      className={`rounded-xl border-2 border-dashed transition-all duration-200 bg-card ${
        state === "dragging"
          ? "border-lime bg-lime/5 shadow-lg scale-[1.01]"
          : state === "error"
            ? "border-red-300"
            : state === "success"
              ? "border-lime/50"
              : "border-border hover:border-muted-foreground/25"
      } ${className || ""}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <div className="flex flex-col items-center justify-center py-8 px-6 text-center">
        {state === "idle" || state === "dragging" ? (
          <>
            <div className={`h-14 w-14 rounded-2xl flex items-center justify-center mb-5 transition-all ${
              state === "dragging" ? "bg-lime/15 scale-110" : "bg-muted"
            }`}>
              <Upload className={`h-5 w-5 ${state === "dragging" ? "text-lime" : "text-muted-foreground"}`} />
            </div>
            <p className="text-[15px] font-bold tracking-tight" style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}>
              {state === "dragging" ? "Drop your file here" : "Drop a conversation export"}
            </p>
            <p className="text-[13px] text-muted-foreground mt-1.5 mb-6">
              ChatGPT (.zip or .json) &middot; Claude (.json)
            </p>
            <button className="maze-btn-outline maze-btn" onClick={() => inputRef.current?.click()}>
              <FileText className="h-3.5 w-3.5" />
              Browse Files
            </button>
            <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={handleInputChange} />
          </>
        ) : state === "uploading" ? (
          <>
            <div className="h-14 w-14 rounded-2xl bg-lime/10 flex items-center justify-center mb-5">
              <Loader2 className="h-5 w-5 text-lime animate-spin" />
            </div>
            <p className="text-[15px] font-bold tracking-tight" style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}>{fileName}</p>
            <p className="text-[13px] text-muted-foreground mt-1.5">{message}</p>
            <div className="w-48 h-1.5 bg-muted rounded-full mt-6 overflow-hidden">
              <div className="h-full bg-lime rounded-full animate-pulse w-2/3" />
            </div>
          </>
        ) : state === "success" ? (
          <>
            <div className="h-14 w-14 rounded-2xl bg-lime/10 flex items-center justify-center mb-5">
              <CheckCircle className="h-5 w-5 text-lime" />
            </div>
            <p className="text-[15px] font-bold tracking-tight" style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}>{fileName}</p>
            <p className="text-[13px] text-muted-foreground mt-1.5">{message}</p>
            <button className="maze-btn mt-6" onClick={reset}>Upload Another</button>
          </>
        ) : (
          <>
            <div className="h-14 w-14 rounded-2xl bg-red-50 flex items-center justify-center mb-5">
              <XCircle className="h-5 w-5 text-red-500" />
            </div>
            <p className="text-[15px] font-bold tracking-tight" style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}>Upload Failed</p>
            <p className="text-[13px] text-red-500 mt-1.5">{message}</p>
            <button className="maze-btn mt-6" onClick={reset}>Try Again</button>
          </>
        )}
      </div>
    </div>
  );
}
