import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { ModelSettingsProvider } from "@/contexts/ModelSettingsContext";
import { FolderProvider } from "@/contexts/FolderContext";
import { NotesProvider } from "@/contexts/NotesContext";
import { RecordingProvider } from "@/contexts/RecordingContext";
import { GlobalRecordingBanner } from "@/components/GlobalRecordingBanner";
import { isOnboardingComplete } from "@/pages/OnboardingPage";
import Index from "./pages/Index";
import AllNotes from "./pages/AllNotes";
import AskSyag from "./pages/AskSyag";

import NewNotePage from "./pages/NewNotePage";
import CalendarPage from "./pages/CalendarPage";
import SettingsPage from "./pages/SettingsPage";
import NoteDetailPage from "./pages/NoteDetailPage";
import OnboardingPage from "./pages/OnboardingPage";
import NotFound from "./pages/NotFound";
import { TrayMenu } from "@/components/TrayMenu";

const queryClient = new QueryClient();

function AppContent() {
  const location = useLocation();
  const isOnRecordingPage = location.pathname === "/new-note";
  const onboardingDone = isOnboardingComplete();

  if (!onboardingDone && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <>
      {!isOnRecordingPage && <GlobalRecordingBanner />}
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/" element={<Index />} />
        <Route path="/notes" element={<AllNotes />} />
        <Route path="/ask" element={<AskSyag />} />
        
        <Route path="/note/:id" element={<NoteDetailPage />} />
        <Route path="/new-note" element={<NewNotePage />} />
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
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </TooltipProvider>
    </RecordingProvider>
    </NotesProvider>
    </FolderProvider>
    </ModelSettingsProvider>
  </QueryClientProvider>
);

export default App;
