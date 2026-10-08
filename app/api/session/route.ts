import { env } from "cloudflare:workers";
import { handleSession } from "../progress/service";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return handleSession(request, { getAdminCode: () => (env as Cloudflare.Env & { ADMIN_SYNC_CODE?: string }).ADMIN_SYNC_CODE, getDB: () => {
    if (!env.DB) throw new Error("D1 unavailable");
    return env.DB;
  } });
}
