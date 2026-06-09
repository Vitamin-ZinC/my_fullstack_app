import Link from "next/link";

export default function AppLayout({ children }: { children: React.ReactNode }) {
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
              <div className="brand">ИКИГАЙ</div>
              <div className="sub">от LevelUP.AI</div>
            </div>
          </Link>
          <Link className="btn-back" href="/">← Главная</Link>
        </nav>
        <main className="screen app-screen">{children}</main>
      </div>
    </>
  );
}
