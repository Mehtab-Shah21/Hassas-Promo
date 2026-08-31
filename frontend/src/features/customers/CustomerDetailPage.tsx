import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { deactivateCustomer, getCustomer, listEmployees } from "../../api/customers";
import type { Customer } from "../../api/types";
import CustomerFormModal from "./CustomerFormModal";

export default function CustomerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const customerId = Number(id);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [employees, setEmployees] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [addingEmployee, setAddingEmployee] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Customer | null>(null);

  async function load() {
    setLoading(true);
    try {
      const c = await getCustomer(customerId);
      setCustomer(c);
      if (c.type === "company") {
        setEmployees(await listEmployees(customerId));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  async function handleDeactivate() {
    if (!customer) return;
    if (!confirm(`Deactivate ${customer.name}? They'll be hidden from pickers but history is kept.`)) return;
    await deactivateCustomer(customer.id);
    navigate("/customers");
  }

  if (loading || !customer) return <p className="text-sm text-muted">Loading...</p>;

  return (
    <div>
      <button onClick={() => navigate("/customers")} className="mb-3 text-sm text-muted hover:underline">
        ← Back to customers
      </button>

      <div className="rounded-lg border border-line bg-surface p-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-ink">{customer.name}</h1>
            <p className="text-sm capitalize text-muted">
              {customer.type} {!customer.is_active && <span className="text-danger">(inactive)</span>}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(true)}
              className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-white/5"
            >
              Edit
            </button>
            {customer.is_active && (
              <button
                onClick={handleDeactivate}
                className="rounded-md border border-danger/30 px-3 py-1.5 text-sm text-danger hover:bg-danger/10"
              >
                Deactivate
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <Info label="Email" value={customer.email} />
          <Info label="Phone" value={[customer.phone_code, customer.phone].filter(Boolean).join(" ")} />
          <Info label="Tax / ID" value={customer.id_value} />
          <Info
            label="Address"
            value={[customer.address_line1, customer.address_line2, customer.city, customer.state, customer.country]
              .filter(Boolean)
              .join(", ")}
          />
          <Info label="Notes" value={customer.notes} />
        </div>
      </div>

      {customer.type === "company" && (
        <div className="mt-6 rounded-lg border border-line bg-surface p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-ink">Employees</h2>
            <button
              onClick={() => setAddingEmployee(true)}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
            >
              + Add employee
            </button>
          </div>
          {employees.length === 0 ? (
            <p className="text-sm text-muted">No employees added yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs font-semibold uppercase text-muted">
                <tr>
                  <th className="py-1.5">Name</th>
                  <th className="py-1.5">Phone</th>
                  <th className="py-1.5">Email</th>
                  <th className="py-1.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {employees.map((emp) => (
                  <tr key={emp.id}>
                    <td className="py-2 font-medium text-ink">{emp.name}</td>
                    <td className="py-2 text-muted">
                      {emp.phone_code} {emp.phone}
                    </td>
                    <td className="py-2 text-muted">{emp.email}</td>
                    <td className="py-2 text-right">
                      <button onClick={() => setEditingEmployee(emp)} className="text-accent hover:underline">
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {editing && (
        <CustomerFormModal
          customer={customer}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            load();
          }}
        />
      )}
      {addingEmployee && (
        <CustomerFormModal
          forcedParentId={customer.id}
          onClose={() => setAddingEmployee(false)}
          onSaved={() => {
            setAddingEmployee(false);
            load();
          }}
        />
      )}
      {editingEmployee && (
        <CustomerFormModal
          customer={editingEmployee}
          forcedParentId={customer.id}
          onClose={() => setEditingEmployee(null)}
          onSaved={() => {
            setEditingEmployee(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase text-muted">{label}</p>
      <p className="text-muted">{value || "—"}</p>
    </div>
  );
}
