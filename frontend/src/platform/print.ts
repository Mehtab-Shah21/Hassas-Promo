/**
 * Prints a PDF blob.
 *
 * Every "Print" button in the app calls this one function instead of
 * touching window.print()/iframes directly, so there is exactly one place
 * to change behavior for a given deployment target.
 *
 * Current (browser/dev) implementation: loads the PDF into a hidden iframe
 * and invokes the browser's native print dialog against it.
 *
 * >>> TAURI SWAP POINT <<<
 * Once this app is wrapped in Tauri (Prompt 14 packaging), replace this
 * function's body with a call to Tauri's native print API instead of the
 * hidden-iframe + window.print() trick below — e.g. write the blob to a
 * temp file and invoke the OS print dialog on it (Tauri's `dialog`/`fs`
 * plugins, or a small Rust command exposed via `invoke`). No call site
 * outside this file needs to change.
 */
export async function printPdfBlob(blob: Blob): Promise<void> {
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";

  await new Promise<void>((resolve, reject) => {
    iframe.onload = () => resolve();
    iframe.onerror = () => reject(new Error("Failed to load PDF for printing"));
    iframe.src = url;
    document.body.appendChild(iframe);
  });

  const win = iframe.contentWindow;
  if (!win) {
    document.body.removeChild(iframe);
    URL.revokeObjectURL(url);
    throw new Error("Could not access the print frame");
  }
  win.focus();
  win.print();

  // Give the print dialog time to read the document before cleaning up —
  // there's no reliable "print dialog closed" event across browsers.
  setTimeout(() => {
    if (iframe.parentNode) document.body.removeChild(iframe);
    URL.revokeObjectURL(url);
  }, 60_000);
}
