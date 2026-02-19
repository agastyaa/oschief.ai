import { useParams, useNavigate } from "react-router-dom";
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
        <p className="text-[13px] text-muted-foreground">Meeting not found</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-8">
          <button
            onClick={() => navigate(-1)}
            className="mb-5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Back
          </button>
          <MeetingDetail meeting={meeting} />
        </div>
      </main>
    </div>
  );
}
