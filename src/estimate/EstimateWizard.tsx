/**
 * Five-step estimate request.
 *
 * Nothing leaves the browser. Photos are previewed from object URLs and
 * revoked when removed or when the component unmounts; there is no upload, no
 * fetch and no form action anywhere in this file. The final step says so in
 * plain words rather than implying a request was sent.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { company, customers, services, type ServiceId } from '../content';
import {
  MAX_PHOTOS,
  MAX_PHOTO_BYTES,
  STEPS,
  canComplete,
  contactSummary,
  emptyDraft,
  formatPhone,
  isStepValid,
  validateStep,
  type EstimateDraft,
  type Errors,
  type LocalPhoto,
  type StepIndex,
} from './validation';
import './estimate.css';

const METHODS: { id: EstimateDraft['method']; label: string; note: string }[] = [
  { id: 'call', label: 'A phone call', note: 'Usually the fastest way to scope a job' },
  { id: 'text', label: 'A text message', note: 'Good for photos and quick questions' },
  { id: 'email', label: 'Email', note: 'If you would rather have it in writing' },
];

export function EstimateWizard(): React.JSX.Element {
  const [step, setStep] = useState<StepIndex>(0);
  const [draft, setDraft] = useState<EstimateDraft>(emptyDraft);
  const [errors, setErrors] = useState<Errors>({});
  const [reached, setReached] = useState(0);
  const [done, setDone] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const photosRef = useRef<LocalPhoto[]>([]);
  photosRef.current = draft.photos;

  // Navigation validates the latest answers, not whatever was captured when
  // the handler was created. A wizard is exactly the place where a stale
  // closure turns into "you did fill that in, and it told you that you hadn't".
  // These refs are written by the event handlers themselves rather than during
  // render, so a click that lands before React has committed the keystroke
  // before it still validates against what the visitor actually typed.
  const draftRef = useRef(draft);
  const stepRef = useRef<StepIndex>(step);

  const writeDraft = useCallback((next: EstimateDraft) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  useEffect(
    () => () => {
      for (const p of photosRef.current) URL.revokeObjectURL(p.url);
    },
    [],
  );

  const patch = useCallback(
    (p: Partial<EstimateDraft>) => {
      writeDraft({ ...draftRef.current, ...p });
      setErrors({});
    },
    [writeDraft],
  );

  const goto = useCallback((next: StepIndex) => {
    stepRef.current = next;
    setStep(next);
    setReached((r) => Math.max(r, next));
    setErrors({});
  }, []);

  // Focus moves to the new step's heading as part of the same commit. Doing it
  // a frame later — which is the obvious way to write it — means a visitor who
  // starts typing immediately has the caret pulled out of the field they are
  // already using, and the characters they typed go nowhere.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const advance = useCallback(() => {
    const d = draftRef.current;
    const s = stepRef.current;
    const found = validateStep(s, d);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    if (s < 4) goto((s + 1) as StepIndex);
  }, [goto]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const accepted: LocalPhoto[] = [];
    let rejected = 0;
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/') || f.size > MAX_PHOTO_BYTES) {
        rejected += 1;
        continue;
      }
      accepted.push({ id: `${f.name}-${f.size}-${f.lastModified}`, name: f.name, size: f.size, url: URL.createObjectURL(f) });
    }
    const merged = [...draftRef.current.photos];
    for (const p of accepted) {
      if (merged.some((m) => m.id === p.id) || merged.length >= MAX_PHOTOS) {
        URL.revokeObjectURL(p.url);
        continue;
      }
      merged.push(p);
    }
    writeDraft({ ...draftRef.current, photos: merged });
    if (rejected) setErrors({ photos: `${rejected} file${rejected > 1 ? 's were' : ' was'} skipped: images under 8 MB only.` });
  }, [writeDraft]);

  const removePhoto = useCallback(
    (id: string) => {
      const d = draftRef.current;
      const target = d.photos.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.url);
      writeDraft({ ...d, photos: d.photos.filter((p) => p.id !== id) });
    },
    [writeDraft],
  );

  const chosen = useMemo(
    () => services.filter((s) => draft.serviceIds.includes(s.id)).map((s) => s.name),
    [draft.serviceIds],
  );

  if (done) {
    return (
      <div className="done">
        <span className="done__mark" aria-hidden="true">
          <svg width="20" height="15" viewBox="0 0 20 15" fill="none">
            <path d="M1.5 7.6 7 13 18.5 1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h2 className="display-m">Prototype only — your request was not sent.</h2>
        <p className="lede">
          This walkthrough is a demonstration. Nothing was transmitted, no photos left your device and nobody at{' '}
          {company.name} has received anything. In the finished site this step would deliver the request and confirm
          it by {draft.method === 'email' ? 'email' : draft.method === 'text' ? 'text' : 'phone'}.
        </p>
        <div className="notice">
          <strong>What you filled in:</strong> {chosen.join(', ') || 'no services'} for a{' '}
          {customers.find((c) => c.id === draft.propertyType)?.label.toLowerCase().replace(/s$/, '') ?? 'property'} in{' '}
          {draft.town || 'an unnamed town'}. Preferred contact: {contactSummary(draft)}.
          {draft.photos.length > 0 && ` ${draft.photos.length} photo${draft.photos.length > 1 ? 's' : ''} previewed locally.`}
        </div>
        <p className="lede">To reach us for real right now, call or text {company.phoneDisplay}, or email {company.email}.</p>
        <div className="hero__actions">
          <a className="btn btn--primary" href={company.phoneHref}>
            <span>Call {company.phoneDisplay}</span>
          </a>
          <button
            type="button"
            className="btn"
            onClick={() => {
              for (const p of draft.photos) URL.revokeObjectURL(p.url);
              writeDraft(emptyDraft);
              stepRef.current = 0;
              setStep(0);
              setReached(0);
              setDone(false);
            }}
          >
            <span>Start the walkthrough again</span>
          </button>
          <Link className="btn btn--quiet" to="/">
            <span>Back to the property</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="wiz">
      <nav className="wiz__track" aria-label="Estimate steps">
        {STEPS.map((label, i) => {
          const state = i === step ? 'current' : i < step || (i <= reached && isStepValid(i as StepIndex, draft)) ? 'done' : 'todo';
          return (
            <button
              key={label}
              type="button"
              className="wiz__step"
              data-state={state}
              aria-current={i === step ? 'step' : undefined}
              disabled={i > reached && i > step}
              onClick={() => goto(i as StepIndex)}
            >
              <b>{String(i + 1).padStart(2, '0')}</b>
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="wiz__panel">
        {/* --- 1. property ------------------------------------------------- */}
        {step === 0 && (
          <>
            <div className="wiz__head">
              <h2 tabIndex={-1} ref={headingRef}>
                What kind of property?
              </h2>
              <p>It changes how we schedule, how we price and who we talk to about access.</p>
            </div>
            <div className="choices choices--two" role="group" aria-label="Property type">
              {customers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="choice"
                  data-selected={draft.propertyType === c.id}
                  aria-pressed={draft.propertyType === c.id}
                  aria-label={`${c.label}. ${c.note}`}
                  onClick={() => patch({ propertyType: c.id })}
                >
                  <b>{c.label}</b>
                  <span>{c.note}</span>
                </button>
              ))}
            </div>
            {errors.propertyType && <p className="field__error">{errors.propertyType}</p>}
          </>
        )}

        {/* --- 2. services ------------------------------------------------- */}
        {step === 1 && (
          <>
            <div className="wiz__head">
              <h2 tabIndex={-1} ref={headingRef}>
                What are we looking at?
              </h2>
              <p>Choose everything that applies. Plenty of projects touch more than one trade.</p>
            </div>
            <div className="choices choices--two" role="group" aria-label="Services">
              {services.map((s) => {
                const on = draft.serviceIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    className="choice"
                    data-selected={on}
                    aria-pressed={on}
                    // Without this, the accessible name is the whole card read
                    // as one run-on string; a screen reader hears the category,
                    // the service and the summary as one word.
                    aria-label={`${s.name}, ${s.category.toLowerCase()}`}
                    onClick={() =>
                      patch({
                        serviceIds: on
                          ? draft.serviceIds.filter((x) => x !== s.id)
                          : ([...draft.serviceIds, s.id] as ServiceId[]),
                      })
                    }
                  >
                    <span className="choice__cat">{s.category}</span>
                    <b>{s.name}</b>
                    <span>{s.summary}</span>
                  </button>
                );
              })}
            </div>
            {errors.serviceIds && <p className="field__error">{errors.serviceIds}</p>}
          </>
        )}

        {/* --- 3. project -------------------------------------------------- */}
        {step === 2 && (
          <>
            <div className="wiz__head">
              <h2 tabIndex={-1} ref={headingRef}>
                Where is it, and what is going on?
              </h2>
              <p>{company.serviceArea}</p>
            </div>

            <div className="field" data-invalid={!!errors.town}>
              <label htmlFor="wce-town">Town</label>
              <input
                id="wce-town"
                type="text"
                autoComplete="address-level2"
                placeholder="Lake Villa, Gurnee, Antioch…"
                value={draft.town}
                aria-describedby={errors.town ? 'wce-town-error' : undefined}
                aria-invalid={!!errors.town}
                onChange={(e) => patch({ town: e.target.value })}
              />
              {errors.town && (
                <p className="field__error" id="wce-town-error">
                  {errors.town}
                </p>
              )}
            </div>

            <div className="field">
              <label htmlFor="wce-details">Project details</label>
              <textarea
                id="wce-details"
                placeholder="Age of the siding, what is failing, whether there is water damage, when you would like it done…"
                value={draft.details}
                onChange={(e) => patch({ details: e.target.value })}
              />
              <p className="field__hint">Optional, but the more you tell us the more accurate the number is.</p>
            </div>

            <div className="field">
              <label htmlFor="wce-photos">Photos</label>
              <div
                className="drop"
                data-over={dragOver}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
                }}
              >
                <input
                  id="wce-photos"
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    if (e.target.files) addFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
                <label htmlFor="wce-photos" className="btn btn--sm" style={{ cursor: 'pointer' }}>
                  <span>Choose photos</span>
                </label>
                <p>
                  Drop images here, or browse. Up to {MAX_PHOTOS}. In this prototype they are previewed from your own
                  device and never uploaded.
                </p>
              </div>
              {errors.photos && <p className="field__error">{errors.photos}</p>}
              {draft.photos.length > 0 && (
                <div className="thumbs">
                  {draft.photos.map((p) => (
                    <div className="thumb" key={p.id}>
                      <img src={p.url} alt={p.name} />
                      <button type="button" aria-label={`Remove ${p.name}`} onClick={() => removePhoto(p.id)}>
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* --- 4. contact -------------------------------------------------- */}
        {step === 3 && (
          <>
            <div className="wiz__head">
              <h2 tabIndex={-1} ref={headingRef}>
                How should we reach you?
              </h2>
              <p>{company.estimatePromise} We will use whichever of these you prefer.</p>
            </div>

            <div className="field" data-invalid={!!errors.name}>
              <label htmlFor="wce-name">Name</label>
              <input
                id="wce-name"
                type="text"
                autoComplete="name"
                value={draft.name}
                aria-invalid={!!errors.name}
                onChange={(e) => patch({ name: e.target.value })}
              />
              {errors.name && <p className="field__error">{errors.name}</p>}
            </div>

            <div className="choices choices--two" role="group" aria-label="Preferred contact method">
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="choice"
                  data-selected={draft.method === m.id}
                  aria-pressed={draft.method === m.id}
                  aria-label={`Contact me by ${m.id}`}
                  onClick={() => patch({ method: m.id })}
                >
                  <b>{m.label}</b>
                  <span>{m.note}</span>
                </button>
              ))}
            </div>

            <div className="fieldrow">
              <div className="field" data-invalid={!!errors.phone}>
                <label htmlFor="wce-phone">
                  Phone {draft.method === 'email' && <span style={{ textTransform: 'none', letterSpacing: 0 }}>(optional)</span>}
                </label>
                <input
                  id="wce-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="224-555-0123"
                  value={draft.phone}
                  aria-invalid={!!errors.phone}
                  onChange={(e) => patch({ phone: e.target.value })}
                />
                {errors.phone && <p className="field__error">{errors.phone}</p>}
              </div>

              <div className="field" data-invalid={!!errors.email}>
                <label htmlFor="wce-email">
                  Email {draft.method !== 'email' && <span style={{ textTransform: 'none', letterSpacing: 0 }}>(optional)</span>}
                </label>
                <input
                  id="wce-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={draft.email}
                  aria-invalid={!!errors.email}
                  onChange={(e) => patch({ email: e.target.value })}
                />
                {errors.email && <p className="field__error">{errors.email}</p>}
              </div>
            </div>
          </>
        )}

        {/* --- 5. review --------------------------------------------------- */}
        {step === 4 && (
          <>
            <div className="wiz__head">
              <h2 tabIndex={-1} ref={headingRef}>
                Check it over.
              </h2>
              <p>Anything look wrong? Every line here jumps back to the step that set it.</p>
            </div>

            <dl className="review">
              <div className="review__row">
                <dt>Property</dt>
                <dd>{customers.find((c) => c.id === draft.propertyType)?.label ?? '—'}</dd>
                <button type="button" className="review__edit" onClick={() => goto(0)}>
                  Edit
                </button>
              </div>
              <div className="review__row">
                <dt>Services</dt>
                <dd>{chosen.join(', ') || '—'}</dd>
                <button type="button" className="review__edit" onClick={() => goto(1)}>
                  Edit
                </button>
              </div>
              <div className="review__row">
                <dt>Town</dt>
                <dd>{draft.town || '—'}</dd>
                <button type="button" className="review__edit" onClick={() => goto(2)}>
                  Edit
                </button>
              </div>
              <div className="review__row">
                <dt>Details</dt>
                <dd>{draft.details.trim() || 'None added'}</dd>
                <button type="button" className="review__edit" onClick={() => goto(2)}>
                  Edit
                </button>
              </div>
              <div className="review__row">
                <dt>Photos</dt>
                <dd>{draft.photos.length ? `${draft.photos.length} previewed locally` : 'None'}</dd>
                <button type="button" className="review__edit" onClick={() => goto(2)}>
                  Edit
                </button>
              </div>
              <div className="review__row">
                <dt>Name</dt>
                <dd>{draft.name.trim() || '—'}</dd>
                <button type="button" className="review__edit" onClick={() => goto(3)}>
                  Edit
                </button>
              </div>
              <div className="review__row">
                <dt>Preferred contact</dt>
                <dd>{contactSummary(draft)}</dd>
                <button type="button" className="review__edit" onClick={() => goto(3)}>
                  Edit
                </button>
              </div>
              {draft.method !== 'email' && draft.email.trim() && (
                <div className="review__row">
                  <dt>Email on file</dt>
                  <dd>{draft.email.trim()}</dd>
                  <button type="button" className="review__edit" onClick={() => goto(3)}>
                    Edit
                  </button>
                </div>
              )}
              {draft.method === 'email' && draft.phone.trim() && (
                <div className="review__row">
                  <dt>Phone on file</dt>
                  <dd>{formatPhone(draft.phone)}</dd>
                  <button type="button" className="review__edit" onClick={() => goto(3)}>
                    Edit
                  </button>
                </div>
              )}
            </dl>

            <div className="notice">
              This is a prototype. Finishing the walkthrough will not send anything to {company.name}, will not upload
              your photos and will not book a visit.
            </div>
          </>
        )}

        {/* --- navigation -------------------------------------------------- */}
        <div className="wiz__nav">
          {step > 0 ? (
            <button type="button" className="btn btn--quiet" onClick={() => goto((step - 1) as StepIndex)}>
              <span>← Back</span>
            </button>
          ) : (
            <span />
          )}

          {step < 4 ? (
            <button type="button" className="btn btn--navy" onClick={advance}>
              <span>Continue</span>
              <span className="btn-arrow" aria-hidden="true">
                →
              </span>
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--primary"
              disabled={!canComplete(draft)}
              onClick={() => setDone(true)}
            >
              <span>Finish the walkthrough</span>
              <span className="btn-arrow" aria-hidden="true">
                →
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
