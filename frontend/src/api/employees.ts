import { apiClient } from "./client";
import type { Employee } from "./types";

export async function listEmployees(activeOnly = true): Promise<Employee[]> {
  const res = await apiClient.get<Employee[]>("/api/employees", { params: { active_only: activeOnly } });
  return res.data;
}

export type EmployeePayload = Partial<Omit<Employee, "id" | "business_id">>;

export async function createEmployee(payload: EmployeePayload): Promise<Employee> {
  const res = await apiClient.post<Employee>("/api/employees", payload);
  return res.data;
}

export async function updateEmployee(id: number, payload: EmployeePayload): Promise<Employee> {
  const res = await apiClient.patch<Employee>(`/api/employees/${id}`, payload);
  return res.data;
}

export async function deactivateEmployee(id: number): Promise<void> {
  await apiClient.delete(`/api/employees/${id}`);
}
