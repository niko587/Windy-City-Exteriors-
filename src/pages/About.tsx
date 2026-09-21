import { Reveal } from '../components/Reveal';
import { company, customers, values } from '../content';
import { ClosingCta } from './Home';
import './home.css';

export function About(): React.JSX.Element {
  return (
    <>
      <header className="pagehead">
        <div className="shell pagehead__inner">
          <p className="eyebrow eyebrow--accent">About</p>
          <h1>Family owned. Owner operated. Still answering the phone.</h1>
          <p className="lede">
            {company.name} works out of {company.base}. {company.serviceArea}
          </p>
        </div>
      </header>

      <section className="section shell">
        <div className="about__grid">
          <Reveal className="about__body">
            <p>
              The owner is hands-on and stays that way: he is on site, he is on the phone, and he is the one who
              wrote the number on your estimate. As the crew grows, the standard does not move — everyone works to
              what the name on the truck is willing to stand behind.
            </p>
            <p>
              The focus is exterior work — siding, windows, doors, decks and gutters — plus the interior work that so
              often comes with it: flooring, drywall, repairs and remodeling. Having one contractor carry a project
              across trades is usually the difference between a job that closes and a job that drags.
            </p>
            <p>
              Estimates are free, accurate and same day. That means we look at the property, we say what we will take
              on and what we will not, and the price reflects the actual scope rather than a number picked to win the
              work and revisited later.
            </p>
            <p>
              Most of what we do comes from people calling back for the next project, or handing our number to a
              neighbour. That is the whole business plan, and it is why the details that nobody photographs still get
              done properly.
            </p>
          </Reveal>

          <Reveal delay={90}>
            <p className="eyebrow" style={{ marginBottom: 18 }}>
              Who we work for
            </p>
            <div className="customers">
              {customers.map((c) => (
                <div className="customer" key={c.id}>
                  <b>{c.label}</b>
                  <span>{c.note}</span>
                </div>
              ))}
            </div>

            <p className="eyebrow" style={{ margin: '40px 0 18px' }}>
              How we work
            </p>
            <div className="customers">
              {values.map((v) => (
                <div className="customer" key={v.title}>
                  <b style={{ fontSize: 19 }}>{v.title}</b>
                </div>
              ))}
            </div>
          </Reveal>
        </div>

        <p className="fallback__note" style={{ marginTop: 44, maxWidth: '72ch', textTransform: 'none', letterSpacing: 0, fontSize: 13.5 }}>
          This prototype deliberately makes no claim about years in business, employee counts, awards, licences,
          warranties or certifications. Those go on the site once they are confirmed, and not before.
        </p>
      </section>

      <ClosingCta />
    </>
  );
}
