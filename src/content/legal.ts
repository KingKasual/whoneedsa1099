/**
 * Terms, Privacy, Disclaimer. Drafts, not reviewed by a lawyer.
 * SELLER / CONTACT come from build env so no personal details live in the repo.
 */
const SELLER = process.env.VITE_SELLER_NAME ?? '[Seller name]';
const CONTACT = process.env.VITE_CONTACT_EMAIL ?? '[contact email]';
const UPDATED = '2026-11-14';

export interface LegalPage {
  slug: string;
  title: string;
  description: string;
  updated: string;
  html: string;
}

export const LEGAL: LegalPage[] = [
  {
    slug: 'disclaimer',
    title: 'Disclaimer: not tax advice',
    description: 'WhoGetsA1099 is an informational tool, not tax, legal or accounting advice.',
    updated: UPDATED,
    html: `
<p><strong>WhoGetsA1099 is not tax, legal or accounting advice, and using it does not create a professional relationship.</strong></p>
<p>The checker applies a simplified reading of federal rules for tax year 2026 to the data and answers you provide. It can be wrong: your exports may be incomplete, a payee may be tagged incorrectly, rules may have exceptions we don't model (for example medical payments, fishing boat proceeds, direct sales, payments to foreign persons, or employees misclassified as contractors), and IRS or state guidance can change.</p>
<p>State information marked "verify" has not been confirmed against official 2026 guidance. Every verdict shows the rule and source it relied on so you can check it.</p>
<p>You are responsible for your own information returns. Confirm results with the current IRS instructions or a qualified tax professional before filing.</p>`,
  },
  {
    slug: 'privacy',
    title: 'Privacy policy',
    description: 'Your files, payee names and tax IDs never leave your browser.',
    updated: UPDATED,
    html: `
<h2>The short version</h2>
<p>Your files, payment data, payee names and taxpayer identification numbers (TINs) are processed <strong>entirely in your browser</strong>. They are never uploaded to us or anyone else.</p>
<h2>What stays on your device</h2>
<ul>
<li>Files you add are read in memory and discarded when you close the tab.</li>
<li>If you turn on "Remember my tags on this device", your tags and selected state are saved in your browser's local storage. Files, amounts you typed and TINs are never saved.</li>
<li>A license key you enter is saved in local storage so you don't have to re-enter it.</li>
</ul>
<h2>What we receive</h2>
<ul>
<li><strong>License checks:</strong> when you unlock paid features, your browser sends your license key and a random identifier (not linked to any business name or TIN) to our license server, which asks our payment provider whether the key is valid.</li>
<li><strong>Analytics:</strong> we use Cloudflare Web Analytics, which is cookieless and collects aggregate page-view data. It does not see the contents of your files.</li>
<li><strong>Hosting logs:</strong> our host (Cloudflare) processes standard request data such as IP address to serve the site and prevent abuse.</li>
</ul>
<h2>Payments</h2>
<p>Purchases are handled by Polar (polar.sh) as merchant of record. Polar collects your email and payment details under its own privacy policy; we receive your email and order details from Polar to deliver and support your license.</p>
<h2>Contact</h2>
<p>${SELLER}, ${CONTACT}</p>`,
  },
  {
    slug: 'terms',
    title: 'Terms of use',
    description: 'Terms for using WhoGetsA1099 and buying a license.',
    updated: UPDATED,
    html: `
<h2>The service</h2>
<p>WhoGetsA1099 ("the service") is provided by ${SELLER}. The free checker and paid exports are informational tools. See the <a href="/disclaimer/">disclaimer</a>: the service is not tax, legal or accounting advice.</p>
<h2>Licenses</h2>
<ul>
<li>A single-business license ($19) covers one business for tax year 2026. A bookkeeper pack ($59) covers up to 15 businesses for tax year 2026.</li>
<li>Licenses are sold by Polar as merchant of record, and Polar's terms apply to the purchase. Refund requests: contact us within 14 days of purchase.</li>
<li>Don't share or resell license keys.</li>
</ul>
<h2>No warranty; limitation of liability</h2>
<p>The service is provided "as is" without warranties of any kind. To the fullest extent permitted by law, our total liability for any claim relating to the service is limited to the amount you paid for it. We are not liable for penalties, interest or other losses arising from information returns you file or fail to file.</p>
<h2>Changes</h2>
<p>We may update these terms; the date above shows the latest version.</p>
<h2>Contact</h2>
<p>${CONTACT}</p>`,
  },
];
