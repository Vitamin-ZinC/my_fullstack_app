import Link from "next/link";
import { Instagram, Mail, Music2, Send } from "lucide-react";
import type { SiteText } from "@/lib/messages";
import { publicFooterSections } from "@/lib/landingFooter";

const icons = { instagram: Instagram, mail: Mail, music: Music2, telegram: Send };

export function LandingFooter({ text, preview = false }: { text: SiteText["landing"]["v2"]["footer"]; preview?: boolean }) {
  return (
    <footer id={preview ? undefined : "feedback"} className="landing-v2-footer landing-footer">
      <div className="landing-v2-container">
        <Link className="landing-v2-footer-brand" href="#about"><img src="/assets/orken-penguin-transparent.png" alt="" /><span>ORKEN.LIFE</span></Link>
        <div className="landing-footer-grid">
          {publicFooterSections(text).map(group => (
            <section key={group.id} aria-labelledby={`footer-${preview ? "preview-" : ""}${group.id}`}>
              <h2 id={`footer-${preview ? "preview-" : ""}${group.id}`}>{group.title}</h2>
              {group.id === "contacts" && text.legalDetails && <p className="landing-footer-company">{text.legalDetails}</p>}
              <ul>{group.links.map(link => {
                const Icon = link.icon === "none" ? null : icons[link.icon];
                const external = link.href.startsWith("https:");
                const content = <>{Icon && <Icon size={16} aria-hidden="true" />}{link.label}</>;
                return <li key={link.id}>{link.href.startsWith("/")
                  ? <Link href={link.href}>{content}</Link>
                  : <a href={link.href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>{content}</a>}</li>;
              })}</ul>
            </section>
          ))}
        </div>
      </div>
    </footer>
  );
}
