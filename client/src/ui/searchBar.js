import { h } from './dom.js';

/** Formulario de destino con atajos (chips) a los traces de ejemplo. */
export function createSearchBar({ suggestions, onSubmit }) {
  const form = document.getElementById('search');
  const input = document.getElementById('target');
  const btn = document.getElementById('search-btn');
  const error = document.getElementById('search-error');
  const chips = document.getElementById('chips');

  function renderChips(list) {
    chips.replaceChildren();
    for (const s of list) {
      chips.append(
        h('button', {
          type: 'button',
          class: 'chip mono',
          onclick: () => {
            input.value = s;
            form.requestSubmit();
          },
        }, s),
      );
    }
  }
  renderChips(suggestions);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    showError('');
    onSubmit(input.value);
  });

  input.addEventListener('input', () => showError(''));

  function showError(msg) {
    error.textContent = msg;
    form.classList.toggle('search--error', Boolean(msg));
  }

  return {
    showError,
    setSuggestions: renderChips,
    setBusy(busy) {
      btn.disabled = busy;
      form.classList.toggle('search--busy', busy);
    },
  };
}
