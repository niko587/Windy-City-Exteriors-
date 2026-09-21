import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { EstimateWizard } from './EstimateWizard';

function mount() {
  return render(
    <MemoryRouter>
      <EstimateWizard />
    </MemoryRouter>,
  );
}

async function advance(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /continue/i }));
}

describe('estimate walkthrough', () => {
  it('will not advance past a step whose answer is missing', async () => {
    const user = userEvent.setup();
    mount();

    expect(screen.getByRole('heading', { name: /what kind of property/i })).toBeInTheDocument();
    await advance(user);
    expect(await screen.findByText(/choose the kind of property/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /what kind of property/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^homeowners\./i }));
    await advance(user);
    expect(screen.getByRole('heading', { name: /what are we looking at/i })).toBeInTheDocument();

    await advance(user);
    expect(await screen.findByText(/pick at least one service/i)).toBeInTheDocument();
  });

  it('rejects a phone number that cannot be dialled and accepts one that can', async () => {
    const user = userEvent.setup();
    mount();

    await user.click(screen.getByRole('button', { name: /^homeowners\./i }));
    await advance(user);
    await user.click(screen.getByRole('button', { name: /^siding, exterior$/i }));
    await advance(user);
    await user.type(screen.getByLabelText(/town/i), 'Lake Villa');
    await advance(user);

    expect(screen.getByRole('heading', { name: /how should we reach you/i })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^name$/i), 'Sam Rivera');
    await user.type(screen.getByLabelText(/phone/i), '555');
    await advance(user);
    expect(await screen.findByText(/ten digits/i)).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/phone/i));
    await user.type(screen.getByLabelText(/phone/i), '224-629-8926');
    await advance(user);
    expect(screen.getByRole('heading', { name: /check it over/i })).toBeInTheDocument();
  });

  it('reaches a confirmation that states plainly that nothing was sent', async () => {
    const user = userEvent.setup();
    mount();

    await user.click(screen.getByRole('button', { name: /^property managers\./i }));
    await advance(user);
    await user.click(screen.getByRole('button', { name: /^gutters, exterior$/i }));
    await advance(user);
    await user.type(screen.getByLabelText(/town/i), 'Gurnee');
    await advance(user);
    await user.type(screen.getByLabelText(/^name$/i), 'Jordan Lee');
    await user.click(screen.getByRole('button', { name: /contact me by email/i }));
    await user.type(screen.getByLabelText(/^email/i), 'jordan@example.com');
    await advance(user);

    expect(screen.getByText('Email jordan@example.com')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /finish the walkthrough/i }));

    expect(
      screen.getByRole('heading', { name: /prototype only — your request was not sent/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/nothing was transmitted/i)).toBeInTheDocument();
  });

  it('never renders a form element, so nothing can be submitted by accident', () => {
    const { container } = mount();
    expect(container.querySelector('form')).toBeNull();
  });
});
