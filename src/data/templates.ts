export const BUILTIN_TEMPLATES = [
  { id: "general", name: "General", icon: "📋" },
  { id: "standup", name: "Standup", icon: "🏃" },
  { id: "one-on-one", name: "1:1", icon: "🤝" },
  { id: "brainstorm", name: "Brainstorm", icon: "💡" },
  { id: "customer-call", name: "Customer Call", icon: "📞" },
  { id: "interview", name: "Interview", icon: "🎯" },
  { id: "retrospective", name: "Retro", icon: "🔄" },
] as const;

export const BUILTIN_TEMPLATE_IDS = new Set(BUILTIN_TEMPLATES.map((t) => t.id));
