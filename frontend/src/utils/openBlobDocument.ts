/**
 * Fetches a document as a Blob (via the authenticated axios client, so the
 * Bearer token and X-Business-Id header are attached) and opens it from an
 * object URL, instead of navigating the browser directly to the endpoint
 * (which can't carry those headers).
 *
 * The new tab is opened synchronously, before the await, because browsers
 * only allow window.open() during the synchronous part of a click handler —
 * calling it after an awaited fetch gets treated as an unrequested popup and
 * blocked. Its location is then pointed at the blob URL once the fetch
 * resolves. If the popup was blocked outright, falls back to a download.
 */
export async function openBlobDocument(fetchBlob: () => Promise<Blob>, downloadFilename: string): Promise<void> {
  const newTab = window.open("", "_blank");
  try {
    const blob = await fetchBlob();
    const url = URL.createObjectURL(blob);
    if (newTab) {
      newTab.location.href = url;
    } else {
      const a = document.createElement("a");
      a.href = url;
      a.download = downloadFilename;
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    newTab?.close();
    throw err;
  }
}
