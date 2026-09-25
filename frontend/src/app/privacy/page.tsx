import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { LEGAL, legal } from "@/lib/legal";

export const metadata: Metadata = {
  title: `Privacy Policy — ${LEGAL.product}`,
  description: `How ${LEGAL.product} collects, uses and protects personal data.`,
};

export default function PrivacyPage() {
  const owner = legal("owner", "Business legal name");
  const email = legal("email", "Contact email");
  return (
    <LegalPage title="Privacy Policy" current="/privacy">
      <p>
        This policy explains what personal data {owner} (&quot;we&quot;, &quot;us&quot;) handles when you use{" "}
        {LEGAL.product} at {LEGAL.site}, why, and the choices you have. It covers our customers, the visitors
        of websites that embed our widget, and the people whose reviews a widget shows.
      </p>

      <h2>1. Who is responsible</h2>
      <p>
        {owner}, {legal("address", "Business address")}, is responsible for your personal data (the
        &quot;data fiduciary&quot; or &quot;controller&quot;). Questions and requests go to {email}. Our grievance
        officer is {legal("grievanceOfficer", "Grievance officer name")}, at the same email address.
      </p>

      <h2>2. What we collect</h2>
      <p>
        <strong>From you, as a customer</strong>
      </p>
      <ul>
        <li>Account details: your name, email address and password (stored only as a secure hash).</li>
        <li>
          Widget details: the businesses you pick (Google place ID, name and address), your widget settings,
          and the website domains you allow the widget on.
        </li>
        <li>
          Billing details: your plan, subscription status and PayPal subscription ID. Payments are handled by
          PayPal; we never see or store your card or bank details.
        </li>
        <li>Messages you send us, such as support emails.</li>
      </ul>
      <p>
        <strong>From visitors of websites that show a widget</strong>
      </p>
      <ul>
        <li>
          When a widget loads, the visitor&apos;s browser connects to our servers, which receive technical data
          such as the IP address, the website it loads on and the browser type. We use the IP address only to
          count views once per visitor every 30 minutes and to stop abuse; that record is deleted after 30
          minutes. We keep counts, not the addresses themselves.
        </li>
        <li>We count clicks on the widget&apos;s buttons. We do not set cookies on visitors&apos; devices.</li>
      </ul>
      <p>
        <strong>About reviewers</strong>
      </p>
      <ul>
        <li>
          A widget shows a reviewer&apos;s public name, profile photo, rating, review text and date, as published
          on the business&apos;s public Google listing. We store copies to show them and refresh them on a
          schedule.
        </li>
      </ul>
      <p>
        <strong>Automatically, in our dashboard</strong>
      </p>
      <ul>
        <li>
          Server logs with IP addresses and request details, kept for security and troubleshooting.
        </li>
        <li>
          Your browser keeps a sign-in token in local storage so you stay logged in. We use no advertising or
          tracking cookies.
        </li>
      </ul>

      <h2>3. Why we use it</h2>
      <ul>
        <li>To provide the Service you signed up for: your account, widgets, analytics and support.</li>
        <li>To take payment and manage your plan, including plan limits and usage emails.</li>
        <li>To keep the Service secure and prevent fraud and abuse.</li>
        <li>To meet our legal obligations, such as tax and accounting records.</li>
        <li>To send you service messages. We only send marketing emails if you agree, and you can opt out.</li>
      </ul>
      <p>
        Where the GDPR applies, our legal bases are performing our contract with you, our legitimate interest
        in running a secure and working service (including showing publicly available reviews and counting
        views), our legal obligations, and your consent where we ask for it.
      </p>

      <h2>4. Who we share it with</h2>
      <p>We do not sell personal data. We share it only with service providers that help us run the Service:</p>
      <ul>
        <li>hosting and database providers;</li>
        <li>our email delivery provider;</li>
        <li>PayPal, for payments;</li>
        <li>
          Google, whose Maps service powers the place search in your dashboard (Google&apos;s own{" "}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
            privacy policy
          </a>{" "}
          applies to that search);
        </li>
        <li>third-party data providers that help us retrieve publicly available review information.</li>
      </ul>
      <p>
        We may also disclose data when the law requires it, or to protect our rights and users. Some of these
        providers are outside your country; where that happens we rely on appropriate safeguards required by
        law.
      </p>

      <h2>5. How long we keep it</h2>
      <ul>
        <li>Account and widget data: while your account is open, and deleted within 30 days after you close it.</li>
        <li>Billing records: as long as tax and accounting laws require.</li>
        <li>Visitor IP addresses for view counting: 30 minutes. Daily view and click counts: while the widget exists.</li>
        <li>Stored reviews: while a widget uses that business, then removed.</li>
      </ul>

      <h2>6. Your rights</h2>
      <p>
        Depending on where you live, you can ask to access, correct or delete your personal data, get a copy
        of it, object to or restrict how we use it, and withdraw consent you have given. You can also nominate
        someone to act for you, and complain to your data protection authority. Email {email} and we will
        reply within 30 days.
      </p>
      <p>
        <strong>Reviewers:</strong> if a widget shows your review and you want it removed from our widgets,
        email us with a link to the review and we will remove it. Changes you make to the review on Google
        also reach the widget when it next refreshes.
      </p>

      <h2>7. Security</h2>
      <p>
        We use encrypted connections, hashed passwords, access controls and restricted API keys to protect
        data. No system is perfectly secure; if a breach affects you, we will tell you and the authorities as
        the law requires.
      </p>

      <h2>8. Children</h2>
      <p>The Service is for businesses and is not meant for anyone under 18. We do not knowingly collect their data.</p>

      <h2>9. Changes</h2>
      <p>
        We may update this policy. The date at the top shows the latest version, and we will tell you about
        important changes by email or in your dashboard.
      </p>

      <h2>10. Contact</h2>
      <p>
        {owner}
        <br />
        {legal("address", "Business address")}
        <br />
        Email: {email}
        <br />
        See also our <Link href="/terms">Terms of Service</Link>.
      </p>
    </LegalPage>
  );
}
