import { SITE } from "./site";

/**
 * The business details the legal pages print. Fill in every blank before
 * going live - an empty value shows as a [bracketed placeholder] on the page.
 */
export const LEGAL = {
  product: SITE.name,
  site: SITE.url,
  /** Legal name of the business or person selling the service. */
  owner: "",
  /** Registered or business postal address. */
  address: "",
  /** Where customers, reviewers and privacy requests write to. */
  email: "",
  /** India (IT Rules 2011, DPDP Act 2023): the person who handles complaints. */
  grievanceOfficer: "",
  /** Courts of this city, India, hear disputes. */
  city: "",
  /** Change whenever a policy's text changes. */
  updated: "26 September 2026",
};

/** A field's value, or a visible placeholder while it is still blank. */
export const legal = (key: keyof typeof LEGAL, placeholder: string) =>
  LEGAL[key] || `[${placeholder}]`;
