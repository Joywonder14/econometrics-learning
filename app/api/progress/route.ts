import { env } from "cloudflare:workers";
import { handleGetProgress, handlePostProgress } from "./service";
export const dynamic = "force-dynamic";
const dependencies = { getAdminCode: () => (env as Cloudflare.Env & { ADMIN_SYNC_CODE?: string }).ADMIN_SYNC_CODE, getDB: () => {
  if (!env.DB) throw new Error("D1 unavailable");
  return env.DB;
} };
export function GET(request: Request) { return handleGetProgress(request, dependencies); }
export function POST(request: Request) { return handlePostProgress(request, dependencies); }
