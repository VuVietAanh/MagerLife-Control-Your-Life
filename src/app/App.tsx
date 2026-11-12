import { Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { type Memory } from "./models/agent";
import { type Jar, type MoneyCurrency, type Transaction } from "./models/finance";
import { type UserProfile } from "./models/profile";
import { appendAgentEvent, classifyProfileUpdateEvent, loadAgentEvents, type AgentEvent } from "./services/agentEventService";
import { extractProfilePatchWithLocalAi, isLocalAiProvider, resolveAiOverride, sanitizeProfileForSync } from "./services/aiProviderService";
import { saveAuthAccount } from "./services/authAccountService";
import { appendAgentTrainingRecord } from "./services/dataRepository";
import { loadAdminFoodLibrary, saveAdminFoodLibrary, type FoodLibraryItem } from "./services/foodLibraryService";
import { buildNextUserProfile } from "./services/profileService";
import { getFinanceSnapshotFromApi, getFoodLibraryFromApi, logNutritionMealToApi, saveFinanceSnapshotToApi, saveFoodLibraryToApi, saveProfileToApi, syncAgentEventsToApi, updateProfileViaApi } from "./services/magerLifeApiFacade";
import { type Tab, getNavigationTabs } from "./layout/navigation";
import { ViewErrorBoundary } from "./layout/ViewErrorBoundary";
import { salary, initialJars, initialMemories, initialTransactions, createStarterJarsForCurrency, createMemoriesFromProfile } from "./data/starterData";
import { AuthFlow } from "./views/auth/AuthFlow";
import { Header } from "./layout/Header";
import { FinanceView } from "./views/finance/FinanceView";
import { BrainView } from "./views/brain/BrainView";
import { FoodLibraryView } from "./views/food/FoodLibraryView";
import { AccountView } from "./views/account/AccountView";
import { Dashboard } from "./views/dashboard/Dashboard";
import { MindspaceView } from "./views/mindspace/MindspaceView";
import { clearMindspaceToken } from "./services/mindspaceClient";

function shouldEnrichProfileWithApi(sourceText: string, patch: Partial<UserProfile>) {
  const normalized = sourceText.toLowerCase();
  if (!sourceText.trim()) return false;
  if (normalized.includes("api/llm")) return false;
  if (normalized.includes("api fallback")) return false;
  if (normalized.startsWith("nutrition_tracking_mode=")) return false;
  if (normalized.startsWith("chế độ ăn hiện tại:")) return false;
  if (normalized.startsWith("pro custom food:")) return false;
  if (normalized.startsWith("delete custom food:")) return false;
  if (normalized.startsWith("sửa nhật ký ăn uống:")) return false;
  if (normalized.startsWith("xóa nhật ký ăn uống:")) return false;
  if (patch.nutritionMeals || patch.pendingNutritionApiRequests || patch.customFoodItems || patch.mealPlanSlots) return false;
  if (patch.aiSettings) return false;
  return sourceText.length >= 16;
}

const AUTH_SESSION_STORAGE_KEY = "magerlife_session_profile_v1";

/** localStorage can throw (private mode, blocked site data), so every access is guarded. */
function readStoredSessionProfile(): UserProfile | null {
  try {
    const raw = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.email === "string" && parsed.email ? (parsed as UserProfile) : null;
  } catch {
    return null;
  }
}

function writeStoredSessionProfile(profile: UserProfile | null) {
  try {
    if (!profile) window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    else window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    /* ignore: session just won't persist */
  }
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [monthlyIncome, setMonthlyIncome] = useState(salary);
  const [currency, setCurrency] = useState<MoneyCurrency>("VND");
  const [tab, setTab] = useState<Tab>("dashboard");
  const [jars, setJars] = useState<Jar[]>(initialJars);
  const [memories, setMemories] = useState<Memory[]>(initialMemories);
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const [savedJars, setSavedJars] = useState<Jar[]>(initialJars);
  const [savedTransactions, setSavedTransactions] = useState<Transaction[]>(initialTransactions);
  const [pendingTabChange, setPendingTabChange] = useState<Tab | null>(null);
  const [adminFoodLibrary, setAdminFoodLibrary] = useState<FoodLibraryItem[]>(() => loadAdminFoodLibrary());
  const foodLibraryApiReadyRef = useRef(false);
  const financeApiReadyRef = useRef(false);
  const [agentEvents, setAgentEvents] = useState<AgentEvent[]>(() => loadAgentEvents());

  const background = useMemo(
    () => ({
      background:
        "linear-gradient(135deg, #f6fbf8 0%, #eef7f2 45%, #f7faf8 100%)",
    }),
    []
  );

  useEffect(() => {
    saveAdminFoodLibrary(adminFoodLibrary);
    if (!foodLibraryApiReadyRef.current || profile?.role !== "admin") return;
    void saveFoodLibraryToApi({
      userId: profile?.email || "local-admin",
      items: adminFoodLibrary,
    });
  }, [adminFoodLibrary]);

  useEffect(() => {
    let cancelled = false;
    void getFoodLibraryFromApi({ scope: "admin" }).then((result) => {
      if (cancelled) return;
      foodLibraryApiReadyRef.current = true;
      if (result.ok && result.data?.items?.length) {
        setAdminFoodLibrary(result.data.items);
        return;
      }
      if (profile?.role !== "admin") return;
      void saveFoodLibraryToApi({
        userId: profile?.email || "local-admin",
        items: adminFoodLibrary,
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !profile?.email || !financeApiReadyRef.current) return;
    void saveFinanceSnapshotToApi({
      userId: profile.email,
      financeSnapshot: {
        userId: profile.email,
        currency,
        jars,
        transactions,
        updatedAt: new Date().toISOString(),
      },
    });
  }, [isAuthenticated, profile?.email, currency, jars, transactions]);

  function recordAgentEvent(event: Parameters<typeof appendAgentEvent>[0]) {
    const nextEvent = appendAgentEvent(event);
    appendAgentTrainingRecord(nextEvent);
    setAgentEvents((prev) => [...prev, nextEvent].slice(-300));
    if (nextEvent.profileEmail) {
      void syncAgentEventsToApi({
        userId: nextEvent.profileEmail,
        events: [nextEvent],
      });
    }
  }

  function completeAuth(nextProfile: UserProfile) {
    const normalizedProfile: UserProfile = {
      ...nextProfile,
      role: nextProfile.role || "user",
    };
    const income = normalizedProfile.salary || salary;
    const starterJars = createStarterJarsForCurrency(income, normalizedProfile.currency || "VND", normalizedProfile.foodMonthlyBudget || 0);
    setProfile(normalizedProfile);
    setMonthlyIncome(income);
    setCurrency(normalizedProfile.currency || "VND");
    setJars(starterJars);
    setTransactions([]);
    setSavedJars(starterJars);
    setSavedTransactions([]);
    setMemories(createMemoriesFromProfile(normalizedProfile));
    setTab("dashboard");
    setIsAuthenticated(true);
    writeStoredSessionProfile(normalizedProfile);
    financeApiReadyRef.current = false;
    void getFinanceSnapshotFromApi({ userId: normalizedProfile.email }).then((result) => {
      if (result.ok && result.data?.financeSnapshot?.jars?.length) {
        const snapshot = result.data.financeSnapshot;
        setJars(snapshot.jars);
        setTransactions(snapshot.transactions || []);
        setSavedJars(snapshot.jars);
        setSavedTransactions(snapshot.transactions || []);
        if (snapshot.currency) setCurrency(snapshot.currency);
        financeApiReadyRef.current = true;
        return;
      }
      financeApiReadyRef.current = true;
      void saveFinanceSnapshotToApi({
        userId: normalizedProfile.email,
        financeSnapshot: {
          userId: normalizedProfile.email,
          currency: normalizedProfile.currency || "VND",
          jars: starterJars,
          transactions: [],
          updatedAt: new Date().toISOString(),
        },
      });
    });
    recordAgentEvent({
      type: "auth_completed",
      source: "auth_flow",
      profileEmail: normalizedProfile.email,
      payload: {
        setupComplete: normalizedProfile.setupComplete,
        hasKcalBase: Boolean(normalizedProfile.birthday && normalizedProfile.gender && normalizedProfile.weight && normalizedProfile.height),
        currency: normalizedProfile.currency || "VND",
      },
    });
  }

  function updateProfileFromConversation(patch: Partial<UserProfile>, sourceText: string) {
    const baseProfile: UserProfile = profile || {
      email: "demo@magerlife.local",
      birthday: "",
      gender: "Chưa cập nhật",
      setupComplete: true,
    };
    const nextProfile = buildNextUserProfile(baseProfile, patch, sourceText);
    setProfile(nextProfile);
    if (nextProfile.salary) setMonthlyIncome(nextProfile.salary);
    if (nextProfile.currency) setCurrency(nextProfile.currency);
    setMemories(createMemoriesFromProfile(nextProfile));
    saveAuthAccount<UserProfile>(nextProfile.email, nextProfile);
    void saveProfileToApi({
      userId: nextProfile.email,
      patch: sanitizeProfileForSync(nextProfile),
    });
    if (patch.nutritionMeals?.length) {
      const previousMeals = baseProfile.nutritionMeals || [];
      const changedMeals = patch.nutritionMeals.filter((meal) => {
        const previousMeal = previousMeals.find((item) => item.id === meal.id);
        return !previousMeal || JSON.stringify(previousMeal) !== JSON.stringify(meal);
      });
      changedMeals.forEach((mealLog) => {
        void logNutritionMealToApi({
          userId: nextProfile.email,
          mealLog,
        });
      });
    }
    if (patch.customFoodItems?.length) {
      void saveFoodLibraryToApi({
        userId: nextProfile.email,
        items: patch.customFoodItems,
      });
    }
    recordAgentEvent({
      type: classifyProfileUpdateEvent(patch as Record<string, unknown>, sourceText),
      source: sourceText,
      profileEmail: nextProfile.email,
      payload: {
        changedFields: Object.keys(patch),
        patch,
      },
    });
    if (shouldEnrichProfileWithApi(sourceText, patch)) {
      const applyProfileEnrichment = (apiPatch: Partial<UserProfile>, warnings: string[]) => {
        const apiChangedFields = Object.keys(apiPatch).filter((key) => JSON.stringify(apiPatch[key as keyof UserProfile]) !== JSON.stringify(nextProfile[key as keyof UserProfile]));
        if (!apiChangedFields.length) return;
        setProfile((current) => {
          const currentProfile = current || nextProfile;
          const enrichedProfile = buildNextUserProfile(currentProfile, apiPatch, `Profile API enrichment: ${sourceText}`);
          saveAuthAccount<UserProfile>(enrichedProfile.email, enrichedProfile);
          void saveProfileToApi({
            userId: enrichedProfile.email,
            patch: sanitizeProfileForSync(enrichedProfile),
          });
          if (apiPatch.nutritionMeals?.length) {
            apiPatch.nutritionMeals.forEach((mealLog) => {
              void logNutritionMealToApi({
                userId: enrichedProfile.email,
                mealLog,
              });
            });
          }
          if (apiPatch.customFoodItems?.length) {
            void saveFoodLibraryToApi({
              userId: enrichedProfile.email,
              items: apiPatch.customFoodItems,
            });
          }
          setMemories(createMemoriesFromProfile(enrichedProfile));
          if (enrichedProfile.salary) setMonthlyIncome(enrichedProfile.salary);
          if (enrichedProfile.currency) setCurrency(enrichedProfile.currency);
          return enrichedProfile;
        });
        recordAgentEvent({
          type: "profile_updated",
          source: `Profile API enrichment: ${sourceText}`,
          profileEmail: nextProfile.email,
          payload: {
            changedFields: apiChangedFields,
            patch: apiPatch,
            warnings,
          },
        });
      };

      const aiSettings = nextProfile.aiSettings;
      if (aiSettings && isLocalAiProvider(aiSettings.provider)) {
        void extractProfilePatchWithLocalAi({ patch, sourceText, currentProfile: nextProfile, aiSettings })
          .then((extraction) => applyProfileEnrichment(extraction.patch, extraction.warnings))
          .catch(() => {});
      } else {
        void updateProfileViaApi({
          profile: sanitizeProfileForSync(nextProfile),
          patch,
          sourceText,
          aiOverride: resolveAiOverride(aiSettings),
        }).then((result) => {
          if (!result.ok || !result.data?.profile) return;
          applyProfileEnrichment(result.data.profile, result.data.warnings || []);
        });
      }
    }
  }

  const hasUnsavedJarChanges = JSON.stringify(jars) !== JSON.stringify(savedJars);

  function requestTabChange(nextTab: Tab) {
    if (hasUnsavedJarChanges && nextTab !== tab) {
      setPendingTabChange(nextTab);
      return;
    }
    setTab(nextTab);
  }

  function discardJarChangesAndSwitchTab() {
    setJars(savedJars);
    setTransactions(savedTransactions);
    const nextTab = pendingTabChange;
    setPendingTabChange(null);
    if (nextTab) setTab(nextTab);
  }

  function keepJarChangesAndSwitchTab() {
    setSavedJars(jars);
    setSavedTransactions(transactions);
    const nextTab = pendingTabChange;
    setPendingTabChange(null);
    if (nextTab) setTab(nextTab);
  }

  // Restore a previous session on first load so a refresh doesn't kick the user out.
  useEffect(() => {
    const storedProfile = readStoredSessionProfile();
    if (storedProfile) completeAuth(storedProfile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the stored session in step with later profile edits.
  useEffect(() => {
    if (isAuthenticated && profile) writeStoredSessionProfile(profile);
  }, [isAuthenticated, profile]);

  function handleLogout() {
    writeStoredSessionProfile(null);
    clearMindspaceToken();
    setIsAuthenticated(false);
    setProfile(null);
    setJars(initialJars);
    setTransactions(initialTransactions);
    setSavedJars(initialJars);
    setSavedTransactions(initialTransactions);
    setPendingTabChange(null);
    setMemories(initialMemories);
    setTab("dashboard");
    financeApiReadyRef.current = false;
  }

  return (
    <div className="min-h-screen text-slate-900" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", ...background }}>
      <div className="relative z-10 min-h-screen">
        {!isAuthenticated ? (
          <AuthFlow onComplete={completeAuth} />
        ) : (
          <>
        <Header tab={tab} setTab={requestTabChange} profile={profile} onLogout={handleLogout} />
        {pendingTabChange && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-white/80 bg-white p-5 shadow-2xl">
              <h3 className="text-lg font-bold text-slate-900">Hũ có thay đổi chưa lưu</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Bạn vừa chỉnh cấu trúc hũ (xóa/gộp hũ hoặc đổi %) nhưng chưa bấm "Lưu thay đổi". Bạn muốn hủy để giữ nguyên như trước khi thao tác, hay lưu lại thay đổi này rồi tiếp tục?
              </p>
              <div className="mt-5 flex gap-2">
                <button onClick={discardJarChangesAndSwitchTab} className="flex-1 rounded-lg border border-slate-200 bg-white py-2 text-sm font-semibold text-slate-600">
                  Hủy, giữ như trước
                </button>
                <button onClick={keepJarChangesAndSwitchTab} className="flex-1 rounded-lg bg-slate-900 py-2 text-sm font-semibold text-white">
                  Lưu thay đổi, tiếp tục
                </button>
              </div>
            </div>
          </div>
        )}
        <ViewErrorBoundary key={tab} fallbackTitle={`Không mở được mục ${getNavigationTabs(profile).find((item) => item.id === tab)?.label || tab}`} onReset={() => setTab("dashboard")}>
          {tab === "dashboard" && <Dashboard jars={jars} transactions={transactions} profile={profile} currency={currency} adminFoodLibrary={adminFoodLibrary} onProfileUpdate={updateProfileFromConversation} />}
          {tab === "finance" && <FinanceView jars={jars} setJars={setJars} transactions={transactions} setTransactions={setTransactions} salary={monthlyIncome} currency={currency} savedJars={savedJars} setSavedJars={setSavedJars} setSavedTransactions={setSavedTransactions} />}
          {tab === "talk" && <MindspaceView />}
          {tab === "account" && <AccountView profile={profile} onProfileUpdate={updateProfileFromConversation} />}
          {tab === "food-admin" && <FoodLibraryView profile={profile} onProfileUpdate={updateProfileFromConversation} foodLibrary={adminFoodLibrary} setFoodLibrary={setAdminFoodLibrary} />}
          {tab === "brain" && <BrainView memories={memories} setMemories={setMemories} agentEvents={agentEvents} />}
        </ViewErrorBoundary>
          </>
        )}
      </div>
    </div>
  );
}
