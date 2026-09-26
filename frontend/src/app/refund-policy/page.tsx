import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { LEGAL, legal } from "@/lib/legal";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Refund & Cancellation Policy",
  description: `How cancelling and refunds work for ${LEGAL.product} plans: cancel any time from Billing, and a 7-day refund on your first payment.`,
  path: "/refund-policy",
});

export default function RefundPolicyPage() {
  const email = legal("email", "Contact email");
  return (
    <LegalPage title="Refund & Cancellation Policy" current="/refund-policy">
      <p>
        {LEGAL.product} has a Free plan, so you can try it before you pay. Paid plans are monthly or yearly
        subscriptions billed in advance. Payments are processed by our merchant of record, Dodo Payments.
      </p>

      <h2>Cancelling</h2>
      <ul>
        <li>
          Cancel any time from <Link href="/dashboard/billing">Billing</Link> in your dashboard. Changed your mind
          before the period ends? Resume it from the same page.
        </li>
        <li>
          You keep your paid plan until the end of the period you have already paid for. After that you move
          to the Free plan and are not charged again.
        </li>
        <li>Your widgets and settings stay; the Free plan&apos;s limits apply from then on.</li>
      </ul>

      <h2>Refunds</h2>
      <ul>
        <li>
          <strong>First payment:</strong> if a paid plan is not right for you, ask within 7 days of your first
          payment for it and we will refund that payment in full.
        </li>
        <li>
          <strong>Renewals:</strong> monthly and yearly renewals are not refunded, including for a partly used
          period. Cancel before your renewal date to avoid the next charge.
        </li>
        <li>
          <strong>Our mistakes:</strong> duplicate charges, charges after you cancelled, or a paid feature that
          did not work because of a fault on our side are refunded in full.
        </li>
        <li>This policy does not take away any refund right you have under the law of your country.</li>
      </ul>

      <h2>How to ask for a refund</h2>
      <p>
        Email {email} from your account&apos;s email address with the payment reference from your receipt. We
        reply within 3 business days. Approved refunds go back to the card, UPI or account you paid with,
        usually within 5-10 business days depending on your bank.
      </p>

      <h2>Contact</h2>
      <p>
        {legal("owner", "Business legal name")}, {legal("address", "Business address")}. Email: {email}.
      </p>
    </LegalPage>
  );
}
