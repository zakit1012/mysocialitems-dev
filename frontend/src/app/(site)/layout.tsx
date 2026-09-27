import { SiteHeader } from "@/components/SiteHeader";
import { Footer } from "@/components/Footer";

/**
 * The public site: header and footer around every page in this group. The
 * app screens (login, dashboard, admin, invoices) bring their own shell.
 * Route groups decide this, not the URL in the browser, so the server and
 * the browser always draw the same page (a 404 included).
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="flex-1 flex flex-col">{children}</main>
      <Footer />
    </>
  );
}
