import http from "node:http";
import { pathToFileURL } from "node:url";
import { createPersistenceRepository, verifySessionToken } from "./dbRepository.mjs";
import { loadEnvFile } from "./envLoader.mjs";
import { answerChatWithLlm, extractProfilePatchWithLlm, hasConfiguredLlm, resolveFoodWithLlm } from "./llmProvider.mjs";
import { createPaymentCheckout, getPaymentProviderStatus } from "./paymentProviders.mjs";

loadEnvFile();
const port = Number(process.env.MAGERLIFE_API_PORT || process.env.PORT || 8787);
const host = process.env.MAGERLIFE_API_HOST || "127.0.0.1";
const persistenceRepository = await createPersistenceRepository();
const rateLimitWindowMs = 60_000;
const rateLimitMaxRequests = Number(process.env.MAGERLIFE_RATE_LIMIT_PER_MIN || 180);
const rateLimitBuckets = new Map();
const corsOrigins = new Set(
  String(process.env.MAGERLIFE_CORS_ORIGINS || "*")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);

function readJson(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function corsOriginForRequest(req) {
  const origin = req.headers.origin || "";
  if (corsOrigins.has("*")) return "*";
  if (origin && corsOrigins.has(origin)) return origin;
  return [...corsOrigins][0] || "*";
}

function sendJson(req, res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": corsOriginForRequest(req),
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,OPTIONS",
  });
  res.end(JSON.stringify(payload));
}

function sendRepositoryResult(req, res, result, successStatus = 200) {
  if (result?.error) {
    const status = result.error.code === "ACCOUNT_EXISTS" ? 409 : result.error.code === "INVALID_CREDENTIALS" ? 401 : 400;
    sendJson(req, res, status, { error: result.error });
    return;
  }
  sendJson(req, res, successStatus, result);
}

function sendValidationError(req, res, message, details = {}) {
  sendJson(req, res, 400, {
    error: {
      code: "VALIDATION_ERROR",
      message,
      details,
    },
  });
}

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim();
}

function isRateLimited(req) {
  const key = `${clientIp(req)}:${req.url?.split("?")[0] || "/"}`;
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key) || { count: 0, resetAt: now + rateLimitWindowMs };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + rateLimitWindowMs;
  }
  bucket.count += 1;
  rateLimitBuckets.set(key, bucket);
  return bucket.count > rateLimitMaxRequests;
}

function isValidEmail(email = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
}

function isStrongPassword(password = "") {
  return String(password).length > 8 && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
}

function validMealName(meal = "") {
  return ["Sáng", "Trưa", "Tối", "Phụ"].includes(meal);
}

function validateAuthRegister(body = {}) {
  if (!isValidEmail(body.email)) return "Email không hợp lệ.";
  if (!isStrongPassword(body.password)) return "Mật khẩu phải dài hơn 8 ký tự, có chữ hoa, số và ký tự đặc biệt.";
  if (!body.profile || typeof body.profile !== "object") return "Thiếu profile đăng ký.";
  return "";
}

function validateAuthLogin(body = {}) {
  if (!body.identifier || !body.password) return "Thiếu email/tên đăng nhập hoặc mật khẩu.";
  return "";
}

function validateNutritionLog(body = {}) {
  const mealLog = body.mealLog || {};
  if (!body.userId || !isValidEmail(body.userId)) return "userId không hợp lệ.";
  if (!mealLog.id || !validMealName(mealLog.meal) || !mealLog.name) return "Meal log thiếu id, bữa hoặc tên món.";
  if (!Number.isFinite(Number(mealLog.kcal)) || Number(mealLog.kcal) < 0) return "kcal không hợp lệ.";
  return "";
}

function validateFoodLibraryUpsert(body = {}) {
  if (!body.userId || !isValidEmail(body.userId)) return "userId không hợp lệ.";
  if (!Array.isArray(body.items)) return "items phải là mảng.";
  const invalidItem = body.items.find((item) => !item?.id || !item?.name || !Number.isFinite(Number(item.kcalPer100g)));
  return invalidItem ? "Food library item thiếu id, tên hoặc kcalPer100g hợp lệ." : "";
}

function validateFinanceSnapshot(body = {}) {
  const snapshot = body.financeSnapshot || {};
  if (!body.userId || !isValidEmail(body.userId)) return "userId không hợp lệ.";
  if (!Array.isArray(snapshot.jars) || !Array.isArray(snapshot.transactions)) return "financeSnapshot cần jars và transactions dạng mảng.";
  const invalidJar = snapshot.jars.find((jar) => !jar?.id || !jar?.name || !Number.isFinite(Number(jar.percentage)));
  if (invalidJar) return "Hũ tiền thiếu id, tên hoặc percentage hợp lệ.";
  const invalidTx = snapshot.transactions.find((tx) => !tx?.id || !tx?.jarId || !["expense", "income"].includes(tx.type) || !Number.isFinite(Number(tx.amount)));
  return invalidTx ? "Giao dịch thiếu id, jarId, type hoặc amount hợp lệ." : "";
}

function validateBillingWebhook(body = {}) {
  if (!isValidEmail(body.email)) return "Email không hợp lệ.";
  if (!body.provider) return "Thiếu provider thanh toán.";
  if (!body.status) return "Thiếu trạng thái subscription.";
  return "";
}

function validateBillingCheckout(body = {}) {
  if (!isValidEmail(body.userId)) return "userId không hợp lệ.";
  if (!["payos", "momo", "vnpay"].includes(body.provider)) return "Provider phải là payos, momo hoặc vnpay.";
  if (body.plan !== "pro") return "Hiện chỉ hỗ trợ gói pro.";
  return "";
}

function requireBillingSecret(req, res) {
  const expected = process.env.MAGERLIFE_BILLING_WEBHOOK_SECRET || "";
  if (!expected) {
    sendJson(req, res, 503, {
      error: {
        code: "BILLING_WEBHOOK_NOT_CONFIGURED",
        message: "Billing webhook secret is not configured",
      },
    });
    return false;
  }
  const provided = String(req.headers["x-magerlife-billing-secret"] || "");
  if (provided !== expected) {
    sendJson(req, res, 401, {
      error: {
        code: "INVALID_BILLING_WEBHOOK_SECRET",
        message: "Invalid billing webhook secret",
      },
    });
    return false;
  }
  return true;
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

function requireSession(req, res, targetUserId = "", options = {}) {
  const session = verifySessionToken(getBearerToken(req));
  if (!session) {
    sendJson(req, res, 401, {
      error: {
        code: "UNAUTHENTICATED",
        message: "A valid session token is required",
      },
    });
    return null;
  }
  if (options.adminOnly && session.role !== "admin") {
    sendJson(req, res, 403, {
      error: {
        code: "FORBIDDEN",
        message: "Admin role is required",
      },
    });
    return null;
  }
  const normalizedTarget = String(targetUserId || "").trim().toLowerCase();
  if (normalizedTarget && normalizedTarget !== session.sub && session.role !== "admin") {
    sendJson(req, res, 403, {
      error: {
        code: "FORBIDDEN",
        message: "Session does not match requested user",
      },
    });
    return null;
  }
  return session;
}

function readGetPayload(url) {
  const payload = url.searchParams.get("payload");
  if (!payload) return Object.fromEntries(url.searchParams.entries());
  try {
    return JSON.parse(payload);
  } catch {
    return {};
  }
}

function estimateFoodFromText(text = "") {
  const kcalMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(?:kcal|calo|calories|cal)\b/i);
  const kcal = kcalMatch?.[1] ? Math.max(1, Math.round(Number(kcalMatch[1].replace(",", ".")))) : 420;
  const name = text
    .replace(/(\d+(?:[.,]\d+)?)\s*(?:kcal|calo|calories|cal)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 72) || "Món cần xác nhận";
  return {
    name,
    confidence: kcalMatch ? 0.78 : 0.52,
    kcal,
    carbs: Math.round((kcal * 0.48) / 4),
    protein: Math.round((kcal * 0.24) / 4),
    fat: Math.round((kcal * 0.28) / 9),
    fiber: Math.max(1, Math.round(kcal / 140)),
    source: "llm_estimate",
  };
}

function databaseUrlSummary() {
  const rawUrl = process.env.DATABASE_URL || "";
  if (!rawUrl) {
    return {
      configured: false,
      host: "",
      port: "",
      pooler: false,
    };
  }
  try {
    const url = new URL(rawUrl);
    return {
      configured: true,
      host: url.hostname,
      port: url.port,
      pooler: url.hostname.includes(".pooler.supabase.com"),
    };
  } catch {
    return {
      configured: true,
      host: "invalid-url",
      port: "",
      pooler: false,
    };
  }
}

export async function handleMagerLifeApiRequest(req, res) {
  try {
    if (isRateLimited(req)) {
      sendJson(req, res, 429, {
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Please retry later.",
        },
      });
      return;
    }

    if (req.method === "OPTIONS") {
      sendJson(req, res, 200, { ok: true });
      return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const body = req.method === "GET" ? readGetPayload(url) : await readJson(req);

  if (req.method === "GET" && url.pathname === "/health") {
    const provider = process.env.MAGERLIFE_LLM_PROVIDER || "groq";
    sendJson(req, res, 200, {
      ok: true,
      provider: hasConfiguredLlm() ? provider : "mock",
      model: provider === "groq" ? process.env.GROQ_MODEL : process.env.XAI_MODEL,
      llmConfigured: hasConfiguredLlm(),
      serverTime: new Date().toISOString(),
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/health/db") {
    const database = databaseUrlSummary();
    try {
      const connection = await persistenceRepository.checkConnection();
      sendJson(req, res, 200, {
        ok: Boolean(connection.ok && connection.schemaReady),
        driver: persistenceRepository.driver,
        database,
        connection,
        serverTime: new Date().toISOString(),
      });
    } catch (error) {
      sendJson(req, res, 500, {
        ok: false,
        driver: persistenceRepository.driver,
        database,
        error: {
          code: error?.code || "DB_HEALTH_FAILED",
          message: error instanceof Error ? error.message : "Database health check failed",
        },
        serverTime: new Date().toISOString(),
      });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/auth/register") {
    const validationError = validateAuthRegister(body);
    if (validationError) {
      sendValidationError(req, res, validationError);
      return;
    }
    sendRepositoryResult(req, res, await persistenceRepository.registerAccount(body), 201);
    return;
  }

  if (req.method === "POST" && url.pathname === "/auth/login") {
    const validationError = validateAuthLogin(body);
    if (validationError) {
      sendValidationError(req, res, validationError);
      return;
    }
    sendRepositoryResult(req, res, await persistenceRepository.loginAccount(body));
    return;
  }

  if (req.method === "POST" && url.pathname === "/billing/webhook") {
    if (!requireBillingSecret(req, res)) return;
    const validationError = validateBillingWebhook(body);
    if (validationError) {
      sendValidationError(req, res, validationError);
      return;
    }
    sendRepositoryResult(req, res, await persistenceRepository.applyBillingWebhook(body));
    return;
  }

  if (req.method === "GET" && url.pathname === "/billing/providers") {
    sendJson(req, res, 200, { providers: getPaymentProviderStatus() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/billing/checkout") {
    if (!requireSession(req, res, body?.userId || "")) return;
    const validationError = validateBillingCheckout(body);
    if (validationError) {
      sendValidationError(req, res, validationError);
      return;
    }
    sendRepositoryResult(req, res, await createPaymentCheckout(body));
    return;
  }

  if (req.method === "GET" && url.pathname === "/me") {
    if (!requireSession(req, res, body?.userId || "")) return;
    sendRepositoryResult(req, res, await persistenceRepository.getProfile(body?.userId || ""));
    return;
  }

  if (req.method === "PATCH" && url.pathname === "/profile") {
    if (!requireSession(req, res, body?.userId || body?.patch?.email || "")) return;
    sendRepositoryResult(req, res, await persistenceRepository.patchProfile(body));
    return;
  }

  if (req.method === "POST" && url.pathname === "/chat/turn") {
    if (hasConfiguredLlm()) {
      try {
        const result = await answerChatWithLlm({
          text: body?.text || "",
          profile: body?.profile || {},
          clientContext: body?.clientContext || {},
        });
        sendJson(req, res, 200, result);
        return;
      } catch (error) {
        sendJson(req, res, 200, {
          message: `LLM tạm lỗi nên hệ thống dùng rule/mock fallback. ${error instanceof Error ? error.message : ""}`.trim(),
          profilePatch: {},
          pendingAction: body?.text?.includes("ăn") ? { type: "resolve_food", reason: "Need nutrition resolver" } : undefined,
        });
        return;
      }
    }
    sendJson(req, res, 200, {
      message: "Mock API đã nhận chat turn. Backend thật sẽ gọi router/rule/LLM tại đây.",
      profilePatch: {},
      pendingAction: body?.text?.includes("ăn") ? { type: "resolve_food", reason: "Need nutrition resolver" } : undefined,
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/nutrition/resolve-food") {
    if (hasConfiguredLlm()) {
      try {
        sendJson(req, res, 200, await resolveFoodWithLlm({
          text: body?.text || "",
          meal: body?.meal,
          profile: body?.profile || {},
        }));
        return;
      } catch (error) {
        const candidate = estimateFoodFromText(body?.text || "");
        sendJson(req, res, 200, {
          status: "needs_confirmation",
          candidates: [{ ...candidate, note: error instanceof Error ? error.message : "LLM fallback" }],
        });
        return;
      }
    }
    const candidate = estimateFoodFromText(body?.text || "");
    sendJson(req, res, 200, {
      status: "needs_confirmation",
      candidates: [candidate],
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/nutrition/log") {
    if (!requireSession(req, res, body?.userId || "")) return;
    const validationError = validateNutritionLog(body);
    if (validationError) {
      sendValidationError(req, res, validationError);
      return;
    }
    sendRepositoryResult(req, res, await persistenceRepository.logNutritionMeal(body));
    return;
  }

  if (req.method === "GET" && url.pathname === "/food-library") {
    if (body?.scope && body.scope !== "admin" && !requireSession(req, res, body?.userId || "")) return;
    sendRepositoryResult(req, res, await persistenceRepository.getFoodLibrary(body));
    return;
  }

  if (req.method === "POST" && url.pathname === "/food-library") {
    if (!requireSession(req, res, body?.userId || "")) return;
    const validationError = validateFoodLibraryUpsert(body);
    if (validationError) {
      sendValidationError(req, res, validationError);
      return;
    }
    sendRepositoryResult(req, res, await persistenceRepository.upsertFoodLibrary(body));
    return;
  }

  if (req.method === "GET" && url.pathname === "/finance/snapshot") {
    if (!requireSession(req, res, body?.userId || "")) return;
    sendRepositoryResult(req, res, await persistenceRepository.getFinanceSnapshot(body?.userId || ""));
    return;
  }

  if (req.method === "PUT" && url.pathname === "/finance/snapshot") {
    if (!requireSession(req, res, body?.userId || body?.financeSnapshot?.userId || "")) return;
    const validationError = validateFinanceSnapshot(body);
    if (validationError) {
      sendValidationError(req, res, validationError);
      return;
    }
    sendRepositoryResult(req, res, await persistenceRepository.upsertFinanceSnapshot(body));
    return;
  }

  if (req.method === "POST" && url.pathname === "/profile/update") {
    if (hasConfiguredLlm() && body?.sourceText) {
      try {
        const extraction = await extractProfilePatchWithLlm({
          patch: body.patch || {},
          sourceText: body.sourceText || "",
          currentProfile: body.profile || {},
        });
        const mergedPatch = { ...(body.patch || {}), ...extraction.patch };
        sendJson(req, res, 200, {
          profile: mergedPatch,
          changedFields: Object.keys(mergedPatch),
          warnings: extraction.warnings,
        });
        return;
      } catch (error) {
        sendJson(req, res, 200, {
          profile: body.patch || {},
          changedFields: Object.keys(body.patch || {}),
          warnings: [`LLM extraction fallback: ${error instanceof Error ? error.message : "unknown error"}`],
        });
        return;
      }
    }
    sendJson(req, res, 200, {
      profile: body.patch || {},
      changedFields: Object.keys(body.patch || {}),
      warnings: [],
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/weather") {
    const place = body?.place || {};
    sendJson(req, res, 200, {
      place,
      weather: {
        temperature: 29,
        humidity: 72,
        rainChance: 18,
        windSpeed: 12,
        condition: "Có mây",
        hourly: [
          { time: "09:00", temperature: 29, rainChance: 18, humidity: 72 },
          { time: "10:00", temperature: 30, rainChance: 16, humidity: 70 },
          { time: "11:00", temperature: 31, rainChance: 22, humidity: 68 },
        ],
      },
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/agent/events") {
    if (!requireSession(req, res, body?.userId || "")) return;
    sendJson(req, res, 200, await persistenceRepository.appendAgentEvents(body.userId, Array.isArray(body.events) ? body.events : []));
    return;
  }

  if (req.method === "POST" && url.pathname === "/persistence/sync") {
    if (!requireSession(req, res, body?.userId || body?.profile?.email || "")) return;
    sendJson(req, res, 200, await persistenceRepository.syncPersistence(body));
    return;
  }

  if (req.method === "GET" && url.pathname === "/admin/analytics") {
    if (!requireSession(req, res, body?.adminUserId || "", { adminOnly: true })) return;
    sendJson(req, res, 200, await persistenceRepository.getAdminAnalytics());
    return;
  }

    sendJson(req, res, 404, {
      error: {
        code: "NOT_FOUND",
        message: "Unknown MagerLife mock API route",
      },
    });
  } catch (error) {
    console.error("MagerLife API error", error);
    sendJson(req, res, 500, {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "Unexpected server error",
      },
    });
  }
}

export function createMagerLifeApiServer() {
  return http.createServer(handleMagerLifeApiRequest);
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const server = createMagerLifeApiServer();
  server.listen(port, host, () => {
    console.log(`MagerLife API listening at http://${host}:${port}`);
    const provider = process.env.MAGERLIFE_LLM_PROVIDER || "groq";
    const model = provider === "groq" ? process.env.GROQ_MODEL : process.env.XAI_MODEL;
    console.log(`LLM provider: ${hasConfiguredLlm() ? `${provider} (${model || "default"})` : "mock fallback"}`);
    console.log(`Persistence driver: ${persistenceRepository.driver}`);
  });
}
