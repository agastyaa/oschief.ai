import { useNavigate } from "react-router-dom";
import { useShortcut } from "@/lib/keyboard/ShortcutContext";
import { useSearchCommand } from "@/components/SearchCommand";
import { useSidebarVisibility } from "@/contexts/SidebarVisibilityContext";
import { useRecording } from "@/contexts/RecordingContext";

/**
 * Binds every global shortcut to the action it should fire. One component
 * keeps the wiring in a single, grep-able place so the registry and the
 * handlers never drift.
 *
 * Scope-specific bindings (note detail, coaching, notes list) live in the
 * components that own those features — they call useShortcut directly.
 */
export function GlobalShortcutBinder() {
  const navigate = useNavigate();
  const { open: openSearch } = useSearchCommand();
  const { toggleSidebar } = useSidebarVisibility();
  const { activeSession, pauseAudioCapture, stopAudioCapture } = useRecording();

  useShortcut("app.search", () => openSearch());
  useShortcut("app.toggle-sidebar", () => toggleSidebar());
  useShortcut("app.new-note", () => navigate("/new-note?startFresh=1", { state: { startFresh: true } }));
  useShortcut("app.go-home", () => navigate("/"));
  useShortcut("app.go-notes", () => navigate("/notes"));
  useShortcut("app.go-commitments", () => navigate("/commitments"));
  useShortcut("app.go-people", () => navigate("/people"));
  useShortcut("app.go-calendar", () => navigate("/calendar"));
  useShortcut("app.go-settings", () => navigate("/settings"));

  // Recording toggle — start or stop depending on state.
  useShortcut(
    "recording.toggle",
    () => {
      if (activeSession?.isRecording) {
        void stopAudioCapture();
      } else {
        navigate("/new-note?startFresh=1", { state: { startFresh: true } });
      }
    },
    { enabled: true },
  );

  useShortcut(
    "recording.pause",
    () => {
      if (activeSession?.isRecording) pauseAudioCapture();
    },
    { enabled: !!activeSession?.isRecording },
  );

  return null;
}
