import WebSocket from "ws";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

const useAi = {
  domain: "agents.use.ai",

  headers: {
    Host: "agents.use.ai",
    "User-Agent":
      "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/116.0.0.0 Mobile Safari/537.36",
    Origin: "https://use.ai",
  },

  generateMessageId() {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < 15; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },

  async chat(q) {
    return new Promise((resolve, reject) => {
      const guestId = `guest:${randomUUID()}`;
      const chatId = randomUUID();
      const messageId = this.generateMessageId();
      const deviceId = randomUUID();
      const mixpanelUserId = randomUUID();

      const wsUrl = `wss://${this.domain}/agents/budget-agent/${chatId}?userId=${encodeURIComponent(
        guestId
      )}&userType=guest&planType=free&isTestUser=false`;

      const ws = new WebSocket(wsUrl, { headers: this.headers });

      let fullResponse = "";
      let chatMetadata = null;
      let streamId = "";

      const timeout = setTimeout(() => {
        ws.close();
        reject({ error: "Request timeout" });
      }, 55000);

      ws.on("open", () => {
        ws.send(
          JSON.stringify({
            type: "prewarm",
            chatId,
          })
        );

        setTimeout(() => {
          ws.send(
            JSON.stringify({
              abortSignal: {},
              chatId,
              userId: guestId,
              userType: "guest",
              planType: "free",
              isFreemium: false,
              isTestUser: false,
              mixpanelUserId,
              deviceId,
              isMobile: true,
              isWebSearchMode: false,
              isDeepResearchMode: false,
              isImageGenerationMode: false,
              isStandaloneImageMode: false,
              needsBlurPreview: false,
              deepResearchProcessor: "pro-fast",
              selectedModel: "gateway-gpt-5.5",
              disableReasoning: false,
              locale: "en",
              messages: [
                {
                  parts: [{ type: "text", text: q }],
                  id: messageId,
                  role: "user",
                  metadata: {
                    isDeepResearchMode: false,
                    isWebSearchMode: false,
                    isImageGenerationMode: false,
                    needsBlurPreview: false,
                    deepResearchProcessor: "pro-fast",
                  },
                },
              ],
              trigger: "submit-message",
              source: "chat_page",
            })
          );
        }, 1000);
      });

      ws.on("message", (data) => {
        let response;

        try {
          response = JSON.parse(data.toString());
        } catch {
          return;
        }

        if (response.type === "data-chat-metadata") {
          chatMetadata = response.data;
        }

        if (response.type === "stream-start") {
          streamId = response.streamId;
        }

        if (response.chunk?.type === "text-delta") {
          fullResponse += response.chunk.delta;
        }

        if (response.type === "stream-complete") {
          clearTimeout(timeout);
          ws.close();

          resolve({
            id: chatId,
            message: fullResponse,
            streamId,
            metadata: chatMetadata,
            timestamp: new Date().toISOString(),
          });
        }

        if (response.type === "rate-limit-error") {
          clearTimeout(timeout);
          ws.close();
          reject({
            error: "Rate limit hit",
            details: response.messageMetadata,
          });
        }
      });

      ws.on("error", (error) => {
        clearTimeout(timeout);
        reject({
          error: "WebSocket error",
          details: error.message,
        });
      });
    });
  },
};

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");

  if (!q) {
    return Response.json(
      { error: "Missing q parameter" },
      { status: 400 }
    );
  }

  try {
    const result = await useAi.chat(q);
    return Response.json(result);
  } catch (err) {
    return Response.json(err, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const q = body.q;

    if (!q) {
      return Response.json(
        { error: "Missing q in body" },
        { status: 400 }
      );
    }

    const result = await useAi.chat(q);
    return Response.json(result);
  } catch (err) {
    return Response.json(err, { status: 500 });
  }
}
