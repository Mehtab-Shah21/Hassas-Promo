import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Props<T> {
  placeholder: string;
  fetchOptions: (query: string) => Promise<T[]>;
  getLabel: (item: T) => string;
  getSubLabel?: (item: T) => string | null | undefined;
  onSelect: (item: T) => void;
  extraOption?: { label: string; onClick: () => void };
}

const MAX_MENU_HEIGHT = 256;
// Below this, there isn't enough room under the input to show a useful number
// of results, so the menu flips above it instead.
const MIN_MENU_HEIGHT = 140;
const GAP = 4;

interface MenuPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

export default function SearchCombobox<T>({
  placeholder,
  fetchOptions,
  getLabel,
  getSubLabel,
  onSelect,
  extraOption,
}: Props<T>) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<T[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => {
      setLoading(true);
      fetchOptions(query)
        .then(setOptions)
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(handle);
  }, [query, open, fetchOptions]);

  // The menu is portalled to <body> and positioned with fixed coordinates so
  // it can't be clipped by an ancestor that scrolls — the line-item table sits
  // in an overflow-x-auto wrapper, and overflow-x:auto forces overflow-y:auto,
  // which used to cut the results off and add a stray vertical scrollbar.
  const reposition = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    const rect = input.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - GAP * 2;
    const above = rect.top - GAP * 2;
    const flipUp = below < MIN_MENU_HEIGHT && above > below;
    const maxHeight = Math.min(MAX_MENU_HEIGHT, flipUp ? above : below);
    setPosition({
      top: flipUp ? rect.top - GAP - maxHeight : rect.bottom + GAP,
      left: rect.left,
      width: rect.width,
      maxHeight,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    reposition();
    // Capture phase so scrolling *any* ancestor moves the menu with the input,
    // not just the window.
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, reposition]);

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      // The menu lives outside this component's DOM subtree now, so it has to
      // be checked separately — otherwise closing on mousedown would unmount
      // the option before its click event could land.
      if (inputRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const menu = open && position && (
    <div
      ref={menuRef}
      className="fixed z-50 overflow-y-auto rounded-md border border-line bg-surface shadow-floating"
      style={{ top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight }}
    >
      {loading ? (
        <div className="px-3 py-2 text-sm text-muted">Searching...</div>
      ) : options.length === 0 ? (
        <div className="px-3 py-2 text-sm text-muted">No matches</div>
      ) : (
        options.map((opt, i) => (
          <button
            type="button"
            key={i}
            onClick={() => {
              onSelect(opt);
              setOpen(false);
              setQuery("");
            }}
            className="block w-full px-3 py-2 text-left text-sm hover:bg-wash-1"
          >
            <div className="font-medium text-ink">{getLabel(opt)}</div>
            {getSubLabel?.(opt) && <div className="text-xs text-muted">{getSubLabel(opt)}</div>}
          </button>
        ))
      )}
      {extraOption && (
        <button
          type="button"
          onClick={() => {
            extraOption.onClick();
            setOpen(false);
          }}
          className="block w-full border-t border-line px-3 py-2 text-left text-sm font-medium text-link hover:bg-wash-1"
        >
          {extraOption.label}
        </button>
      )}
    </div>
  );

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            return;
          }
          if (e.key !== "Enter") return;
          // Enter belongs to the search: it picks the top match. Without
          // stopPropagation the form's "Enter advances a field" handler would
          // move focus off a search that hasn't resolved to anything yet.
          e.preventDefault();
          e.stopPropagation();
          if (open && !loading && options.length > 0) {
            onSelect(options[0]);
            setOpen(false);
            setQuery("");
          }
        }}
        placeholder={placeholder}
        className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
      />
      {menu && createPortal(menu, document.body)}
    </div>
  );
}
