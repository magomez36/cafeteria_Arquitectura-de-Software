import { describe, expect, it } from 'vitest';
import HomePage from './page';

describe('home page foundation', () => {
  it('renders the platform landing page heading and status', () => {
    const page = HomePage();
    const [heading, status] = page.props.children;

    expect(page.type).toBe('main');
    expect(heading.props.children).toBe('Cafetería');
    expect(status.props.children).toBe('La plataforma está lista para el equipo.');
  });
});
