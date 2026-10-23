// Shared formatters for the LMS. Naira formatting is the canonical version —
// every payment-related component imports it from here rather than re-deriving.

export const formatNaira = (amount) => {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "₦0";
  return "₦" + n.toLocaleString("en-NG");
};

export const formatPaymentType = (type) => {
  if (type === "subscription") return "Monthly Sub";
  if (type === "one_time") return "One-time";
  return type ?? "";
};

export const formatPaymentStatus = (status) => {
  const map = {
    paid: "Paid",
    pending: "Pending",
    failed: "Failed",
    refunded: "Refunded",
  };
  return map[status] ?? status ?? "";
};
