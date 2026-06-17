function getXaiConfig() {
  return {
    apiKey: process.env.XAI_API_KEY || "",
    baseUrl: process.env.XAI_BASE_URL || "https://api.x.ai/v1",
    model: process.env.XAI_MODEL || "latest",
  };
}

function getGroqConfig() {
  return {
    apiKey: process.env.GROQ_API_KEY || "",
    baseUrl: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
    model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
  };
}

export function hasConfiguredLlm() {
  if (process.env.MAGERLIFE_ENABLE_REAL_LLM === "false") return false;
  const provider = process.env.MAGERLIFE_LLM_PROVIDER || "groq";
  if (provider === "mock") return false;
  if (provider === "groq") return Boolean(getGroqConfig().apiKey);
  if (provider === "xai") return Boolean(getXaiConfig().apiKey);
  return false;
}

function safeJsonFromText(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    if (fenced) {
      try {
        return JSON.parse(fenced);
      } catch {
        return null;
      }
    }
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(text.slice(firstBrace, lastBrace + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function callXaiChatJson({ system, user, temperature = 0.2 }) {
  const config = getXaiConfig();
  if (!config.apiKey) throw new Error("Missing XAI_API_KEY");
  const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`xAI request failed: ${response.status} ${detail.slice(0, 240)}`);
  }
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || "";
  const parsed = safeJsonFromText(content);
  if (!parsed) throw new Error("xAI returned non-JSON content");
  return parsed;
}

async function callGroqChatJson({ system, user, temperature = 0.2 }) {
  const config = getGroqConfig();
  if (!config.apiKey) throw new Error("Missing GROQ_API_KEY");
  const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Groq request failed: ${response.status} ${detail.slice(0, 240)}`);
  }
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || "";
  const parsed = safeJsonFromText(content);
  if (!parsed) throw new Error("Groq returned non-JSON content");
  return parsed;
}

function callProviderChatJson(args) {
  const provider = process.env.MAGERLIFE_LLM_PROVIDER || "groq";
  if (provider === "groq") return callGroqChatJson(args);
  if (provider === "xai") return callXaiChatJson(args);
  throw new Error(`Unsupported LLM provider: ${provider}`);
}

export async function resolveFoodWithLlm({ text, meal, profile }) {
  const parsed = await callProviderChatJson({
    system:
      "Bạn là Nutrition Resolver cho MagerLife. Trả về JSON thuần, không markdown. Nhiệm vụ là ước tính khẩu phần/kcal để user xác nhận, không đưa lời khuyên ăn ít hơn/nhiều hơn. Luôn giữ đúng tên món người dùng nhập, không dịch sai, không đổi sang món khác. Nếu user dùng đơn vị đời thường như quả/cái/bát/tô/phần/ly/hộp, hãy quy đổi sang gram/ml theo khẩu phần phổ biến tại Việt Nam và phản ánh trong tên candidate. Ước tính bảo thủ, cần user xác nhận.",
    user: JSON.stringify({
      task: "resolve_food",
      text,
      meal,
      rules: [
        "Preserve Vietnamese dish identity and dish name.",
        "Do not replace noodle soup dishes with steak or western dishes.",
        "If the text contains phở/bún/mì/cơm, include reasonable carbs.",
        "If the text contains count-based serving units, estimate total grams/ml; example: 4 quả trứng gà thường khoảng 150-220g edible portion depending egg size.",
        "Do not give diet advice in this endpoint; only return candidates.",
        "Return exactly one JSON object with status and candidates.",
        "source must be llm_estimate.",
      ],
      examples: [
        {
          input: "Trưa nay tôi ăn 4 quả trứng",
          expectedCandidate: {
            name: "4 quả trứng gà (~150-220g)",
            kcalRange: "230-340",
            protein: "19-28",
            fat: "16-24",
          },
        },
        {
          input: "1 bát phở bò tái",
          expectedCandidate: {
            name: "Phở bò tái",
            kcalRange: "430-650",
            carbs: "45-75",
            protein: "25-40",
            fat: "10-25",
          },
        },
      ],
      profile: {
        goalSummary: profile?.goalSummary,
        dietPreference: profile?.dietPreference,
        calorieNote: profile?.calorieNote,
        currency: profile?.currency,
      },
      outputShape: {
        status: "needs_confirmation",
        candidates: [
          {
            name: "string",
            confidence: 0.6,
            kcal: 400,
            carbs: 45,
            protein: 25,
            fat: 12,
            fiber: 4,
            source: "llm_estimate",
          },
        ],
      },
    }),
  });
  const candidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];
  return {
    status: candidates.length ? "needs_confirmation" : "not_found",
    candidates: candidates.slice(0, 3).map((candidate) => ({
      name: String(candidate.name || text).slice(0, 80),
      confidence: Math.max(0.1, Math.min(0.95, Number(candidate.confidence) || 0.55)),
      kcal: Math.max(1, Math.round(Number(candidate.kcal) || 0)),
      carbs: Math.max(0, Math.round(Number(candidate.carbs) || 0)),
      protein: Math.max(0, Math.round(Number(candidate.protein) || 0)),
      fat: Math.max(0, Math.round(Number(candidate.fat) || 0)),
      fiber: Math.max(0, Math.round(Number(candidate.fiber) || 0)),
      source: "llm_estimate",
    })),
  };
}

export async function answerChatWithLlm({ text, profile, clientContext }) {
  const parsed = await callProviderChatJson({
    system:
      "Bạn là Chat Agent của MagerLife. Trả JSON thuần. Vai trò chính là cập nhật thông tin vào hệ thống và đưa kết luận dựa trên dữ liệu. Không giảng giải dài, không tự khuyên nếu user chỉ đang ghi nhận dữ liệu. Chỉ cảnh báo khi dữ liệu cho thấy vượt kcal, gần/vượt budget hoặc có xung đột rõ. Không chẩn đoán y tế.",
    user: JSON.stringify({
      task: "chat_turn",
      text,
      rules: [
        "If user asks for advice, profilePatch must be {}.",
        "Use foodMonthlyBudget and calorieNote if available.",
        "Give practical Vietnamese meal suggestions only when user asks what to eat.",
        "Do not suggest food that clearly exceeds provided meal/day budget.",
        "If budget is under 30000 VND, prefer home meal/egg/tofu/rice/vegetables; do not suggest pho/bun/com tam bought outside.",
        "Mention kcal direction only as recommendation, not medical certainty.",
        "Do not ask a vague follow-up unless required.",
      ],
      examples: [
        {
          input: "Tối nay tôi nên ăn gì nếu muốn giảm mỡ nhưng còn ít ngân sách ăn uống?",
          expected: {
            message: "Nên chọn cơm nhà hoặc meal prep: ức gà/trứng/đậu phụ + rau + 1 phần cơm nhỏ. Giữ bữa tối khoảng 400-550 kcal, ưu tiên protein, tránh trà sữa/đồ chiên. Nếu cần mua ngoài, chọn bún/phở phần thường và không thêm topping.",
            profilePatch: {},
          },
        },
      ],
      profileSummary: {
        currentPriority: profile?.currentPriority,
        goalSummary: profile?.goalSummary,
        budgetStyle: profile?.budgetStyle,
        calorieNote: profile?.calorieNote,
        foodMonthlyBudget: profile?.foodMonthlyBudget,
      },
      clientContext,
      outputShape: {
        message: "string",
        profilePatch: {},
        pendingAction: null,
      },
    }),
    temperature: 0.35,
  });
  return {
    message: String(parsed.message || "Mình đã phân tích xong, nhưng cần bạn xác nhận trước khi cập nhật hệ thống."),
    profilePatch: parsed.profilePatch && typeof parsed.profilePatch === "object" ? parsed.profilePatch : {},
    pendingAction: parsed.pendingAction || undefined,
  };
}

export async function extractProfilePatchWithLlm({ patch, sourceText, currentProfile }) {
  const parsed = await callProviderChatJson({
    system:
      "Bạn là Profile Extraction Agent của MagerLife. Chỉ trích xuất thông tin user tự nói rõ. Không bịa. Trả JSON thuần. Chỉ dùng các field được cho phép. Nếu không chắc thì bỏ qua và thêm warning.",
    user: JSON.stringify({
      task: "profile_update",
      sourceText,
      existingPatch: patch || {},
      allowedPatchFields: [
        "name",
        "birthday",
        "gender",
        "weight",
        "height",
        "salary",
        "foodMonthlyBudget",
        "currentPriority",
        "goalSummary",
        "dietPreference",
        "trainingHabit",
        "lifestyle",
        "budgetStyle",
        "supportStyle",
        "interests",
        "customChoiceSummary",
      ],
      rules: [
        "weight and height must be strings when extracted.",
        "salary and foodMonthlyBudget must be numbers when extracted.",
        "Do not overwrite birthday or gender unless user explicitly states them.",
        "For goals, keep concise Vietnamese text in goalSummary.",
        "Return { patch: {}, warnings: [] } if no durable profile data is present.",
      ],
      examples: [
        {
          input: "Tôi mới cân lại còn 52kg, cao 163cm, muốn giảm mỡ nhưng vẫn tăng cơ.",
          output: {
            patch: {
              weight: "52",
              height: "163",
              goalSummary: "Giảm mỡ, tăng cơ",
              currentPriority: "Giảm mỡ",
            },
            warnings: [],
          },
        },
      ],
      currentProfile: {
        birthday: currentProfile?.birthday,
        gender: currentProfile?.gender,
        weight: currentProfile?.weight,
        height: currentProfile?.height,
        currentPriority: currentProfile?.currentPriority,
        goalSummary: currentProfile?.goalSummary,
      },
      outputShape: {
        patch: {},
        warnings: [],
      },
    }),
  });
  return {
    patch: parsed.patch && typeof parsed.patch === "object" ? parsed.patch : {},
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [],
  };
}
