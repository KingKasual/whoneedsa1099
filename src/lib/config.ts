/** Build-time configuration. Values come from VITE_* env vars set in CI; never secrets. */
export const SITE_URL: string = (import.meta.env.VITE_SITE_URL as string | undefined) ?? 'https://www.whoneedsa1099.com';
export const PAYMENTS_ENABLED: boolean = import.meta.env.VITE_PAYMENTS_ENABLED === 'true';
export const CHECKOUT_SINGLE_URL: string = (import.meta.env.VITE_CHECKOUT_SINGLE_URL as string | undefined) ?? '';
export const CHECKOUT_PACK_URL: string = (import.meta.env.VITE_CHECKOUT_PACK_URL as string | undefined) ?? '';
/**
 * Test unlock: dev server, or a preview build made with VITE_TEST_UNLOCK=true.
 * check:release fails any production build that sets it.
 */
export const TEST_MODE: boolean = import.meta.env.VITE_TEST_UNLOCK === 'true';
export const DEV_UNLOCK: boolean = import.meta.env.DEV || TEST_MODE;
