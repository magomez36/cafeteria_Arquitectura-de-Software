import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import HomePage from './page';

describe('home page foundation', () => {
  it('renders the platform landing page heading and status', () => {
    const template = document.createElement('template');
    template.innerHTML = renderToStaticMarkup(HomePage());
    const content = template.content;
    const main = content.querySelector('main');

    expect(main?.querySelector('h1')?.textContent).toBe('Cafetería');
    expect(main?.querySelector('p')?.textContent).toBe('La plataforma está lista para el equipo.');
    expect(content.querySelector('a')?.getAttribute('href')).toBe(`#${main?.id}`);
  });
});
