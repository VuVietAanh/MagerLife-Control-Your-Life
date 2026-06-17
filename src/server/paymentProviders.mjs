import { createHmac } from "node:crypto";

const PRO_PRICE_VND = Number(process.env.MAGERLIFE_PRO_PRICE_VND || 149000);

function env(name, fallback = "") {
  return process.env[name] || fallback;
}

function hmacSha256(data, secret) {
  return createHmac("sha256", secret).update(data).digest("hex");
}

function hmacSha512(data, secret) {
  return createHmac("sha512", secret).update(data).digest("hex");
}

function sortObjectKeys(input) {
  return Object.keys(input)
    .sort()
    .reduce((acc, key) => {
      if (input[key] !== undefined && input[key] !== null && input[key] !== "") acc[key] = input[key];
      return acc;
    }, {});
}

function toQueryString(input, encode = true) {
  return Object.entries(sortObjectKeys(input))
    .map(([key, value]) => `${key}=${encode ? encodeURIComponent(String(value)) : String(value)}`)
    .join("&");
}

function orderCode() {
  return Number(String(Date.now()).slice(-10));
}

function basePayment({ userId, provider, amount = PRO_PRICE_VND }) {
  const id = `${provider}-${Date.now()}`;
  return {
    id,
    orderCode: orderCode(),
    amount: Math.round(Number(amount) || PRO_PRICE_VND),
    description: "MagerLife Pro",
    userId,
  };
}

export function getPaymentProviderStatus() {
  return {
    payos: {
      configured: Boolean(env("PAYOS_CLIENT_ID") && env("PAYOS_API_KEY") && env("PAYOS_CHECKSUM_KEY")),
      requiredEnv: ["PAYOS_CLIENT_ID", "PAYOS_API_KEY", "PAYOS_CHECKSUM_KEY", "PAYOS_RETURN_URL", "PAYOS_CANCEL_URL"],
    },
    momo: {
      configured: Boolean(env("MOMO_PARTNER_CODE") && env("MOMO_ACCESS_KEY") && env("MOMO_SECRET_KEY")),
      requiredEnv: ["MOMO_PARTNER_CODE", "MOMO_ACCESS_KEY", "MOMO_SECRET_KEY", "MOMO_ENDPOINT", "MOMO_IPN_URL", "MOMO_REDIRECT_URL"],
    },
    vnpay: {
      configured: Boolean(env("VNPAY_TMN_CODE") && env("VNPAY_HASH_SECRET") && env("VNPAY_PAYMENT_URL")),
      requiredEnv: ["VNPAY_TMN_CODE", "VNPAY_HASH_SECRET", "VNPAY_PAYMENT_URL", "VNPAY_RETURN_URL"],
    },
  };
}

export async function createPaymentCheckout({ provider, userId, returnUrl, cancelUrl, amount }) {
  if (provider === "payos") return createPayosCheckout({ userId, returnUrl, cancelUrl, amount });
  if (provider === "momo") return createMomoCheckout({ userId, returnUrl, amount });
  if (provider === "vnpay") return createVnpayCheckout({ userId, returnUrl, amount });
  return {
    error: {
      code: "UNSUPPORTED_PAYMENT_PROVIDER",
      message: "Provider must be payos, momo, or vnpay",
    },
  };
}

async function createPayosCheckout({ userId, returnUrl, cancelUrl, amount }) {
  const status = getPaymentProviderStatus().payos;
  if (!status.configured) return { error: { code: "PAYOS_NOT_CONFIGURED", message: "PayOS env keys are missing" } };
  const payment = basePayment({ userId, provider: "payos", amount });
  const resolvedReturnUrl = returnUrl || env("PAYOS_RETURN_URL");
  const resolvedCancelUrl = cancelUrl || env("PAYOS_CANCEL_URL");
  const signatureData = `amount=${payment.amount}&cancelUrl=${resolvedCancelUrl}&description=${payment.description}&orderCode=${payment.orderCode}&returnUrl=${resolvedReturnUrl}`;
  const payload = {
    orderCode: payment.orderCode,
    amount: payment.amount,
    description: payment.description,
    buyerEmail: userId,
    returnUrl: resolvedReturnUrl,
    cancelUrl: resolvedCancelUrl,
    signature: hmacSha256(signatureData, env("PAYOS_CHECKSUM_KEY")),
  };
  const response = await fetch("https://api-merchant.payos.vn/v2/payment-requests", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-client-id": env("PAYOS_CLIENT_ID"),
      "x-api-key": env("PAYOS_API_KEY"),
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.code !== "00") {
    return { error: { code: "PAYOS_CHECKOUT_FAILED", message: result.desc || response.statusText || "Cannot create PayOS checkout" } };
  }
  return {
    provider: "payos",
    checkoutUrl: result.data?.checkoutUrl,
    orderId: String(payment.orderCode),
    amount: payment.amount,
    raw: result.data,
  };
}

async function createMomoCheckout({ userId, returnUrl, amount }) {
  const status = getPaymentProviderStatus().momo;
  if (!status.configured) return { error: { code: "MOMO_NOT_CONFIGURED", message: "MoMo env keys are missing" } };
  const payment = basePayment({ userId, provider: "momo", amount });
  const endpoint = env("MOMO_ENDPOINT", "https://test-payment.momo.vn/v2/gateway/api/create");
  const partnerCode = env("MOMO_PARTNER_CODE");
  const accessKey = env("MOMO_ACCESS_KEY");
  const requestId = payment.id;
  const orderId = payment.id;
  const orderInfo = `${payment.description} ${userId}`;
  const redirectUrl = returnUrl || env("MOMO_REDIRECT_URL");
  const ipnUrl = env("MOMO_IPN_URL");
  const extraData = Buffer.from(JSON.stringify({ userId, plan: "pro" })).toString("base64");
  const requestType = env("MOMO_REQUEST_TYPE", "payWithMethod");
  const rawSignature = `accessKey=${accessKey}&amount=${payment.amount}&extraData=${extraData}&ipnUrl=${ipnUrl}&orderId=${orderId}&orderInfo=${orderInfo}&partnerCode=${partnerCode}&redirectUrl=${redirectUrl}&requestId=${requestId}&requestType=${requestType}`;
  const payload = {
    partnerCode,
    partnerName: "MagerLife",
    storeId: "MagerLife",
    requestId,
    amount: payment.amount,
    orderId,
    orderInfo,
    redirectUrl,
    ipnUrl,
    lang: "vi",
    requestType,
    autoCapture: true,
    extraData,
    signature: hmacSha256(rawSignature, env("MOMO_SECRET_KEY")),
  };
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.payUrl) {
    return { error: { code: "MOMO_CHECKOUT_FAILED", message: result.message || response.statusText || "Cannot create MoMo checkout" } };
  }
  return {
    provider: "momo",
    checkoutUrl: result.payUrl,
    orderId,
    amount: payment.amount,
    raw: result,
  };
}

function createVnpayCheckout({ userId, returnUrl, amount }) {
  const status = getPaymentProviderStatus().vnpay;
  if (!status.configured) return { error: { code: "VNPAY_NOT_CONFIGURED", message: "VNPay env keys are missing" } };
  const payment = basePayment({ userId, provider: "vnpay", amount });
  const now = new Date();
  const createDate = now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const params = {
    vnp_Version: "2.1.0",
    vnp_Command: "pay",
    vnp_TmnCode: env("VNPAY_TMN_CODE"),
    vnp_Amount: payment.amount * 100,
    vnp_CurrCode: "VND",
    vnp_TxnRef: payment.id,
    vnp_OrderInfo: `${payment.description} ${userId}`,
    vnp_OrderType: "other",
    vnp_Locale: "vn",
    vnp_ReturnUrl: returnUrl || env("VNPAY_RETURN_URL"),
    vnp_IpAddr: "127.0.0.1",
    vnp_CreateDate: createDate,
  };
  const signedData = toQueryString(params, false);
  const secureHash = hmacSha512(signedData, env("VNPAY_HASH_SECRET"));
  return {
    provider: "vnpay",
    checkoutUrl: `${env("VNPAY_PAYMENT_URL")}?${toQueryString({ ...params, vnp_SecureHash: secureHash })}`,
    orderId: payment.id,
    amount: payment.amount,
  };
}
