// Identidad de versión deployada. Útil para verificar en producción que el
// build corriendo corresponde al commit esperado.
//
// - APP_VERSION: package.json#version (bumpear manualmente en cada release)
// - COMMIT_SHA: VERCEL_GIT_COMMIT_SHA (auto en Vercel) | NEXT_PUBLIC_GIT_SHA | "dev"
// - DEPLOY_ENV: VERCEL_ENV (production | preview | development) | "local"
//
// Se expone en /api/version y en el footer del dashboard.
import pkg from "../package.json";

const rawSha =
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.NEXT_PUBLIC_GIT_SHA ??
  "";

export const APP_VERSION = pkg.version;
export const COMMIT_SHA = rawSha ? rawSha.slice(0, 7) : "dev";
export const COMMIT_SHA_FULL = rawSha || null;
export const DEPLOY_ENV = process.env.VERCEL_ENV ?? "local";
export const BUILD_TIME = process.env.VERCEL_GIT_COMMIT_AUTHOR_DATE ?? null;

export const VERSION_STRING = `v${APP_VERSION}·${COMMIT_SHA}·${DEPLOY_ENV}`;
