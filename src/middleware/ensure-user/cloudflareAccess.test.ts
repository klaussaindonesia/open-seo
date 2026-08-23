import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveCloudflareAccessContextForMcp } from "./cloudflareAccess";

const mocks = vi.hoisted(() => ({
  jwtVerify: vi.fn(),
  resolveSharedWorkspaceContext: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({
  env: {
    TEAM_DOMAIN: "https://example.cloudflareaccess.com",
    POLICY_AUD: "test-aud",
  },
}));

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "jwks-stub"),
  jwtVerify: mocks.jwtVerify,
}));

vi.mock("./delegated", () => ({
  resolveSharedWorkspaceContext: mocks.resolveSharedWorkspaceContext,
}));

function headersWithToken(token = "the-jwt") {
  return new Headers({ "cf-access-jwt-assertion": token });
}

describe("resolveCloudflareAccessContextForMcp", () => {
  beforeEach(() => {
    mocks.resolveSharedWorkspaceContext.mockResolvedValue({
      userId: "resolved",
      userEmail: "resolved@example.com",
      emailVerified: true,
      organizationId: "org_resolved",
    });
  });

  it("resolves a Service Token principal from the common_name claim", async () => {
    mocks.jwtVerify.mockResolvedValue({
      payload: { common_name: "seo-geo-cron" },
    });

    await resolveCloudflareAccessContextForMcp(headersWithToken());

    expect(mocks.resolveSharedWorkspaceContext).toHaveBeenCalledWith(
      "access-service-token:seo-geo-cron",
      "seo-geo-cron@service.access.invalid",
    );
  });

  it("resolves a human principal from sub/email when there is no common_name", async () => {
    mocks.jwtVerify.mockResolvedValue({
      payload: { sub: "user-abc", email: "alice@example.com" },
    });

    await resolveCloudflareAccessContextForMcp(headersWithToken());

    expect(mocks.resolveSharedWorkspaceContext).toHaveBeenCalledWith(
      "user-abc",
      "alice@example.com",
    );
  });

  it("rejects a payload with neither a common_name nor sub/email", async () => {
    mocks.jwtVerify.mockResolvedValue({ payload: {} });

    await expect(
      resolveCloudflareAccessContextForMcp(headersWithToken()),
    ).rejects.toThrow();
    expect(mocks.resolveSharedWorkspaceContext).not.toHaveBeenCalled();
  });
});
