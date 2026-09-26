import { SITE } from "./site";

/**
 * The business details the legal pages print. The site names the brand, not
 * a person; grievanceOfficer and city are optional and read naturally when
 * blank. A blank owner, address or email would show as a [placeholder].
 */
export const LEGAL = {
  product: SITE.name,
  site: SITE.url,
  /** Who sells the service, as shown on the site. */
  owner: SITE.name,
  /** Postal address shown on the site. */
  address: "India",
  /** Where customers, reviewers and privacy requests write to. */
  email: SITE.supportEmail,
  /** India (IT Rules 2011, DPDP Act 2023): who handles complaints; blank = not named. */
  grievanceOfficer: "",
  /** Courts of this city hear disputes; blank = the courts of India. */
  city: "",
  /** Change whenever a policy's text changes. */
  updated: "26 September 2026",
};

/** A field's value, or a visible placeholder while it is still blank. */
export const legal = (key: keyof typeof LEGAL, placeholder: string) =>
  LEGAL[key] || `[${placeholder}]`;
