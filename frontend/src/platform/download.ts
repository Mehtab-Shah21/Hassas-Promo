/**
 * Downloads a blob to the user's filesystem under the given filename.
 *
 * Every "Download" button in the app calls this one function instead of
 * building an <a download> element directly, so there is exactly one place
 * to change behavior for a given deployment target.
 *
 * Current (browser/dev) implementation: a synthetic <a download> click on
 * an object URL — the browser's normal download-bar behavior.
 *
 * >>> TAURI SWAP POINT <<<
 * Once this app is wrapped in Tauri (Prompt 14 packaging), replace this
 * function's body with Tauri's native save-file dialog instead of the
 * synthetic click below — e.g. `@tauri-apps/plugin-dialog`'s `save()` to
 * ask the user where to save, then `@tauri-apps/plugin-fs`'s `writeFile()`
 * to write the blob's bytes there. That gives a real OS "Save As" dialog
 * instead of the browser's download bar. No call site outside this file
 * needs to change.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
