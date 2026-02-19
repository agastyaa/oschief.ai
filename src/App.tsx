import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ModelSettingsProvider } from "@/contexts/ModelSettingsContext";
import Index from "./pages/Index";
import AllNotes from "./pages/AllNotes";
import AskGranola from "./pages/AskGranola";
import MeetingPage from "./pages/MeetingPage";
import NewNotePage from "./pages/NewNotePage";
import CalendarPage from "./pages/CalendarPage";
import SettingsPage from "./pages/SettingsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ModelSettingsProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
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
        </BrowserRouter>
      </TooltipProvider>
    </ModelSettingsProvider>
  </QueryClientProvider>
);

export default App;
