import Link from "next/link";
import { defaultSiteText } from "@/lib/messages";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const text = defaultSiteText.ru;

  return (
    <>
      <div className="glow-tl" />
      <div className="glow-br" />
      <div id="app">
        <nav className="app-nav">
          <Link className="logo-wrap" href="/">
            <div className="logo-mark" aria-hidden="true">
              <img src="/assets/levelup-logo.jpg" alt="" />
            </div>
            <div className="logo-text">
              <div className="brand">{text.nav.brand}</div>
              <div className="sub">{text.nav.sub}</div>
            </div>
          </Link>
          <Link className="btn-back" href="/">{text.nav.backHome}</Link>
        </nav>
        <main className="screen app-screen">{children}</main>
      </div>
    </>
  );
}
