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
  /** Final URL after redirects (provenance for websiteFinalUrl). */
  websiteFinalUrl: string | undefined;
}> {
  // Absence of a URL is NOT proof of absence: without a URL there is
  // nothing to reach, so the state stays UNKNOWN until a verification
  // search positively confirms the business has no official website.
  if (!website) {
    return { websiteStatus: "UNKNOWN", websiteHttpStatus: undefined, websiteFinalUrl: undefined };
  }
  const canonical = canonicalizeUrl(website);
  if (!canonical) {
    return { websiteStatus: "INVALID_URL", websiteHttpStatus: undefined, websiteFinalUrl: undefined };
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
    const finalUrl =
      response.url && response.url !== "" ? response.url : canonical.url;
    if (response.ok) {
      return {
        websiteStatus: "HAS_WEBSITE",
        websiteHttpStatus: response.status,
        websiteFinalUrl: finalUrl,
      };
    }
    if (response.status === 403 || response.status === 429) {
      return {
        websiteStatus: "BLOCKED",
        websiteHttpStatus: response.status,
        websiteFinalUrl: finalUrl,
      };
    }
    return {
      websiteStatus: "UNREACHABLE",
      websiteHttpStatus: response.status,
      websiteFinalUrl: finalUrl,
    };
  } catch (error) {
    if (controller.signal.aborted) {
      return { websiteStatus: "UNREACHABLE", websiteHttpStatus: undefined, websiteFinalUrl: undefined }; // timed out
    }
    if (error instanceof TypeError) {
      return { websiteStatus: "UNREACHABLE", websiteHttpStatus: undefined, websiteFinalUrl: undefined }; // DNS/network
    }
    return { websiteStatus: "CHECK_FAILED", websiteHttpStatus: undefined, websiteFinalUrl: undefined };
  } finally {
    clearTimeout(timer);
  }
}
