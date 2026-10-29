import { ChevronDown } from "lucide-react";

type FaqItem = { id: string; question: string; answer: string };

export function LandingFaq({ eyebrow, title, items }: {
  eyebrow: string;
  title: string;
  items: readonly FaqItem[];
}) {
  return (
    <section id="faq" className="landing-v2-section landing-faq" aria-labelledby="landing-faq-title">
      <div className="landing-v2-container">
        <div className="landing-v2-section-head">
          <p className="landing-v2-eyebrow">{eyebrow}</p>
          <h2 id="landing-faq-title">{title}</h2>
        </div>
        <div className="landing-faq-list">
          {items.map(item => (
            <details className="landing-faq-item" name="orken-landing-faq" key={item.id}>
              <summary>
                <h3>{item.question}</h3>
                <ChevronDown size={20} aria-hidden="true" />
              </summary>
              <div className="landing-faq-answer"><p>{item.answer}</p></div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
