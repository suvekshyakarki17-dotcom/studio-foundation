/**
 * Real website reachability check (shared by the discovery engine and the
 * ScrapeGraphAI execution path).
 *
 * This is a plain, runtime-directive-free module so both the default
 * runtime (src/convex/discovery.ts) and the node-runtime actions
 * (src/convex/scrapegraphai.ts) can import it. The result is an honest
 * status derived from an actual fetch — never a claim.
 */
import type { WebsiteReachabilityState } from "../../shared/discovery";
import { canonicalizeUrl } from "../../shared/discovery/normalize";

export async function performWebsiteCheck(
  website: string | undefined,
): Promise<{
  websiteStatus: WebsiteReachabilityState;
  websiteHttpStatus: number | undefined;
}> {
  if (!website) {
    return { websiteStatus: "NO_WEBSITE", websiteHttpStatus: undefined };
  }
  const canonical = canonicalizeUrl(website);
  if (!canonical) {
    return { websiteStatus: "INVALID_URL", websiteHttpStatus: undefined };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(canonical.url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "AgencyStudio-HealthCheck/0.4" },
    });
    await response.body?.cancel().catch(() => {});
    if (response.ok) {
      return { websiteStatus: "HAS_WEBSITE", websiteHttpStatus: response.status };
    }
    if (response.status === 403 || response.status === 429) {
      return { websiteStatus: "BLOCKED", websiteHttpStatus: response.status };
    }
    return { websiteStatus: "UNREACHABLE", websiteHttpStatus: response.status };
  } catch (error) {
    if (controller.signal.aborted) {
      return { websiteStatus: "UNREACHABLE", websiteHttpStatus: undefined }; // timed out
    }
    if (error instanceof TypeError) {
      return { websiteStatus: "UNREACHABLE", websiteHttpStatus: undefined }; // DNS/network
    }
    return { websiteStatus: "CHECK_FAILED", websiteHttpStatus: undefined };
  } finally {
    clearTimeout(timer);
  }
}
