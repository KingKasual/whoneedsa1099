import { render } from 'preact';
import { App } from './ui/App';
import { TEST_MODE } from './lib/config';

const root = document.getElementById('app');
if (root) render(<App />, root);
if (TEST_MODE) {
  const b = document.createElement('p');
  b.className = 'test-banner';
  b.setAttribute('role', 'note');
  b.textContent = 'Test build: paid features unlock without payment, and IRIS files use provisional headers. Do not file from this build.';
  document.body.prepend(b);
}
