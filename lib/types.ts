export type Role = "user" | "assistant";

export type Message = {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  error?: string;
};

export type ChatStatus = "idle" | "streaming" | "error";

export type Chat = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
};

export type ChatsState = {
  chats: Chat[];
  activeId: string | null;
};

export type ChatRequestBody = {
  messages: Array<Pick<Message, "role" | "content">>;
};
