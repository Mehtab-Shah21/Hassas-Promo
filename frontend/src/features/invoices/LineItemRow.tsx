import { useCallback } from "react";
import { listServices } from "../../api/services";
import SearchCombobox from "../../components/SearchCombobox";
import { useAuth } from "../../context/AuthContext";
import type { Service } from "../../api/types";

export interface LineItemState {
  key: string;
  service_id: number | null;
  description: string;
  qty: number;
  unit_price: number;
  govt_fee: number;
  discount: number;
  vat_rate: number;
  save_as_service: boolean;
  isAdhoc: boolean;
}

export function emptyLine(defaultVat: number): LineItemState {
  return {
    key: crypto.randomUUID(),
    service_id: null,
    description: "",
    qty: 1,
    unit_price: 0,
    govt_fee: 0,
    discount: 0,
    vat_rate: defaultVat,
    save_as_service: false,
    isAdhoc: false,
  };
}

export function lineTotal(line: LineItemState) {
  const net = Math.max(line.qty * line.unit_price - line.discount, 0);
  const vat = net * (line.vat_rate / 100);
  return net + vat;
}

export default function LineItemRow({
  line,
  defaultVat,
  onChange,
  onRemove,
}: {
  line: LineItemState;
  defaultVat: number;
  onChange: (line: LineItemState) => void;
  onRemove: () => void;
}) {
  const { user } = useAuth();

  const fetchServices = useCallback(async (query: string) => {
    const res = await listServices({ search: query || undefined, page: 1, page_size: 15 });
    return res.items;
  }, []);

  function selectService(s: Service) {
    onChange({
      ...line,
      service_id: s.id,
      description: s.name,
      unit_price: s.price,
      govt_fee: s.govt_fee,
      vat_rate: s.taxable ? defaultVat : 0,
      isAdhoc: false,
      save_as_service: false,
    });
  }

  function switchToAdhoc(query: string) {
    onChange({
      ...line,
      service_id: null,
      description: query,
      isAdhoc: true,
    });
  }

  return (
    <tr className="border-b border-line">
      <td className="px-2 py-2 align-top" style={{ minWidth: 220 }}>
        {line.isAdhoc || line.description ? (
          <div>
            <input
              value={line.description}
              onChange={(e) => onChange({ ...line, description: e.target.value })}
              className="w-full rounded-md border border-line px-2 py-1 text-sm"
              placeholder="Description"
            />
            {line.service_id === null && (
              <div className="mt-1 flex items-center gap-2">
                <span className="text-xs text-muted">Ad-hoc line</span>
                {user?.role === "admin" && (
                  <label className="flex items-center gap-1 text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={line.save_as_service}
                      onChange={(e) => onChange({ ...line, save_as_service: e.target.checked })}
                    />
                    Save to services
                  </label>
                )}
              </div>
            )}
          </div>
        ) : (
          <SearchCombobox<Service>
            placeholder="Search service..."
            fetchOptions={fetchServices}
            getLabel={(s) => s.name}
            getSubLabel={(s) => `${s.price.toFixed(2)} + govt ${s.govt_fee.toFixed(2)}`}
            onSelect={selectService}
            extraOption={{
              label: "+ Add as ad-hoc line",
              onClick: () => switchToAdhoc(""),
            }}
          />
        )}
      </td>
      <td className="px-2 py-2 align-top">
        <input
          type="number"
          min="0"
          step="0.01"
          value={line.qty}
          onChange={(e) => onChange({ ...line, qty: Number(e.target.value) })}
          className="w-20 rounded-md border border-line px-2 py-1 text-sm"
        />
      </td>
      <td className="px-2 py-2 align-top">
        <input
          type="number"
          min="0"
          step="0.01"
          value={line.unit_price}
          onChange={(e) => onChange({ ...line, unit_price: Number(e.target.value) })}
          className="w-24 rounded-md border border-line px-2 py-1 text-sm"
        />
      </td>
      <td className="px-2 py-2 align-top">
        <input
          type="number"
          min="0"
          step="0.01"
          value={line.govt_fee}
          onChange={(e) => onChange({ ...line, govt_fee: Number(e.target.value) })}
          className="w-24 rounded-md border border-line px-2 py-1 text-sm"
        />
      </td>
      <td className="px-2 py-2 align-top">
        <input
          type="number"
          min="0"
          step="0.01"
          value={line.discount}
          onChange={(e) => onChange({ ...line, discount: Number(e.target.value) })}
          className="w-20 rounded-md border border-line px-2 py-1 text-sm"
        />
      </td>
      <td className="px-2 py-2 align-top">
        <input
          type="number"
          min="0"
          step="0.01"
          value={line.vat_rate}
          onChange={(e) => onChange({ ...line, vat_rate: Number(e.target.value) })}
          className="w-16 rounded-md border border-line px-2 py-1 text-sm"
        />
      </td>
      <td className="px-2 py-2 text-right align-top text-sm font-medium text-muted">
        {lineTotal(line).toFixed(2)}
      </td>
      <td className="px-2 py-2 align-top">
        <button type="button" onClick={onRemove} className="text-muted hover:text-danger">
          ✕
        </button>
      </td>
    </tr>
  );
}
