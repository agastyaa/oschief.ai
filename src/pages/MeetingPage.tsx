import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { MeetingDetail } from "@/components/MeetingDetail";
import { meetings } from "@/data/meetings";

export default function MeetingPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const meeting = meetings.find((m) => m.id === id);

  if (!meeting) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Meeting not found</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-8 py-10">
          <button
            onClick={() => navigate(-1)}
            className="mb-6 flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <MeetingDetail meeting={meeting} />
        </div>
      </main>
    </div>
  );
}
