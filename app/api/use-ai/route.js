import WebSocket from "ws";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const useAi = {
  domain: "agents.use.ai",

  headers: {
    Host: "agents.use.ai",
    "User-Agent":
      "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36",
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

  async chat(q, model = "claude-opus-4.5") {
    return new Promise((resolve, reject) => {
      const guestId = `guest:${randomUUID()}`;
      const chatId = randomUUID();
      const messageId = this.generateMessageId();
      const deviceId = randomUUID();
      const mixpanelUserId = randomUUID();

      const wsUrl = `wss://${this.domain}/agents/budget-agent/${chatId}?userId=${encodeURIComponent(
        guestId
      )}&userType=guest&planType=free&isTestUser=false`;

      const ws = new WebSocket(wsUrl, {
        headers: this.headers,
      });

      let finished = false;
      let fullResponse = "";
      let chatMetadata = null;
      let streamId = "";

      const timeout = setTimeout(() => {
        finish(() => {
          reject({
            error: "Request timeout",
          });
        });
      }, 55000);

      const finish = (callback) => {
        if (finished) return;

        finished = true;
        clearTimeout(timeout);

        try {
          ws.close();
        } catch {}

        callback();
      };

      ws.on("open", () => {
        ws.send(
          JSON.stringify({
            type: "prewarm",
            chatId,
          })
        );

        setTimeout(() => {
          if (finished || ws.readyState !== WebSocket.OPEN) return;

          const mainMessage = {
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

            // جرّبنا نبعته بأكتر من اسم لأن Use.ai ممكن يستخدم key مختلف
            selectedModel: model,
            model,
            requestedModel: model,
            activeModel: model,
            currentModel: model,

            disableReasoning: false,
            locale: "ar-sa",

            messages: [
              {
                parts: [
                  {
                    type: "text",
                    text: q,
                  },
                ],
                id: messageId,
                role: "user",
                metadata: {
                  isDeepResearchMode: false,
                  isWebSearchMode: false,
                  isImageGenerationMode: false,
                  needsBlurPreview: false,
                  deepResearchProcessor: "pro-fast",

                  selectedModel: model,
                  model,
                  requestedModel: model,
                },
              },
            ],

            trigger: "submit-message",
            source: "chat_page",
          };

          ws.send(JSON.stringify(mainMessage));
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
          finish(() => {
            resolve({
              id: chatId,
              model,
              message: fullResponse,
              streamId,
              metadata: chatMetadata,
              timestamp: new Date().toISOString(),
            });
          });
        }

        if (response.type === "rate-limit-error") {
          finish(() => {
            reject({
              error: "Rate limit hit",
              details: response.messageMetadata,
            });
          });
        }

        if (response.type === "error") {
          finish(() => {
            reject({
              error: "Use.ai error",
              details: response,
            });
          });
        }
      });

      ws.on("error", (error) => {
        finish(() => {
          reject({
            error: "WebSocket error",
            details: error.message,
          });
        });
      });

      ws.on("close", () => {
        if (!finished && !fullResponse) {
          finish(() => {
            reject({
              error: "WebSocket closed without response",
            });
          });
        }
      });
    });
  },
};

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: corsHeaders,
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);

  const q = searchParams.get("q");
  const model = searchParams.get("model") || "claude-opus-4.5";

  if (!q) {
    return json(
      {
        error: "Missing q parameter",
      },
      400
    );
  }

  try {
    const result = await useAi.chat(q, model);
    return json(result);
  } catch (err) {
    return json(err, 500);
  }
}

export async function POST(req) {
  try {
    const body = await req.json();

    const q = body.q;
    const model = body.model || "claude-opus-4.5";

    if (!q) {
      return json(
        {
          error: "Missing q in body",
        },
        400
      );
    }

    const result = await useAi.chat(q, model);
    return json(result);
  } catch (err) {
    return json(err, 500);
  }
}
