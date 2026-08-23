import { env } from "cloudflare:workers";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { AppError } from "@/server/lib/errors";
import { validateTeamDomain } from "@/shared/selfhost-checks";
import { classifyAccessVerificationError } from "./accessTokenErrors";
import { resolveSharedWorkspaceContext } from "./delegated";
import type { EnsuredUserContext } from "./types";

// Service Tokens have no email — Cloudflare Access identifies them by this
// claim instead. Kept out of the real email namespace with the RFC 2606
// reserved .invalid TLD so a synthesized identity can never collide with a
// real user's address.
const SERVICE_TOKEN_EMAIL_SUFFIX = "@service.access.invalid";

const jwksByTeamDomain = new Map<
  string,
  ReturnType<typeof createRemoteJWKSet>
>();

function getJwks(teamDomain: string) {
  const existing = jwksByTeamDomain.get(teamDomain);
  if (existing) {
    return existing;
  }

  const jwks = createRemoteJWKSet(
    new URL(`${teamDomain}/cdn-cgi/access/certs`),
  );

  jwksByTeamDomain.set(teamDomain, jwks);

  return jwks;
}

function getValidatedTeamDomain(teamDomain: string) {
  const result = validateTeamDomain(teamDomain);

  if (!result.ok) {
    throw new AppError("AUTH_CONFIG_MISSING", result.message);
  }

  return result.origin;
}

/**
 * Verifies the `Cf-Access-Jwt-Assertion` header Cloudflare Access injects
 * once a request has passed its policy (human SSO or a Service Token), and
 * returns its payload. Shared by every self-host Access identity resolver —
 * only what each does with a valid payload differs.
 */
async function verifyCloudflareAccessAssertion(
  headers: Headers,
): Promise<JWTPayload> {
  const teamDomain = env.TEAM_DOMAIN
    ? getValidatedTeamDomain(env.TEAM_DOMAIN)
    : null;
  const policyAud = env.POLICY_AUD?.trim() || null;

  if (!teamDomain || !policyAud) {
    const missing = [
      teamDomain ? null : "TEAM_DOMAIN",
      policyAud ? null : "POLICY_AUD",
    ]
      .filter(Boolean)
      .join(" and ");
    throw new AppError(
      "AUTH_CONFIG_MISSING",
      `Missing Cloudflare Access configuration: set ${missing} on the deployment. See docs/SELF_HOSTING_CLOUDFLARE.md.`,
    );
  }

  const token = headers.get("cf-access-jwt-assertion");

  if (!token) {
    // With Access enabled in front of the deployment, every request carries
    // this header — its absence means Access is not actually protecting the
    // route, which is a setup problem, not a signed-out user.
    throw new AppError(
      "AUTH_CONFIG_MISSING",
      "No Cloudflare Access token on the request. Cloudflare Access is not enabled in front of this deployment — add an Access application covering this hostname in Zero Trust, or set AUTH_MODE=local_noauth if you intend to run without auth on a private network.",
    );
  }

  // Only the token verification itself is classified — anything thrown past
  // this block (user resolution, DB access) is an app fault, and classifying
  // it here would mislabel a DB outage as an auth-config problem.
  try {
    const jwks = getJwks(teamDomain);
    const { payload } = await jwtVerify(token, jwks, {
      issuer: teamDomain,
      audience: policyAud,
    });
    return payload;
  } catch (error) {
    // The classified AppError carries operator guidance; log the raw jose
    // error too, since it is the only place the underlying cause survives.
    console.error("Cloudflare Access token verification failed:", error);

    throw classifyAccessVerificationError(error);
  }
}

export async function resolveCloudflareAccessContext(
  headers: Headers,
): Promise<EnsuredUserContext> {
  const payload = await verifyCloudflareAccessAssertion(headers);

  const userId = typeof payload.sub === "string" ? payload.sub : null;
  const userEmail = typeof payload.email === "string" ? payload.email : null;

  if (!userId || !userEmail) {
    throw new AppError("UNAUTHENTICATED");
  }

  return resolveSharedWorkspaceContext(userId, userEmail);
}

/**
 * MCP-specific variant: also accepts a Cloudflare Access Service Token
 * principal (identified by the JWT's `common_name` claim rather than an
 * `email`), for headless/cron callers that can't complete an interactive
 * OAuth login. Access's own policy already decides which service tokens may
 * reach this route at all — this only maps an already-verified token to a
 * stable app identity. Human callers fall through to the same resolution as
 * {@link resolveCloudflareAccessContext}. Not used by non-MCP routes: a
 * service token has no business browsing the dashboard UI.
 */
export async function resolveCloudflareAccessContextForMcp(
  headers: Headers,
): Promise<EnsuredUserContext> {
  const payload = await verifyCloudflareAccessAssertion(headers);

  const commonName =
    typeof payload.common_name === "string" ? payload.common_name : null;
  if (commonName) {
    return resolveSharedWorkspaceContext(
      `access-service-token:${commonName}`,
      `${commonName}${SERVICE_TOKEN_EMAIL_SUFFIX}`,
    );
  }

  const userId = typeof payload.sub === "string" ? payload.sub : null;
  const userEmail = typeof payload.email === "string" ? payload.email : null;

  if (!userId || !userEmail) {
    throw new AppError("UNAUTHENTICATED");
  }

  return resolveSharedWorkspaceContext(userId, userEmail);
}
