const configuredApiBaseUrl = import.meta.env?.VITE_MAGERLIFE_API_BASE_URL as string | undefined;

export const MAGERLIFE_API_BASE_URL =
  configuredApiBaseUrl || (import.meta.env?.DEV ? "http://127.0.0.1:8787" : "/api");

// MindSpace ("Tâm sự"): service Python riêng. Production đi qua rewrite /mindspace/* trong vercel.json
// (cùng domain, không cần CORS); local gọi thẳng uvicorn.
const configuredMindspaceBaseUrl = import.meta.env?.VITE_MINDSPACE_API_BASE_URL as string | undefined;

export const MINDSPACE_API_BASE_URL =
  configuredMindspaceBaseUrl || (import.meta.env?.DEV ? "http://127.0.0.1:8000" : "/mindspace");
