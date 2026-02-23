import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter, Routes, Route, useLocation, useNavigate, Navigate } from "react-router-dom";
import { isElectron, getElectronAPI } from "@/lib/electron-api";
import { useEffect, useRef } from "react";
import { useRecording } from "@/contexts/RecordingContext";
import { ModelSettingsProvider } from "@/contexts/ModelSettingsContext";
import { FolderProvider } from "@/contexts/FolderContext";
import { NotesProvider } from "@/contexts/NotesContext";
import { RecordingProvider } from "@/contexts/RecordingContext";
import { CalendarProvider } from "@/contexts/CalendarContext";
import { GlobalRecordingBanner } from "@/components/GlobalRecordingBanner";
import { loadPreferences, applyAppearance } from "@/pages/SettingsPage";
import { isOnboardingComplete } from "@/pages/OnboardingPage";
import Index from "./pages/Index";
import AllNotes from "./pages/AllNotes";
import AskSyag from "./pages/AskSyag";

import NewNotePage from "./pages/NewNotePage";
import CalendarPage from "./pages/CalendarPage";
import SettingsPage from "./pages/SettingsPage";
import OnboardingPage from "./pages/OnboardingPage";
import NotFound from "./pages/NotFound";
import { TrayMenu } from "@/components/TrayMenu";
import { MeetingDetectionHandler } from "@/components/MeetingDetectionHandler";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const queryClient = new QueryClient();

// Apply saved theme on load
const initialPrefs = loadPreferences();
applyAppearance(initialPrefs.appearance);

// Listen for system theme changes when "system" mode is active
if (initialPrefs.appearance === "system") {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (loadPreferences().appearance === "system") applyAppearance("system");
  });
}

function TrayNavigationHandler() {
  const api = getElectronAPI();
  const navigate = useNavigate();
  const { activeSession, pauseAudioCapture } = useRecording();
  const activeSessionRef = useRef(activeSession);
  activeSessionRef.current = activeSession;

  useEffect(() => {
    if (!api) return;

    const cleanupNav = api.app.onTrayNavigateToMeeting?.(() => {
      if (activeSessionRef.current?.noteId) {
        navigate(`/new-note?session=${activeSessionRef.current.noteId}`);
      }
    });

    const cleanupStartRecording = api.app.onTrayStartRecording?.((data) => {
      navigate("/new-note?startFresh=1", { state: { startFresh: true, eventTitle: data?.title } });
    });

    const cleanupPause = api.app.onTrayPauseRecording?.(() => {
      pauseAudioCapture();
    });

    const cleanupMeetingEnded = api.app.onMeetingEnded?.(() => {
      const session = activeSessionRef.current;
      if (session?.noteId && session?.isRecording) {
        pauseAudioCapture().then(() => {
          navigate(`/new-note?session=${session.noteId}`, {
            state: { triggerPauseAndSummarize: true },
          });
        });
      }
    });

    const cleanupActionReminder = api.app.onActionReminderOpenNote?.(({ noteId }) => {
      navigate(`/note/${noteId}`);
    });

    return () => {
      cleanupNav?.();
      cleanupStartRecording?.();
      cleanupPause?.();
      cleanupMeetingEnded?.();
      cleanupActionReminder?.();
    };
  }, [api, navigate, pauseAudioCapture]);

  return null;
}

function AppContent() {
  const location = useLocation();
  const isOnRecordingPage = location.pathname === "/new-note" || location.pathname.startsWith("/note/");
  const onboardingDone = isOnboardingComplete();

  if (!onboardingDone && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <>
      {!isOnRecordingPage && <GlobalRecordingBanner />}
      <MeetingDetectionHandler />
      <TrayNavigationHandler />
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/" element={<Index />} />
        <Route path="/notes" element={<AllNotes />} />
        <Route path="/ask" element={<AskSyag />} />
        
        <Route path="/note/:id" element={
          <ErrorBoundary>
            <NewNotePage />
          </ErrorBoundary>
        } />
        <Route path="/new-note" element={
          <ErrorBoundary>
            <NewNotePage />
          </ErrorBoundary>
        } />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/tray-preview" element={
          <div className="flex items-center justify-center min-h-screen bg-muted/50">
            <TrayMenu />
          </div>
        } />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ModelSettingsProvider>
    <FolderProvider>
    <NotesProvider>
    <RecordingProvider>
    <CalendarProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        {isElectron ? (
          <HashRouter>
            <AppContent />
          </HashRouter>
        ) : (
          <BrowserRouter>
            <AppContent />
          </BrowserRouter>
        )}
      </TooltipProvider>
    </CalendarProvider>
    </RecordingProvider>
    </NotesProvider>
    </FolderProvider>
    </ModelSettingsProvider>
  </QueryClientProvider>
);

export default App;
