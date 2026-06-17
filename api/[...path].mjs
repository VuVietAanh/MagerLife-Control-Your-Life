import { handleMagerLifeApiRequest } from "../src/server/mockApiServer.mjs";

export default async function handler(req, res) {
  req.url = String(req.url || "/").replace(/^\/api(?=\/|$)/, "") || "/";
  await handleMagerLifeApiRequest(req, res);
}
