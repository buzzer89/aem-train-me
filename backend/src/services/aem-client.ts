import { config } from "../config.js";

const authHeader = () =>
  "Basic " + Buffer.from(`${config.aemInstance.username}:${config.aemInstance.password}`).toString("base64");

async function aemFetch(urlPath: string, options?: RequestInit): Promise<Response> {
  const url = `${config.aemInstance.authorUrl}${urlPath}`;
  return fetch(url, {
    ...options,
    headers: {
      Authorization: authHeader(),
      ...options?.headers,
    },
  });
}

export interface BundleInfo {
  id: number;
  name: string;
  symbolicName: string;
  state: string;
  version: string;
}

export async function checkBundleStatus(bundleName: string): Promise<BundleInfo | null> {
  try {
    const res = await aemFetch("/system/console/bundles.json");
    if (!res.ok) return null;
    const data = (await res.json()) as { data: BundleInfo[] };
    return data.data.find(
      (b: BundleInfo) =>
        b.symbolicName.includes(bundleName) || b.name.toLowerCase().includes(bundleName.toLowerCase())
    ) ?? null;
  } catch {
    return null;
  }
}

export async function getAllBundles(): Promise<BundleInfo[]> {
  try {
    const res = await aemFetch("/system/console/bundles.json");
    if (!res.ok) return [];
    const data = (await res.json()) as { data: BundleInfo[] };
    return data.data;
  } catch {
    return [];
  }
}

export async function checkHttpStatus(urlPath: string): Promise<{ status: number; ok: boolean }> {
  try {
    const url = urlPath.startsWith("http") ? urlPath : `${config.aemInstance.authorUrl}${urlPath}`;
    const res = await fetch(url, {
      headers: { Authorization: authHeader() },
      redirect: "follow",
    });
    return { status: res.status, ok: res.ok };
  } catch {
    return { status: 0, ok: false };
  }
}

export async function queryJcr(jcrPath: string): Promise<unknown> {
  try {
    const res = await aemFetch(`${jcrPath}.infinity.json`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export interface CreatePageResult {
  success: boolean;
  path?: string;
  error?: string;
}

/**
 * Create an AEM page (or update its jcr:content properties) using the Sling POST servlet.
 * parentPath + pageName must both be supplied; all other properties are written to jcr:content.
 */
export async function createAemPage(opts: {
  parentPath: string;
  pageName: string;
  title: string;
  template: string;
  extraProperties?: Record<string, string>;
}): Promise<CreatePageResult> {
  const { parentPath, pageName, title, template, extraProperties = {} } = opts;

  // Step 1: create the cq:Page node
  const pageBody = new URLSearchParams({
    "jcr:primaryType": "cq:Page",
    ":name": pageName,
  });
  const pageRes = await aemFetch(`${parentPath}/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: pageBody.toString(),
  });

  if (!pageRes.ok && pageRes.status !== 200 && pageRes.status !== 201) {
    // 200 means it already exists — that's fine
    const text = await pageRes.text();
    if (!text.includes("already exists") && pageRes.status !== 200) {
      return { success: false, error: `Failed to create page node (${pageRes.status}): ${text.slice(0, 200)}` };
    }
  }

  // Step 2: set jcr:content properties
  const contentBody = new URLSearchParams({
    "jcr:primaryType": "cq:PageContent",
    "jcr:title": title,
    "cq:template": template,
    "sling:resourceType": "wcm/foundation/components/responsivegrid",
    ...extraProperties,
  });
  const contentRes = await aemFetch(`${parentPath}/${pageName}/jcr:content`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: contentBody.toString(),
  });

  if (!contentRes.ok) {
    const text = await contentRes.text();
    return { success: false, error: `Failed to set page content (${contentRes.status}): ${text.slice(0, 200)}` };
  }

  return { success: true, path: `${parentPath}/${pageName}` };
}

export async function tailErrorLog(lines = 100): Promise<string> {
  try {
    const res = await aemFetch(`/system/console/slinglog/tailer.txt?tail=${lines}&name=%2Flogs%2Ferror.log`);
    if (!res.ok) return `Failed to fetch logs: ${res.status}`;
    return await res.text();
  } catch (e) {
    return `Error connecting to AEM: ${(e as Error).message}`;
  }
}

export async function healthCheck(): Promise<{
  aemReachable: boolean;
  bundlesOk: boolean;
  status: string;
}> {
  try {
    const res = await aemFetch("/system/console/bundles.json");
    if (!res.ok) return { aemReachable: false, bundlesOk: false, status: "AEM unreachable" };
    const data = (await res.json()) as { data: BundleInfo[] };
    const broken = data.data.filter(
      (b) => b.state !== "Active" && b.state !== "Fragment"
    );
    const bundlesOk = broken.length === 0;
    const status = bundlesOk
      ? "OK"
      : `${broken.length} bundle(s) not active: ${broken.slice(0, 3).map((b) => `${b.symbolicName} (${b.state})`).join(", ")}`;
    return { aemReachable: true, bundlesOk, status };
  } catch {
    return { aemReachable: false, bundlesOk: false, status: "AEM unreachable" };
  }
}

export async function runPostDeployValidation(): Promise<Array<{ check: string; passed: boolean; detail: string }>> {
  const results: Array<{ check: string; passed: boolean; detail: string }> = [];
  const artifactId = config.aemProject.artifactId;

  // Check bundle status
  const bundle = await checkBundleStatus(artifactId);
  results.push({
    check: "OSGi Bundle",
    passed: bundle?.state === "Active",
    detail: bundle ? `${bundle.symbolicName} — ${bundle.state}` : "Bundle not found",
  });

  // Check content page
  const contentRoot = config.aemProject.contentRoot;
  const pageCheck = await checkHttpStatus(`/content/${contentRoot}/us/en.html`);
  results.push({
    check: "Content Page",
    passed: pageCheck.ok,
    detail: `GET /content/${contentRoot}/us/en.html → ${pageCheck.status}`,
  });

  // Ensure trainer-tests root page exists — auto-create if missing
  const testPageCheck = await checkHttpStatus(`/content/${contentRoot}/trainer-tests.html`);
  if (testPageCheck.status === 404) {
    // Find a template to use from the content root
    const rootContent = await queryJcr(`/content/${contentRoot}`) as Record<string, unknown> | null;
    const template =
      (rootContent?.["jcr:content"] as Record<string, unknown>)?.["cq:template"] as string | undefined
      ?? `/conf/${contentRoot}/settings/wcm/templates/page`;

    const created = await createAemPage({
      parentPath: `/content/${contentRoot}`,
      pageName: "trainer-tests",
      title: "Trainer Tests",
      template,
    });
    results.push({
      check: "Trainer Tests Root",
      passed: created.success,
      detail: created.success
        ? `Created /content/${contentRoot}/trainer-tests`
        : `Auto-create failed: ${created.error}`,
    });
  } else {
    results.push({
      check: "Trainer Tests Root",
      passed: testPageCheck.ok,
      detail: `GET /content/${contentRoot}/trainer-tests.html → ${testPageCheck.status}`,
    });
  }

  return results;
}
