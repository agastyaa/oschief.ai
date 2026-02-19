import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { ModelSettingsProvider } from "@/contexts/ModelSettingsContext";
import { FolderProvider } from "@/contexts/FolderContext";
import { NotesProvider } from "@/contexts/NotesContext";
import { RecordingProvider } from "@/contexts/RecordingContext";
import { GlobalRecordingBanner } from "@/components/GlobalRecordingBanner";
import Index from "./pages/Index";
import AllNotes from "./pages/AllNotes";
import AskGranola from "./pages/AskGranola";
import MeetingPage from "./pages/MeetingPage";
import NewNotePage from "./pages/NewNotePage";
import CalendarPage from "./pages/CalendarPage";
import SettingsPage from "./pages/SettingsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AppContent() {
  const location = useLocation();
  const isOnRecordingPage = location.pathname === "/new-note";

  return (
    <>
      {!isOnRecordingPage && <GlobalRecordingBanner />}
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/notes" element={<AllNotes />} />
        <Route path="/ask" element={<AskGranola />} />
        <Route path="/meeting/:id" element={<MeetingPage />} />
        <Route path="/new-note" element={<NewNotePage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/settings" element={<SettingsPage />} />
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
