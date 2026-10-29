import Link from "next/link";
import { Instagram, Mail, Music2, Send } from "lucide-react";
import { SUPPORT_EMAIL } from "@/lib/legal";
import type { SiteText } from "@/lib/messages";

export function LandingFooter({ text }: { text: SiteText["landing"]["v2"]["footer"] }) {
  return (
    <footer id="feedback" className="landing-v2-footer landing-footer">
      <div className="landing-v2-container">
        <Link className="landing-v2-footer-brand" href="#about">
          <img src="/assets/orken-penguin-transparent.png" alt="" />
          <span>ORKEN.LIFE</span>
        </Link>
        <div className="landing-footer-grid">
          <section aria-labelledby="footer-products">
            <h2 id="footer-products">{text.products}</h2>
            <ul>
              <li><Link href="/flow/voice">{text.diagnostics}</Link></li>
              <li><Link href="/habits">{text.navigator}</Link></li>
              <li><Link href="/coach">{text.experts}</Link></li>
            </ul>
          </section>
          <section aria-labelledby="footer-security">
            <h2 id="footer-security">{text.security}</h2>
            <a href="#privacy-security">{text.securityLink}</a>
          </section>
          <section aria-labelledby="footer-legal">
            <h2 id="footer-legal">{text.legal}</h2>
            <ul>
              <li><Link href="/privacy">{text.privacy}</Link></li>
              <li><Link href="/offer">{text.offer}</Link></li>
            </ul>
          </section>
          <section aria-labelledby="footer-contacts">
            <h2 id="footer-contacts">{text.contacts}</h2>
            <a href={`mailto:${SUPPORT_EMAIL}`}><Mail size={16} aria-hidden="true" />{SUPPORT_EMAIL}</a>
          </section>
          <section aria-labelledby="footer-social">
            <h2 id="footer-social">{text.social}</h2>
            <div className="landing-footer-social">
              <a href="https://www.instagram.com/orken.ai" target="_blank" rel="noopener noreferrer" aria-label="Instagram @orken.ai" title="Instagram @orken.ai"><Instagram size={20} aria-hidden="true" /></a>
              <a href="https://www.tiktok.com/@orken_life" target="_blank" rel="noopener noreferrer" aria-label="TikTok @orken_life" title="TikTok @orken_life"><Music2 size={20} aria-hidden="true" /></a>
            </div>
          </section>
          <section aria-labelledby="footer-community">
            <h2 id="footer-community">{text.community}</h2>
            <ul>
              <li><a href="https://t.me/orken_life" target="_blank" rel="noopener noreferrer"><Send size={15} aria-hidden="true" />{text.clientsCommunity}</a></li>
              <li><a href="https://t.me/orkenlife" target="_blank" rel="noopener noreferrer"><Send size={15} aria-hidden="true" />{text.expertsCommunity}</a></li>
            </ul>
          </section>
        </div>
      </div>
    </footer>
  );
}
