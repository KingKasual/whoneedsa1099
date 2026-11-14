/** Question pages. Amounts are pulled from the rules data so content and engine never disagree. */
import { FEDERAL } from '../rules';

const r = FEDERAL.rules;
const usd = (n: number | undefined): string => `$${(n ?? 0).toLocaleString('en-US')}`;
const NEC = usd(r.NEC_THRESHOLD?.amount);
const ROY = usd(r.MISC_ROYALTY_THRESHOLD?.amount);
const NEC_DUE = 'February 1, 2027';

export interface Question {
  slug: string;
  title: string;
  description: string;
  answer: string;
  body: string[];
  faqs: { q: string; a: string }[];
  ruleIds: string[];
}

export const QUESTIONS: Question[] = [
  {
    slug: 'do-i-send-a-1099-for-an-1800-payment',
    title: 'Do I send a 1099 for an $1,800 payment?',
    description: `For payments made in 2026, no: the 1099-NEC threshold is now ${NEC}. Here's when $1,800 can still require a form.`,
    answer: `Usually not. For payments made in 2026, you file Form 1099-NEC only when you paid a contractor ${NEC} or more for the year. $1,800 is under that line.`,
    body: [
      `The threshold is per payee, per calendar year, added across every way you paid them by check, ACH, Zelle, wire or cash. Two $900 payments to the same person total $1,800 and stay under the line. A third $300 payment pushes the total to $2,100, and then you file.`,
      `Card and payment-app payments (PayPal, Venmo for business, Square) don't count toward this total; the processor reports them on Form 1099-K.`,
      `Royalties are different: the threshold for royalties is only ${ROY}. Your state may also still use a lower threshold, so check your state's rules.`,
      `Close to the line? Make sure every bank account and card export is included before you decide not to file.`,
    ],
    faqs: [
      { q: 'Is the $2,000 threshold per payment or per year?', a: `Per payee, per calendar year. Add up everything you paid that payee in 2026 by non-card methods.` },
      { q: 'Should I still collect a W-9 for an $1,800 payee?', a: 'Yes. It costs nothing, and if you pay them again you will need their TIN to file.' },
    ],
    ruleIds: ['NEC_THRESHOLD', 'NEAR_THRESHOLD', 'COLLECT_W9'],
  },
  {
    slug: 'what-is-the-1099-threshold-for-2026',
    title: 'What is the 1099 threshold for 2026?',
    description: `${NEC} for 1099-NEC and most 1099-MISC boxes, up from $600, for payments made after December 31, 2025. Royalties stay at ${ROY}.`,
    answer: `${NEC} for nonemployee compensation (1099-NEC) and for rents and other income (1099-MISC), for payments made in 2026. It was $600 for decades. Royalties stay at ${ROY}.`,
    body: [
      `The change applies to payments you make on or after January 1, 2026, so it first shows up on the forms due in early 2027. The threshold is set to be indexed for inflation in later years.`,
      `Not every box moved. Royalties keep their ${ROY} threshold, and gross proceeds paid to attorneys follow their own rules. We flag those conservatively until IRS guidance is final.`,
      `States don't all follow the federal change automatically. See our state-by-state pages.`,
    ],
    faqs: [
      { q: 'Does the new threshold apply to my 2025 payments?', a: 'No. Payments made in 2025 used the old $600 threshold.' },
      { q: 'Did the royalty threshold change?', a: `No, it is still ${ROY}.` },
    ],
    ruleIds: ['NEC_THRESHOLD', 'MISC_RENT_THRESHOLD', 'MISC_ROYALTY_THRESHOLD'],
  },
  {
    slug: 'zelle-vs-card-payments-and-1099s',
    title: 'Zelle vs. card payments and 1099s',
    description: 'Payments by credit card or PayPal are left off your 1099-NEC. Zelle payments are not; they count like a check.',
    answer: 'Card and payment-app payments are reported by the processor on Form 1099-K, so you leave them off your 1099-NEC/MISC. Zelle is a bank-to-bank transfer, not a payment settlement entity, so Zelle payments count toward your 1099 total like a check or ACH.',
    body: [
      'If you paid a contractor with a business credit card, debit card, or through a payment app that processes the payment (PayPal goods & services, Venmo business, Square, Stripe), the processor reports it on Form 1099-K.',
      'Zelle, wire transfers, ACH, bill pay and checks are different: the money moves bank-to-bank, nobody issues a 1099-K, and the payment counts toward your 1099-NEC total.',
      'A contractor you paid partly by card and partly by Zelle only counts the Zelle portion. Our checker splits these automatically by reading which export each payment came from.',
    ],
    faqs: [
      { q: 'Do Zelle payments need a 1099?', a: `Yes, if the payee is a non-corporate contractor and your total non-card payments to them reach ${NEC} for the year.` },
      { q: 'I paid a contractor $5,000 on my business credit card. Do I send a 1099?', a: 'No 1099-NEC is required for the card payments; they are reported on Form 1099-K by the card processor.' },
    ],
    ruleIds: ['CARD_APP_EXCLUDED'],
  },
  {
    slug: 'how-to-file-1099s-free-with-iris',
    title: 'How to file 1099s free with IRIS',
    description: "The IRS's IRIS Taxpayer Portal files 1099-NEC and 1099-MISC for free, with CSV upload of up to 250 forms per file. Here are the steps.",
    answer: 'The IRS Information Returns Intake System (IRIS) Taxpayer Portal lets you e-file 1099s for free. You need an IRS online account and an IRIS Transmitter Control Code (TCC). Then you type each form in or upload a CSV.',
    body: [
      'Step 1: apply for an IRIS TCC through your IRS account. Approval can take weeks, so apply now, not in late January.',
      'Step 2: gather a W-9 for each payee you must report, with their legal name, TIN and address.',
      'Step 3: in the portal, enter forms one by one or upload the IRIS CSV template. The templates are strict: headers must match exactly, some characters are not allowed, and each file holds at most 250 records.',
      `Step 4: send each payee their copy by ${NEC_DUE}. The 1099-NEC is due to the IRS the same day.`,
      'Our paid export builds IRIS-format CSV files from your exports, checks them for the common rejection causes, holds back rows with problems, and splits large batches.',
    ],
    faqs: [
      { q: 'Is IRIS really free?', a: 'Yes. The IRS does not charge to file through the IRIS Taxpayer Portal.' },
      { q: 'How many forms can one IRIS CSV file have?', a: 'Up to 250 records per file, according to IRS Publication 5717. You can upload several files.' },
    ],
    ruleIds: ['NEC_THRESHOLD'],
  },
  {
    slug: 'do-llcs-get-a-1099',
    title: 'Do LLCs get a 1099?',
    description: 'It depends on how the LLC is taxed. Single-member and partnership LLCs do; LLCs taxed as an S or C corporation generally don’t.',
    answer: "It depends on how the LLC is taxed, which is shown on its Form W-9. A single-member LLC (disregarded entity) or an LLC taxed as a partnership gets a 1099. An LLC that elected to be taxed as a C or S corporation generally does not, except for attorney fees.",
    body: [
      '"LLC" in a company name doesn\'t tell you the answer. Box 3 of the W-9 does: the LLC checks C, S, or P (partnership), or the owner files as a disregarded entity.',
      `If you don't have a W-9 yet, our checker treats the payee as not a corporation, the conservative choice, and asks you to collect one.`,
    ],
    faqs: [
      { q: 'How do I know if an LLC is taxed as a corporation?', a: 'Ask for a Form W-9. The tax classification box tells you.' },
    ],
    ruleIds: ['CORP_EXEMPT', 'CORP_UNKNOWN'],
  },
  {
    slug: 'do-i-send-a-1099-to-a-corporation',
    title: 'Do I send a 1099 to a corporation?',
    description: 'Generally no. Payments to C and S corporations are exempt, except attorney fees, gross proceeds paid to attorneys and medical payments.',
    answer: 'Generally no. Payments to a C or S corporation are exempt from 1099-NEC/MISC reporting. The main exceptions are fees paid for legal services, gross proceeds paid to an attorney, and medical and health care payments.',
    body: [
      'An incorporated law firm still gets a 1099-NEC for legal fees once you reach the threshold.',
      'Confirm corporate status with a W-9 rather than guessing from "Inc." in a bank description.',
    ],
    faqs: [{ q: 'Do incorporated law firms get a 1099?', a: `Yes, for legal fees of ${NEC} or more in 2026 (1099-NEC box 1).` }],
    ruleIds: ['CORP_EXEMPT', 'ATTORNEY_FEES'],
  },
  {
    slug: 'do-attorneys-get-a-1099',
    title: 'Do attorneys get a 1099?',
    description: 'Yes, even if the law firm is a corporation: legal fees go on 1099-NEC, and settlement proceeds paid to an attorney go on 1099-MISC box 10.',
    answer: `Yes. Legal fees of ${NEC} or more go on Form 1099-NEC box 1, even when the firm is incorporated. Gross proceeds you pay to an attorney, such as a settlement paid to the claimant's lawyer, go on Form 1099-MISC box 10.`,
    body: [
      'Fees are payments for the attorney\'s own services to your business. Gross proceeds are payments that pass through the attorney to someone else, such as a settlement.',
      'The threshold for gross proceeds in 2026 is pending confirmation, so we flag these at the old $600 level to be safe.',
    ],
    faqs: [{ q: 'Which form for a settlement paid to a lawyer?', a: 'Form 1099-MISC, box 10 (gross proceeds paid to an attorney).' }],
    ruleIds: ['ATTORNEY_FEES', 'MISC_ATTORNEY_PROCEEDS'],
  },
  {
    slug: 'do-landlords-get-a-1099-for-rent',
    title: 'Do I send my landlord a 1099 for rent?',
    description: `If your business paid ${NEC}+ in 2026 rent to an individual or non-corporate landlord, yes: 1099-MISC box 1. Not if you pay a property manager.`,
    answer: `Yes, if your business paid ${NEC} or more in rent in 2026 to a landlord that isn't a corporation: Form 1099-MISC, box 1. If you pay rent to a real estate agent or property manager, you don't file; they do.`,
    body: [
      'This applies to business rent: office space, storage, equipment rental. Personal rent on your home isn\'t reported.',
      'Small landlords who pay handymen should also check those payments for 1099-NEC.',
    ],
    faqs: [{ q: 'Does rent paid by credit card need a 1099?', a: 'No. Card payments are reported on Form 1099-K by the processor.' }],
    ruleIds: ['MISC_RENT_THRESHOLD', 'CARD_APP_EXCLUDED'],
  },
  {
    slug: 'paypal-venmo-payments-1099-nec',
    title: 'Do PayPal or Venmo payments go on a 1099-NEC?',
    description: 'No, when the payment was processed by PayPal or Venmo as a business payment: it is reported on Form 1099-K instead.',
    answer: 'No, for payments processed through PayPal, Venmo for business, Cash App for business and similar apps: the app reports them on Form 1099-K, so you leave them off your 1099-NEC.',
    body: [
      'Upload your PayPal or Venmo export along with your bank and card exports. We mark app payments as excluded and still count anything you paid the same person by check or Zelle.',
      'A payment-app transfer that shows up on your bank statement (e.g. "VENMO PAYMENT") is flagged as an app payment too. You can change it if it was really something else.',
    ],
    faqs: [{ q: 'What if I paid someone with Venmo "friends and family"?', a: 'That isn\'t a processed business payment and may not generate a 1099-K. Talk to a tax professional; our checker flags it for review if you tag it.' }],
    ruleIds: ['CARD_APP_EXCLUDED'],
  },
  {
    slug: 'contractor-wont-give-me-a-w9',
    title: "What if a contractor won't give me a W-9?",
    description: 'If the contractor is reportable and you have no TIN, backup withholding at 24% applies to future payments. Collect W-9s before you pay.',
    answer: 'Once a payee is reportable and you don\'t have a correct TIN, you must withhold 24% (backup withholding) from future payments and send it to the IRS. The easiest fix is to require a W-9 before the first payment.',
    body: [
      'Below the threshold, a missing W-9 isn\'t urgent yet, but the moment total payments reach the threshold you will need it. Ask now.',
      'Our W-9 kit drafts request and reminder emails that link to the official IRS form, and tracks who you are still waiting on.',
      'Never ask for a TIN in a plain email body. Ask for a signed W-9 sent securely.',
    ],
    faqs: [{ q: 'What is the backup withholding rate?', a: '24%.' }],
    ruleIds: ['BACKUP_WITHHOLDING', 'COLLECT_W9'],
  },
  {
    slug: '1099-deadline-2027',
    title: 'When are 1099s due in 2027?',
    description: `1099-NEC is due to recipients and the IRS on ${NEC_DUE} (January 31 is a Sunday). 1099-MISC dates differ.`,
    answer: `Form 1099-NEC for tax year 2026 is due to both the recipient and the IRS by ${NEC_DUE}, because January 31, 2027 is a Sunday.`,
    body: FEDERAL.deadlines.map((d) => `${d.date}: ${d.label}.${d.note ? ` ${d.note}` : ''}`),
    faqs: [{ q: 'Is the 1099-NEC deadline January 31 or February 1, 2027?', a: `${NEC_DUE}, since January 31, 2027 falls on a Sunday.` }],
    ruleIds: ['NEC_THRESHOLD'],
  },
  {
    slug: '1099-for-royalties',
    title: 'Do I send a 1099 for royalties?',
    description: `Yes, once you pay ${ROY} or more in royalties in a year: Form 1099-MISC box 2. The ${NEC} threshold does not apply.`,
    answer: `Yes. Royalties of ${ROY} or more in a year go on Form 1099-MISC, box 2. The new ${NEC} threshold does not apply to royalties.`,
    body: ['This covers royalties for books, music, patents, and oil, gas and mineral interests you pay in the course of your business.'],
    faqs: [{ q: 'What is the 2026 royalty threshold?', a: `${ROY}.` }],
    ruleIds: ['MISC_ROYALTY_THRESHOLD'],
  },
  {
    slug: 'do-i-need-a-1099-for-goods',
    title: 'Do I need a 1099 for goods or materials?',
    description: 'No. Payments for merchandise, inventory and supplies are not reported on 1099-NEC/MISC. Services are.',
    answer: 'No. Payments for merchandise, inventory, freight, storage and similar items are not reported on Form 1099-NEC or 1099-MISC.',
    body: ['If a contractor bills you for both parts and labor, the IRS instructions generally say to report the whole payment on 1099-NEC unless the materials are separately stated. When in doubt, ask your tax pro.'],
    faqs: [{ q: 'Do I send a 1099 to Home Depot?', a: 'No. That is a purchase of goods, and usually from a corporation, often by card.' }],
    ruleIds: ['GOODS_EXCLUDED'],
  },
  {
    slug: '1099-nec-vs-1099-misc',
    title: '1099-NEC vs. 1099-MISC: which one?',
    description: 'Services from contractors go on 1099-NEC. Rent, royalties, prizes and attorney settlement proceeds go on 1099-MISC.',
    answer: 'Use Form 1099-NEC for payments for services by non-employees (contractors, freelancers, attorneys\' fees). Use Form 1099-MISC for rents, royalties, prizes and awards, other income, and gross proceeds paid to attorneys.',
    body: ['Deadlines differ: 1099-NEC is due to the IRS on February 1, 2027. 1099-MISC is due to the IRS March 1 (paper) or March 31, 2027 (e-file).'],
    faqs: [{ q: 'Which form for a freelance designer?', a: '1099-NEC, box 1.' }],
    ruleIds: ['NEC_THRESHOLD', 'MISC_RENT_THRESHOLD', 'MISC_OTHER_THRESHOLD'],
  },
  {
    slug: 'does-the-2000-threshold-apply-to-2025-payments',
    title: 'Does the $2,000 threshold apply to 2025 payments?',
    description: 'No. The $2,000 threshold applies to payments made after December 31, 2025. Payments made in 2025 used the $600 threshold.',
    answer: 'No. It applies to payments made after December 31, 2025. If you are correcting or late-filing 2025 forms, use the old $600 threshold.',
    body: ['Our checker only counts payments dated in 2026 and lists anything outside the year as excluded, so an export covering December 2025 won\'t skew your results.'],
    faqs: [{ q: 'What threshold applied to 2025 1099s?', a: '$600 for 1099-NEC and most 1099-MISC boxes.' }],
    ruleIds: ['OUT_OF_YEAR', 'NEC_THRESHOLD'],
  },
];
