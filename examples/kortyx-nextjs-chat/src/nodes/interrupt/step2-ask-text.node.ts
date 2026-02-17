import { useInterrupt, useStructuredData } from "kortyx";

export const step2AskTextNode = async () => {
  const picked = await useInterrupt({
    request: {
      kind: "text",
      question: "Type a short answer:",
    },
  });

  const text = String(picked ?? "").trim();

  useStructuredData({
    dataType: "hooks",
    data: {
      step: "ask-text",
      text,
      length: text.length,
    },
  });

  return {
    data: { text },
    ui: { message: text ? `You wrote: ${text}` : "No text provided." },
  };
};
