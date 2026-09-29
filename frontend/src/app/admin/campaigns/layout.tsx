import type { Metadata } from "next";
import { CampaignTabs } from "./_tabs";

export const metadata: Metadata = { title: "Email campaigns" };

export default function CampaignsLayout({ children }: LayoutProps<"/admin/campaigns">) {
  return (
    <>
      <CampaignTabs />
      {children}
    </>
  );
}
