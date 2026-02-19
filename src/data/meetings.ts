export interface Meeting {
  id: string;
  title: string;
  date: string;
  time: string;
  duration: string;
  participants: string[];
  summary: string;
  keyPoints: string[];
  actionItems: { text: string; assignee: string; done: boolean }[];
  transcript?: string;
  tags: string[];
}

export const meetings: Meeting[] = [];
