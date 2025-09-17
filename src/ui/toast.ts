// src/ui/toast.ts
export function showToast(message: string) {
  // 既存のUIフレームワークがあれば差し替えてOK（今は最小のalert）
   
  alert(message);
}
