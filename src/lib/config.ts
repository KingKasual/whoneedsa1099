/** Build-time configuration. Values come from VITE_* env vars set in CI; never secrets. */
export const SITE_URL: string = (import.meta.env.VITE_SITE_URL as string | undefined) ?? 'https://YOURDOMAIN.com';
export const PAYMENTS_ENABLED: boolean = import.meta.env.VITE_PAYMENTS_ENABLED === 'true';
export const CHECKOUT_SINGLE_URL: string = (import.meta.env.VITE_CHECKOUT_SINGLE_URL as string | undefined) ?? '';
export const CHECKOUT_PACK_URL: string = (import.meta.env.VITE_CHECKOUT_PACK_URL as string | undefined) ?? '';
/** Dev builds can unlock paid features locally for testing. Never true in a production build. */
export const DEV_UNLOCK: boolean = import.meta.env.DEV;
