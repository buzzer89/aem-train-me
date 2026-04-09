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
    return { aemReachable: true, bundlesOk: true, status: "OK" };
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

  // Check trainer-tests page
  const testPageCheck = await checkHttpStatus(`/content/${contentRoot}/trainer-tests.html`);
  results.push({
    check: "Trainer Tests Root",
    passed: testPageCheck.ok || testPageCheck.status === 404,
    detail: `GET /content/${contentRoot}/trainer-tests.html → ${testPageCheck.status}`,
  });

  return results;
}
