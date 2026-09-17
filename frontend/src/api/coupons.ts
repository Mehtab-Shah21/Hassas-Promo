import { apiClient } from "./client";
import type { Coupon } from "./types";

export async function listCoupons(activeOnly = false): Promise<Coupon[]> {
  const res = await apiClient.get<Coupon[]>("/api/coupons", { params: { active_only: activeOnly } });
  return res.data;
}

// banner_path is set only by uploading an image, never through the payload.
export type CouponPayload = Partial<Omit<Coupon, "id" | "business_id" | "banner_path">>;

export async function createCoupon(payload: CouponPayload): Promise<Coupon> {
  const res = await apiClient.post<Coupon>("/api/coupons", payload);
  return res.data;
}

export async function updateCoupon(id: number, payload: CouponPayload): Promise<Coupon> {
  const res = await apiClient.patch<Coupon>(`/api/coupons/${id}`, payload);
  return res.data;
}

export async function deactivateCoupon(id: number): Promise<void> {
  await apiClient.delete(`/api/coupons/${id}`);
}

// Printed-banner coupons only: the artwork printed on invoices (PNG/JPG, <5MB).
export async function uploadCouponBanner(id: number, file: File): Promise<Coupon> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await apiClient.post<Coupon>(`/api/coupons/${id}/banner`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}
