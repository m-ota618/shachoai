// src/ui/toast.ts
export function showToast(message: string) {
  // 既存のUIフレームワークがあれば差し替えてOK（今は最小のalert）
  // eslint-disable-next-line no-alert
  alert(message);
}
