import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCalendar } from "@/contexts/CalendarContext";
import { Upload, Link2, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

interface ICSDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ICSDialog({ open, onOpenChange }: ICSDialogProps) {
  const { importFromFile, importFromUrl, isLoading, error } = useCalendar();
  const [tab, setTab] = useState<"file" | "url">("file");
  const [url, setUrl] = useState("");
  const [success, setSuccess] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      importFromFile(reader.result as string, file.name);
      setSuccess(true);
      setTimeout(() => { setSuccess(false); onOpenChange(false); }, 1200);
    };
    reader.readAsText(file);
  };

  const handleUrl = async () => {
    if (!url.trim()) return;
    await importFromUrl(url.trim());
    if (!error) {
      setSuccess(true);
      setTimeout(() => { setSuccess(false); onOpenChange(false); }, 1200);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Import Calendar</DialogTitle>
          <DialogDescription>Upload an .ics file or paste an ICS feed URL from Google Calendar, Outlook, or Apple Calendar.</DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 rounded-lg bg-secondary p-1">
          <button
            onClick={() => setTab("file")}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${tab === "file" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Upload className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
            Upload File
          </button>
          <button
            onClick={() => setTab("url")}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${tab === "url" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Link2 className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
            Paste URL
          </button>
        </div>

        {/* Content */}
        <div className="space-y-3 pt-1">
          {tab === "file" ? (
            <>
              <div
                onClick={() => fileRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border py-8 cursor-pointer hover:border-accent/40 hover:bg-secondary/50 transition-colors"
              >
                <Upload className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Click to select an .ics file</p>
                <p className="text-[11px] text-muted-foreground/60">Supports Google, Outlook & Apple exports</p>
              </div>
              <input ref={fileRef} type="file" accept=".ics,.ical,text/calendar" className="hidden" onChange={handleFile} />
            </>
          ) : (
            <>
              <Input
                placeholder="https://calendar.google.com/...basic.ics"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Find your ICS URL in Google Calendar → Settings → Calendar → Secret address in iCal format
              </p>
              <Button onClick={handleUrl} disabled={isLoading || !url.trim()} className="w-full" size="sm">
                {isLoading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Fetching...</> : "Import Calendar"}
              </Button>
            </>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              {error}
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 rounded-md bg-accent/10 px-3 py-2 text-xs text-accent">
              <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
              Calendar imported successfully!
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
