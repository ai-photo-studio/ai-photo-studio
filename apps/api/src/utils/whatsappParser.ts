export type ParsedMessageType = "text" | "image" | "interactive" | "unknown";

export type ParsedWebhookMessage = {
  type: ParsedMessageType;
  from: string;
  text?: string;
  imageId?: string;
  interactiveReplyId?: string;
  interactiveReplyTitle?: string;
};

export const parseWhatsAppWebhook = (payload: unknown): ParsedWebhookMessage[] => {
  const data = payload as any;
  const entries = Array.isArray(data?.entry) ? data.entry : [];
  const output: ParsedWebhookMessage[] = [];

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const messages = Array.isArray(change?.value?.messages) ? change.value.messages : [];
      for (const msg of messages) {
        const base = { from: String(msg?.from || "") };
        if (!base.from) continue;

        if (msg?.type === "text") {
          output.push({ ...base, type: "text", text: String(msg?.text?.body || "") });
          continue;
        }

        if (msg?.type === "image") {
          output.push({ ...base, type: "image", imageId: String(msg?.image?.id || "") });
          continue;
        }

        if (msg?.type === "interactive") {
          const button = msg?.interactive?.button_reply;
          const list = msg?.interactive?.list_reply;
          output.push({
            ...base,
            type: "interactive",
            interactiveReplyId: String(button?.id || list?.id || ""),
            interactiveReplyTitle: String(button?.title || list?.title || "")
          });
          continue;
        }

        output.push({ ...base, type: "unknown" });
      }
    }
  }

  return output;
};
