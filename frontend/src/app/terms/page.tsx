import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { LEGAL, legal } from "@/lib/legal";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Terms of Service",
  description: `The terms that apply when you use ${LEGAL.product} to show Google reviews on your website: accounts, plans, payments and acceptable use.`,
  path: "/terms",
});

export default function TermsPage() {
  const owner = legal("owner", "Business legal name");
  const email = legal("email", "Contact email");
  return (
    <LegalPage title="Terms of Service" current="/terms">
      <p>
        These Terms of Service (&quot;Terms&quot;) are an agreement between you and {owner} (&quot;we&quot;,
        &quot;us&quot;), the operator of {LEGAL.product} at {LEGAL.site} (the &quot;Service&quot;). By creating an
        account or using the Service you accept these Terms. If you use the Service for a business, you accept
        them on its behalf and confirm you are allowed to.
      </p>

      <h2>1. The Service</h2>
      <p>
        {LEGAL.product} lets you display reviews of a business, taken from its public Google listing, on your
        own website through an embeddable widget, and see how often that widget is viewed. Review content is
        publicly available information, retrieved and refreshed on a schedule that depends on your plan. Reviews
        may appear with a delay, and some may not appear at all.
      </p>
      <p>
        {LEGAL.product} is not affiliated with, endorsed by or sponsored by Google. Google and Google Maps are
        trademarks of Google LLC. Reviews remain the work of the people who wrote them.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>You must be at least 18 years old and give accurate information when you register.</li>
        <li>Keep your password safe. You are responsible for everything done through your account.</li>
        <li>Tell us straight away at {email} if you think someone else has used your account.</li>
      </ul>

      <h2>3. How you may use it</h2>
      <p>You agree that you will:</p>
      <ul>
        <li>
          only add businesses you own or are authorised to represent, and only embed widgets on websites you
          control;
        </li>
        <li>
          not present the reviews your widget shows as all of a business&apos;s reviews, or edit or rewrite
          them. Your widget can be set to show selected reviews; the overall rating and the link to the full
          listing on Google are there so visitors can see the whole picture;
        </li>
        <li>
          follow the laws that apply to you, including consumer protection and advertising rules on customer
          reviews;
        </li>
        <li>
          not copy, resell or redistribute review data outside the widget, overload or attack the Service, or
          try to get around plan limits, security or the domain restrictions on your widgets.
        </li>
      </ul>
      <p>We may suspend a widget or an account that breaks these rules, and we will tell you why.</p>

      <h2>4. Plans, billing and limits</h2>
      <ul>
        <li>
          The Free plan is free. Paid plans are billed monthly or yearly in advance, as you choose, and renew
          automatically until you cancel. Payments are processed by our reseller and merchant of record, Dodo
          Payments, which also handles sales tax and issues your invoices. Prices are shown in US dollars and
          include tax; customers in India can pay in rupees with UPI or an Indian card.
        </li>
        <li>
          Each plan has limits, such as widgets, websites, reviews shown per widget, monthly views and how often
          reviews refresh. They are listed on the <Link href="/#pricing">pricing</Link> and Billing pages. When a
          plan&apos;s monthly views run out, its widgets stop showing until the next month or until you upgrade.
        </li>
        <li>
          If a renewal payment fails, we try it again. If it is still unpaid five days after the renewal date,
          your account moves to the Free plan&apos;s limits until the payment goes through; nothing is deleted.
          For yearly plans we email you a week before each renewal.
        </li>
        <li>
          We may change prices or plan limits. A new price applies to new subscriptions; while your subscription
          stays active, it keeps renewing at the price you signed up at.
        </li>
        <li>
          Cancellations and refunds are covered by our{" "}
          <Link href="/refund-policy">Refund &amp; Cancellation Policy</Link>.
        </li>
      </ul>

      <h2>5. Availability</h2>
      <p>
        We work to keep the Service running and reviews current, but we do not guarantee that it will be
        uninterrupted or error-free. Review data depends on sources outside our control and may be delayed,
        incomplete or temporarily unavailable. We may change, improve or remove features over time.
      </p>

      <h2>6. Ownership</h2>
      <p>
        We own the Service, including the widget code and design. While your account is active you may use
        the widget on your authorised websites. You keep the rights to your own content, such as your
        business details and settings, and let us use it only to run the Service for you.
      </p>

      <h2>7. Ending your use</h2>
      <p>
        You can stop using the Service and delete your widgets at any time. We may end or suspend your access
        if you seriously or repeatedly break these Terms, or if we have to by law. If we stop offering the
        Service, we will give you reasonable notice and refund any prepaid, unused period of a paid plan.
      </p>

      <h2>8. Disclaimers and liability</h2>
      <p>
        The Service is provided &quot;as is&quot;. To the extent the law allows, we make no promises beyond
        those in these Terms, and we are not liable for indirect or consequential losses, such as lost
        profits, data or goodwill. Our total liability to you for any claim is limited to the amount you paid
        us in the 12 months before the claim. Nothing in these Terms limits liability that cannot be limited
        by law.
      </p>
      <p>
        You are responsible for how you use the widget on your websites, and you agree to cover our reasonable
        costs if a claim against us arises from your breach of these Terms.
      </p>

      <h2>9. Governing law</h2>
      <p>
        These Terms are governed by the laws of India. The courts of {legal("city", "City")}, India have
        jurisdiction over any dispute, without taking away any right you have under the law of your own
        country as a consumer.
      </p>

      <h2>10. Changes to these Terms</h2>
      <p>
        We may update these Terms. The date at the top shows the latest version. If a change matters to you,
        we will tell you by email or in your dashboard before it takes effect. Using the Service after that
        means you accept the new Terms.
      </p>

      <h2>11. Contact</h2>
      <p>
        {owner}
        <br />
        {legal("address", "Business address")}
        <br />
        Email: {email}
      </p>
    </LegalPage>
  );
}
