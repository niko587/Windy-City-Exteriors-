import { describe, expect, it } from 'vitest';
import {
  canComplete,
  contactSummary,
  emptyDraft,
  formatPhone,
  isValidEmail,
  isValidPhone,
  normalizePhone,
  validateAll,
  validateStep,
  type EstimateDraft,
} from './validation';

const complete: EstimateDraft = {
  ...emptyDraft,
  propertyType: 'home',
  serviceIds: ['siding'],
  town: 'Lake Villa',
  name: 'Sam Rivera',
  method: 'call',
  phone: '224-629-8926',
};

describe('phone numbers', () => {
  it('strips formatting and a leading country code', () => {
    expect(normalizePhone('+1 (224) 629-8926')).toBe('2246298926');
    expect(normalizePhone('224.629.8926')).toBe('2246298926');
  });

  it('accepts a real ten-digit US number', () => {
    expect(isValidPhone('2246298926')).toBe(true);
    expect(isValidPhone('(847) 555-0134')).toBe(true);
  });

  it('rejects numbers that are the wrong length or cannot be dialled', () => {
    expect(isValidPhone('224629892')).toBe(false);
    expect(isValidPhone('22462989267')).toBe(false);
    expect(isValidPhone('024-629-8926')).toBe(false); // area code starts 0
    expect(isValidPhone('124-629-8926')).toBe(false); // area code starts 1
    expect(isValidPhone('224-029-8926')).toBe(false); // exchange starts 0
    expect(isValidPhone('')).toBe(false);
  });

  it('formats for display and leaves unknown input alone', () => {
    expect(formatPhone('2246298926')).toBe('224-629-8926');
    expect(formatPhone('not a number')).toBe('not a number');
  });
});

describe('email addresses', () => {
  it('accepts ordinary addresses', () => {
    expect(isValidEmail('windycityexteriors@gmail.com')).toBe(true);
    expect(isValidEmail('sam.rivera+jobs@mail.co.uk')).toBe(true);
  });

  it('rejects incomplete or malformed addresses', () => {
    for (const bad of ['', 'sam', 'sam@', '@gmail.com', 'sam@gmail', 'sam@@gmail.com', 'sam @gmail.com', 'sam@.com', 'sam@gmail..com', 'sam@gmail.c']) {
      expect(isValidEmail(bad), bad).toBe(false);
    }
  });
});

describe('step validation', () => {
  it('requires a property type', () => {
    expect(validateStep(0, emptyDraft).propertyType).toBeTruthy();
    expect(validateStep(0, { ...emptyDraft, propertyType: 'commercial' })).toEqual({});
  });

  it('requires at least one service', () => {
    expect(validateStep(1, emptyDraft).serviceIds).toBeTruthy();
    expect(validateStep(1, { ...emptyDraft, serviceIds: ['gutters', 'decks'] })).toEqual({});
  });

  it('requires a town', () => {
    expect(validateStep(2, emptyDraft).town).toBeTruthy();
    expect(validateStep(2, { ...emptyDraft, town: '   ' }).town).toBeTruthy();
    expect(validateStep(2, { ...emptyDraft, town: 'A' }).town).toBeTruthy();
    expect(validateStep(2, { ...emptyDraft, town: 'Antioch' })).toEqual({});
  });

  it('requires a name plus whichever contact detail was chosen', () => {
    const base = { ...emptyDraft, method: 'call' as const };
    expect(validateStep(3, base).name).toBeTruthy();
    expect(validateStep(3, base).phone).toBeTruthy();

    expect(validateStep(3, { ...base, name: 'Sam', phone: '2246298926' })).toEqual({});
    expect(validateStep(3, { ...base, name: 'Sam', phone: '123' }).phone).toBeTruthy();

    const byEmail = { ...emptyDraft, method: 'email' as const, name: 'Sam' };
    expect(validateStep(3, byEmail).email).toBeTruthy();
    expect(validateStep(3, byEmail).phone).toBeUndefined();
    expect(validateStep(3, { ...byEmail, email: 'sam@example.com' })).toEqual({});

    const byText = { ...emptyDraft, method: 'text' as const, name: 'Sam', phone: '2246298926' };
    expect(validateStep(3, byText)).toEqual({});
  });

  it('still validates an optional field that was filled in', () => {
    const d = { ...complete, email: 'nope@' };
    expect(validateStep(3, d).email).toBeTruthy();
    const e = { ...complete, method: 'email' as const, email: 'sam@example.com', phone: '12' };
    expect(validateStep(3, e).phone).toBeTruthy();
  });
});

describe('completion', () => {
  it('accepts a fully filled draft', () => {
    expect(validateAll(complete)).toEqual({});
    expect(canComplete(complete)).toBe(true);
  });

  it('refuses a draft missing any required answer', () => {
    expect(canComplete({ ...complete, town: '' })).toBe(false);
    expect(canComplete({ ...complete, serviceIds: [] })).toBe(false);
    expect(canComplete({ ...complete, propertyType: '' })).toBe(false);
    expect(canComplete({ ...complete, phone: '' })).toBe(false);
    expect(canComplete({ ...complete, name: '  ' })).toBe(false);
  });

  it('describes how the customer asked to be reached', () => {
    expect(contactSummary(complete)).toBe('Call 224-629-8926');
    expect(contactSummary({ ...complete, method: 'text' })).toBe('Text 224-629-8926');
    expect(contactSummary({ ...complete, method: 'email', email: ' sam@example.com ' })).toBe('Email sam@example.com');
  });
});
