import { env } from "cloudflare:workers";
import { handleCreateVault } from "../../progress/service";
export const dynamic = "force-dynamic";
export function POST(request: Request) {
  return handleCreateVault(request, { getAdminCode: () => (env as Cloudflare.Env & { ADMIN_SYNC_CODE?: string }).ADMIN_SYNC_CODE, getDB: () => {
    if (!env.DB) throw new Error("D1 unavailable");
    return env.DB;
  } });
}
