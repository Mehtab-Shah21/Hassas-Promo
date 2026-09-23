import { apiClient } from "./client";
import type { Employee, EmployeeDetail, EmployeeDocumentRecord } from "./types";

export async function listEmployees(activeOnly = true, businessId?: number): Promise<Employee[]> {
  const res = await apiClient.get<Employee[]>("/api/employees", {
    params: { active_only: activeOnly },
    headers: businessId ? { "X-Business-Id": String(businessId) } : undefined,
  });
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

/** Full profile: record, linked login, this month's attendance, salary paid vs pending. */
export async function getEmployeeDetail(id: number): Promise<EmployeeDetail> {
  const res = await apiClient.get<EmployeeDetail>(`/api/employees/${id}`);
  return res.data;
}

export type EmployeeDocument = "emirates-id" | "passport";

export async function uploadEmployeeDocument(
  id: number,
  document: EmployeeDocument,
  file: File,
): Promise<Employee> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await apiClient.post<Employee>(`/api/employees/${id}/documents/${document}`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

/** Attach one more named file — a license, a permit, anything beyond Emirates ID / passport. */
export async function addEmployeeDocument(id: number, name: string, file: File): Promise<EmployeeDocumentRecord> {
  const formData = new FormData();
  formData.append("name", name);
  formData.append("file", file);
  const res = await apiClient.post<EmployeeDocumentRecord>(`/api/employees/${id}/documents`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

export async function removeEmployeeDocument(employeeId: number, documentId: number): Promise<void> {
  await apiClient.delete(`/api/employees/${employeeId}/documents/${documentId}`);
}
