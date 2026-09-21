import { company } from '../content';
import { EstimateWizard } from '../estimate/EstimateWizard';
import './home.css';

export function Estimate(): React.JSX.Element {
  return (
    <>
      <header className="pagehead">
        <div className="shell pagehead__inner">
          <p className="eyebrow eyebrow--accent">Free · accurate · same day</p>
          <h1>Tell us about the project.</h1>
          <p className="lede">
            Five short steps. {company.estimatePromise} In this prototype nothing is sent — the walkthrough shows the
            flow and then says so plainly at the end.
          </p>
        </div>
      </header>

      <section className="section shell">
        <EstimateWizard />
      </section>
    </>
  );
}
