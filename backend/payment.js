const PAYMENT_API_BASE = process.env.PAYMENT_API_BASE || 'https://payment.dianrp.com';
const PAYMENT_API_KEY = process.env.PAYMENT_API_KEY || '';

export async function createQrisPayment({ referenceId, amount, fee = 0, expiresInMinutes = 15 }) {
  const res = await fetch(`${PAYMENT_API_BASE}/v2/qris`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${PAYMENT_API_KEY}`,
      'User-Agent': 'Sawerdian/1.0',
    },
    body: JSON.stringify({ referenceId, amount, fee, expiresInMinutes }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Payment API error (${res.status}): ${err}`);
  }
  return res.json();
}

export async function cancelQrisPayment({ referenceId }) {
  const res = await fetch(`${PAYMENT_API_BASE}/v2/qris-cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${PAYMENT_API_KEY}`,
      'User-Agent': 'Sawerdian/1.0',
    },
    body: JSON.stringify({ referenceId }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Payment cancel API error (${res.status}): ${err}`);
  }
  return res.json();
}

export async function checkPaymentStatus({ referenceId, transactionId }) {
  const params = new URLSearchParams({ referenceId, transactionId });
  const res = await fetch(`${PAYMENT_API_BASE}/v2/payment-status?${params}`, {
    headers: {
      'Authorization': `Bearer ${PAYMENT_API_KEY}`,
      'User-Agent': 'Sawerdian/1.0',
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Payment status API error (${res.status}): ${err}`);
  }
  return res.json();
}
