import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter, Routes, Route, useLocation, useNavigate, Navigate } from "react-router-dom";
import { isElectron, getElectronAPI } from "@/lib/electron-api";
import { useEffect, lazy, Suspense } from "react";
import { useRecording } from "@/contexts/RecordingContext";
import { ModelSettingsProvider } from "@/contexts/ModelSettingsContext";
import { FolderProvider } from "@/contexts/FolderContext";
import { NotesProvider } from "@/contexts/NotesContext";
import { RecordingProvider } from "@/contexts/RecordingContext";
import { CalendarProvider } from "@/contexts/CalendarContext";
import { SidebarVisibilityProvider } from "@/contexts/SidebarVisibilityContext";
import { loadPreferences, applyAppearance } from "@/pages/SettingsPage";
import { isOnboardingComplete } from "@/pages/OnboardingPage";
import { AppShell } from "@/components/AppShell";

// Eager imports — critical paths that must be immediately available
import Index from "./pages/Index";
import NewNotePage from "./pages/NewNotePage";
import OnboardingPage from "./pages/OnboardingPage";

// Lazy imports — loaded on first navigation, reduces initial JS parse/compile
const AllNotes = lazy(() => import("./pages/AllNotes"));
const AskSyag = lazy(() => import("./pages/AskSyag"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const CoachingPage = lazy(() => import("./pages/CoachingPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const NoteDetailPage = lazy(() => import("./pages/NoteDetailPage"));
const PeoplePage = lazy(() => import("./pages/PeoplePage"));
const CommitmentsPage = lazy(() => import("./pages/CommitmentsPage"));
const ProjectsPage = lazy(() => import("./pages/ProjectsPage"));
const ProjectDetailPage = lazy(() => import("./pages/ProjectDetailPage"));
const RoutinesPage = lazy(() => import("./pages/RoutinesPage"));
const DecisionsPage = lazy(() => import("./pages/DecisionsPage"));
const MeetingSeriesPage = lazy(() => import("./pages/MeetingSeriesPage"));
const WeeklyDigestPage = lazy(() => import("./pages/WeeklyDigestPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const TrayAgendaPage = lazy(() => import("./pages/TrayAgendaPage"));
import { TrayMenu } from "@/components/TrayMenu";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SearchCommandProvider } from "@/components/SearchCommand";

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

  useEffect(() => {
    if (!api) return;

    const cleanupNav = api.app.onTrayNavigateToMeeting?.(() => {
      if (activeSession?.noteId) {
        navigate(`/new-note?session=${activeSession.noteId}`);
      }
    });

    const cleanupStartRecording = api.app.onTrayStartRecording?.(() => {
      navigate("/new-note?startFresh=1", { state: { startFresh: true } });
    });

    const cleanupPause = api.app.onTrayPauseRecording?.(() => {
      pauseAudioCapture();
    });

    const cleanupAgendaNav = api.app.onTrayAgendaNavigate?.((data) => {
      navigate(`${data.path}${data.search ?? ""}`);
    });

    const cleanupAgendaOpen = api.app.onTrayAgendaOpenEvent?.((payload) => {
      if (payload.openMode === "calendar") {
        navigate("/calendar");
        return;
      }
      if (payload.noteId) {
        navigate(`/note/${payload.noteId}`);
        return;
      }
      navigate("/new-note", { state: { eventTitle: payload.title, eventId: payload.eventId } });
    });

    return () => {
      cleanupNav?.();
      cleanupStartRecording?.();
      cleanupPause?.();
      cleanupAgendaNav?.();
      cleanupAgendaOpen?.();
    };
  }, [api, activeSession?.noteId, navigate, pauseAudioCapture]);

  return null;
}

function AppContent() {
  const location = useLocation();
  const onboardingDone = isOnboardingComplete();

  if (!onboardingDone && location.pathname !== "/onboarding" && location.pathname !== "/tray-agenda") {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <>
      <TrayNavigationHandler />
      <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="animate-pulse text-muted-foreground text-sm">Loading...</div></div>}>
        <Routes>
          {/* Standalone pages — no AppShell */}
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/tray-agenda" element={<TrayAgendaPage />} />
          <Route path="/tray-preview" element={
            <div className="flex items-center justify-center min-h-screen bg-muted/50">
              <TrayMenu />
            </div>
          } />

          {/* All main pages inside AppShell */}
          <Route element={<AppShell />}>
            <Route path="/" element={<Index />} />
            <Route path="/notes" element={<AllNotes />} />
            <Route path="/ask" element={<AskSyag />} />
            <Route path="/note/:id" element={<NoteDetailPage />} />
            <Route path="/new-note" element={
              <ErrorBoundary>
                <NewNotePage />
              </ErrorBoundary>
            } />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/coaching" element={<CoachingPage />} />
            <Route path="/people" element={<PeoplePage />} />
            <Route path="/commitments" element={<CommitmentsPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/project/:id" element={<ProjectDetailPage />} />
            <Route path="/routines" element={<RoutinesPage />} />
            <Route path="/digest" element={<WeeklyDigestPage />} />
            <Route path="/decisions" element={<DecisionsPage />} />
            <Route path="/series" element={<MeetingSeriesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
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
            <SidebarVisibilityProvider>
              <SearchCommandProvider>
                <AppContent />
              </SearchCommandProvider>
            </SidebarVisibilityProvider>
          </HashRouter>
        ) : (
          <BrowserRouter>
            <SidebarVisibilityProvider>
              <SearchCommandProvider>
                <AppContent />
              </SearchCommandProvider>
            </SidebarVisibilityProvider>
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
