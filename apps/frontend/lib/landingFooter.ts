import { safeContentHref, type FooterLink, type FooterSection } from "@levelup/contracts";
import type { SiteText } from "./messages";

export function resolveFooterSections(text: SiteText["landing"]["v2"]["footer"]): FooterSection[] {
  if (Array.isArray(text.sections)) return text.sections as FooterSection[];
  const link = (id: string, label: string, href: string, icon: FooterLink["icon"] = "none"): FooterLink => ({ id, label, href, icon, enabled: true });
  return [
    { id: "products", title: text.products, enabled: true, links: [link("diagnostics", text.diagnostics, "/flow/voice"), link("navigator", text.navigator, "/habits"), link("experts", text.experts, "/coach")] },
    { id: "security", title: text.security, enabled: true, links: [link("security", text.securityLink, "#privacy-security")] },
    { id: "legal", title: text.legal, enabled: true, links: [link("privacy", text.privacy, "/privacy"), link("offer", text.offer, "/offer")] },
    { id: "contacts", title: text.contacts, enabled: true, links: [link("email", text.supportEmail, `mailto:${text.supportEmail}`, "mail")] },
    { id: "social", title: text.social, enabled: true, links: [link("instagram", "Instagram @orken.ai", "https://www.instagram.com/orken.ai", "instagram"), link("tiktok", "TikTok @orken_life", "https://www.tiktok.com/@orken_life", "music")] },
    { id: "community", title: text.community, enabled: true, links: [link("clients", text.clientsCommunity, "https://t.me/orken_life", "telegram"), link("experts", text.expertsCommunity, "https://t.me/orkenlife", "telegram")] },
    { id: "partners", title: text.partners, enabled: true, links: [link("portal", text.partnerPortal, "/partners")] }
  ];
}

export function publicFooterSections(text: SiteText["landing"]["v2"]["footer"]) {
  return resolveFooterSections(text).filter(group => group.enabled).map(group => ({ ...group, links: group.links.filter(link => link.enabled && safeContentHref(link.href)) }));
}
