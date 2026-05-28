// Endpoint público para verificar qué versión está sirviendo el deploy.
// curl https://TU_DOMINIO/api/version
import { NextResponse } from "next/server";
import {
  APP_VERSION,
  COMMIT_SHA,
  COMMIT_SHA_FULL,
  DEPLOY_ENV,
  BUILD_TIME,
} from "@/lib/version";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    version: APP_VERSION,
    commit: COMMIT_SHA,
    commit_full: COMMIT_SHA_FULL,
    env: DEPLOY_ENV,
    build_time: BUILD_TIME,
    served_at: new Date().toISOString(),
  });
}
