import { useState, type FormEvent } from "react";
import {
  createServiceCategory,
  deactivateServiceCategory,
  updateServiceCategory,
} from "../../api/services";
import Modal from "../../components/Modal";
import type { ServiceCategory } from "../../api/types";

export default function CategoriesModal({
  categories,
  onClose,
  onChanged,
}: {
  categories: ServiceCategory[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await createServiceCategory({ name: name.trim() });
    setName("");
    onChanged();
  }

  async function handleRename(id: number) {
    if (!editingName.trim()) return;
    await updateServiceCategory(id, { name: editingName.trim() });
    setEditingId(null);
    onChanged();
  }

  async function handleRemove(id: number) {
    if (!confirm("Deactivate this category? Services already assigned to it keep it, but it won't be offered for new ones.")) return;
    await deactivateServiceCategory(id);
    onChanged();
  }

  return (
    <Modal title="Manage categories" onClose={onClose}>
      <form onSubmit={handleAdd} className="mb-4 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New category name"
          className="flex-1 rounded-md border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
        <button type="submit" className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity">
          Add
        </button>
      </form>
      <ul className="divide-y divide-line">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center justify-between py-2">
            {editingId === c.id ? (
              <input
                autoFocus
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={() => handleRename(c.id)}
                onKeyDown={(e) => e.key === "Enter" && handleRename(c.id)}
                className="flex-1 rounded-md border border-line px-2 py-1 text-sm"
              />
            ) : (
              <span className="text-sm text-ink">{c.name}</span>
            )}
            <div className="flex gap-3 text-sm">
              <button
                onClick={() => {
                  setEditingId(c.id);
                  setEditingName(c.name);
                }}
                className="text-accent hover:underline"
              >
                Rename
              </button>
              <button onClick={() => handleRemove(c.id)} className="text-danger hover:underline">
                Remove
              </button>
            </div>
          </li>
        ))}
        {categories.length === 0 && <p className="py-2 text-sm text-muted">No categories yet.</p>}
      </ul>
    </Modal>
  );
}
