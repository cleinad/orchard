import Stripe from 'stripe';

let stripe: Stripe | null = null;

export function getStripe() {
  if (stripe) {
    return stripe;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY.');
  }

  stripe = new Stripe(secretKey);
  return stripe;
}

export function getAppUrl() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return appUrl.replace(/\/+$/, '');
}
