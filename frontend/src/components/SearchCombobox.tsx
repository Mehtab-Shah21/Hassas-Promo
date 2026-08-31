import { useEffect, useRef, useState } from "react";

interface Props<T> {
  placeholder: string;
  fetchOptions: (query: string) => Promise<T[]>;
  getLabel: (item: T) => string;
  getSubLabel?: (item: T) => string | null | undefined;
  onSelect: (item: T) => void;
  extraOption?: { label: string; onClick: () => void };
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
  const containerRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-line bg-surface shadow-floating">
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
                className="block w-full px-3 py-2 text-left text-sm hover:bg-white/5"
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
              className="block w-full border-t border-line px-3 py-2 text-left text-sm font-medium text-accent hover:bg-white/5"
            >
              {extraOption.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
