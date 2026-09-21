/**
 * Estimate wizard rules.
 *
 * Pure and framework-free so the behaviour that actually matters — that a
 * request cannot be completed without a way to reach the customer back — is
 * testable without rendering anything.
 */

import type { PropertyTypeId, ServiceId } from '../content';

export type ContactMethod = 'call' | 'text' | 'email';

export interface LocalPhoto {
  id: string;
  name: string;
  size: number;
  /** Object URL. Local only: nothing is ever uploaded. */
  url: string;
}

export interface EstimateDraft {
  propertyType: PropertyTypeId | '';
  serviceIds: ServiceId[];
  town: string;
  details: string;
  photos: LocalPhoto[];
  name: string;
  phone: string;
  email: string;
  method: ContactMethod;
}

export const emptyDraft: EstimateDraft = {
  propertyType: '',
  serviceIds: [],
  town: '',
  details: '',
  photos: [],
  name: '',
  phone: '',
  email: '',
  method: 'call',
};

export const STEPS = ['Property', 'Services', 'Project', 'Contact', 'Review'] as const;
export type StepIndex = 0 | 1 | 2 | 3 | 4;

export type Errors = Partial<Record<keyof EstimateDraft, string>>;

/** Digits only, dropping a leading US country code. */
export function normalizePhone(input: string): string {
  const digits = input.replace(/\D+/g, '');
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}

export function isValidPhone(input: string): boolean {
  const d = normalizePhone(input);
  // Ten digits, and a US area code or exchange never starts with 0 or 1.
  return d.length === 10 && !/^[01]/.test(d) && !/^\d{3}[01]/.test(d);
}

export function formatPhone(input: string): string {
  const d = normalizePhone(input);
  if (d.length !== 10) return input.trim();
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
}

export function isValidEmail(input: string): boolean {
  const v = input.trim();
  if (v.length < 6 || v.length > 254) return false;
  if (/\s/.test(v)) return false;
  const at = v.indexOf('@');
  if (at < 1 || at !== v.lastIndexOf('@')) return false;
  const domain = v.slice(at + 1);
  if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) return false;
  const dot = domain.lastIndexOf('.');
  return dot > 0 && domain.length - dot > 2;
}

export const MAX_PHOTOS = 6;
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

export function validateStep(step: StepIndex, d: EstimateDraft): Errors {
  const e: Errors = {};

  if (step === 0 && !d.propertyType) {
    e.propertyType = 'Choose the kind of property so we know who we are quoting for.';
  }

  if (step === 1 && d.serviceIds.length === 0) {
    e.serviceIds = 'Pick at least one service. You can choose several.';
  }

  if (step === 2) {
    const town = d.town.trim();
    if (!town) e.town = 'Tell us the town — it decides whether the job is in our area.';
    else if (town.length < 2) e.town = 'That looks too short to be a town name.';
  }

  if (step === 3) {
    if (!d.name.trim()) e.name = 'We need a name to put on the estimate.';
    if (d.method === 'email') {
      if (!d.email.trim()) e.email = 'Add an email address so we can send the estimate.';
      else if (!isValidEmail(d.email)) e.email = 'That email address does not look complete.';
    } else {
      if (!d.phone.trim()) e.phone = `Add a phone number so we can ${d.method === 'text' ? 'text' : 'call'} you.`;
      else if (!isValidPhone(d.phone)) e.phone = 'A US phone number should be ten digits.';
    }
    // The optional field still has to be valid if it was filled in.
    if (d.method !== 'email' && d.email.trim() && !isValidEmail(d.email)) {
      e.email = 'That email address does not look complete.';
    }
    if (d.method === 'email' && d.phone.trim() && !isValidPhone(d.phone)) {
      e.phone = 'A US phone number should be ten digits.';
    }
  }

  return e;
}

/** Every step must pass before the review step can be completed. */
export function validateAll(d: EstimateDraft): Errors {
  return {
    ...validateStep(0, d),
    ...validateStep(1, d),
    ...validateStep(2, d),
    ...validateStep(3, d),
  };
}

export function isStepValid(step: StepIndex, d: EstimateDraft): boolean {
  return Object.keys(validateStep(step, d)).length === 0;
}

export function canComplete(d: EstimateDraft): boolean {
  return Object.keys(validateAll(d)).length === 0;
}

/** How the customer asked to be reached, written out for the review step. */
export function contactSummary(d: EstimateDraft): string {
  if (d.method === 'email') return `Email ${d.email.trim()}`;
  return `${d.method === 'text' ? 'Text' : 'Call'} ${formatPhone(d.phone)}`;
}
