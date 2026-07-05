"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, FileText, CheckCircle, XCircle, Loader2 } from "lucide-react";

interface FileUploadProps {
  onUploadComplete?: (result: UploadResult) => void;
  accept?: string;
  className?: string;
  /** Override auto-detected source type (e.g. "claude_export", "chatgpt_export") */
  sourceType?: string;
  /** Override auto-detected source name */
  sourceName?: string;
  /** Compact mode for embedding in dialogs */
  compact?: boolean;
}

interface UploadResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

type UploadState = "idle" | "dragging" | "uploading" | "success" | "error";

export function FileUpload({ onUploadComplete, accept = ".json,.zip", className, sourceType: sourceTypeProp, sourceName: sourceNameProp, compact }: FileUploadProps) {
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
    let sourceType = sourceTypeProp;
    if (!sourceType) {
      const name = file.name.toLowerCase();
      sourceType = name.includes("claude") ? "claude_export" : "chatgpt_export";
    }
    const sourceName = sourceNameProp || (sourceType === "chatgpt_export" ? "ChatGPT Export" : "Claude Export");
    formData.append("sourceType", sourceType);
    formData.append("sourceName", sourceName);

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
      <div className={`flex flex-col items-center justify-center text-center ${compact ? "py-5 px-4" : "py-8 px-6"}`}>
        {state === "idle" || state === "dragging" ? (
          <>
            <div className={`${compact ? "h-10 w-10 rounded-xl mb-3" : "h-14 w-14 rounded-2xl mb-5"} flex items-center justify-center transition-all ${
              state === "dragging" ? "bg-lime/15 scale-110" : "bg-muted"
            }`}>
              <Upload className={`${compact ? "h-4 w-4" : "h-5 w-5"} ${state === "dragging" ? "text-lime" : "text-muted-foreground"}`} />
            </div>
            <p className={`${compact ? "text-[13px]" : "text-[15px]"} font-bold tracking-tight`} style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}>
              {state === "dragging" ? "Drop your file here" : "Drop a conversation export"}
            </p>
            <p className={`text-[13px] text-muted-foreground mt-1.5 ${compact ? "mb-3" : "mb-6"}`}>
              ChatGPT (.zip or .json) &middot; Claude (.json)
            </p>
            <button className={`maze-btn-outline maze-btn ${compact ? "h-8 text-xs" : ""}`} onClick={() => inputRef.current?.click()}>
              <FileText className="h-3.5 w-3.5" />
              Browse Files
            </button>
            <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={handleInputChange} />
          </>
        ) : state === "uploading" ? (
          <>
            <div className={`${compact ? "h-10 w-10 rounded-xl mb-3" : "h-14 w-14 rounded-2xl mb-5"} bg-lime/10 flex items-center justify-center`}>
              <Loader2 className={`${compact ? "h-4 w-4" : "h-5 w-5"} text-lime animate-spin`} />
            </div>
            <p className={`${compact ? "text-[13px]" : "text-[15px]"} font-bold tracking-tight`} style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}>{fileName}</p>
            <p className="text-[13px] text-muted-foreground mt-1.5">{message}</p>
            <div className={`w-48 h-1.5 bg-muted rounded-full overflow-hidden ${compact ? "mt-3" : "mt-6"}`}>
              <div className="h-full bg-lime rounded-full animate-pulse w-2/3" />
            </div>
          </>
        ) : state === "success" ? (
          <>
            <div className={`${compact ? "h-10 w-10 rounded-xl mb-3" : "h-14 w-14 rounded-2xl mb-5"} bg-lime/10 flex items-center justify-center`}>
              <CheckCircle className={`${compact ? "h-4 w-4" : "h-5 w-5"} text-lime`} />
            </div>
            <p className={`${compact ? "text-[13px]" : "text-[15px]"} font-bold tracking-tight`} style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}>{fileName}</p>
            <p className="text-[13px] text-muted-foreground mt-1.5">{message}</p>
            <button className={`maze-btn ${compact ? "mt-3 h-8 text-xs" : "mt-6"}`} onClick={reset}>Upload Another</button>
          </>
        ) : (
          <>
            <div className={`${compact ? "h-10 w-10 rounded-xl mb-3" : "h-14 w-14 rounded-2xl mb-5"} bg-red-50 flex items-center justify-center`}>
              <XCircle className={`${compact ? "h-4 w-4" : "h-5 w-5"} text-red-500`} />
            </div>
            <p className={`${compact ? "text-[13px]" : "text-[15px]"} font-bold tracking-tight`} style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}>Upload Failed</p>
            <p className="text-[13px] text-red-500 mt-1.5">{message}</p>
            <button className={`maze-btn ${compact ? "mt-3 h-8 text-xs" : "mt-6"}`} onClick={reset}>Try Again</button>
          </>
        )}
      </div>
    </div>
  );
}
