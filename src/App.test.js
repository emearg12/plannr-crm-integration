import { render, screen } from '@testing-library/react';
import App from './App';

test('renders login prompt', () => {
  render(<App />);
  const heading = screen.getByText(/Plannr API Suite/i);
  expect(heading).toBeInTheDocument();
});
