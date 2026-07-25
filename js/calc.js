/* ==========================================================================
   calc.js — калькулятор мастера.
   Считает обычную арифметику и броски кубиков: 2d6+3, d20+5, 4d6*2.
   Разбор рекурсивным спуском, без eval.
   ========================================================================== */

const CALC = (() => {

  const MAX_DICE = 200;          // защита от «10000d6»
  const MAX_SIDES = 1000;

  /* --- разбор выражения -------------------------------------------------- */

  function tokenize(src) {
    const out = [];
    const s = src.replace(/[×х]/gi, '*').replace(/[÷]/g, '/').replace(/[−–—]/g, '-').replace(/,/g, '.');
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === ' ') { i++; continue; }
      if (/[0-9.]/.test(c)) {
        let j = i;
        while (j < s.length && /[0-9.]/.test(s[j])) j++;
        const num = parseFloat(s.slice(i, j));
        if (Number.isNaN(num)) throw new Error('Непонятное число');
        out.push({ t: 'num', v: num });
        i = j;
        continue;
      }
      if (/[dкд]/i.test(c)) { out.push({ t: 'd' }); i++; continue; }
      if ('+-*/'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
      if (c === '(') { out.push({ t: '(' }); i++; continue; }
      if (c === ')') { out.push({ t: ')' }); i++; continue; }
      throw new Error(`Непонятный символ «${c}»`);
    }
    return out;
  }

  function evaluate(src) {
    const tokens = tokenize(src);
    const rolls = [];
    let pos = 0;
    const peek = () => tokens[pos];
    const eat = () => tokens[pos++];

    function expr() {
      let v = term();
      while (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
        const op = eat().v;
        const r = term();
        v = op === '+' ? v + r : v - r;
      }
      return v;
    }

    function term() {
      let v = unary();
      while (peek() && peek().t === 'op' && (peek().v === '*' || peek().v === '/')) {
        const op = eat().v;
        const r = unary();
        if (op === '/' && r === 0) throw new Error('Деление на ноль');
        v = op === '*' ? v * r : v / r;
      }
      return v;
    }

    function unary() {
      if (peek() && peek().t === 'op' && peek().v === '-') { eat(); return -unary(); }
      if (peek() && peek().t === 'op' && peek().v === '+') { eat(); return unary(); }
      return primary();
    }

    function primary() {
      const tk = peek();
      if (!tk) throw new Error('Выражение обрывается');

      // кубик без количества: d20
      if (tk.t === 'd') { eat(); return roll(1, sides()); }

      if (tk.t === 'num') {
        eat();
        if (peek() && peek().t === 'd') { eat(); return roll(tk.v, sides()); }
        return tk.v;
      }

      if (tk.t === '(') {
        eat();
        const v = expr();
        if (!peek() || peek().t !== ')') throw new Error('Не закрыта скобка');
        eat();
        return v;
      }
      throw new Error('Здесь ожидалось число');
    }

    function sides() {
      const tk = peek();
      if (!tk || tk.t !== 'num') throw new Error('После d нужно число граней');
      eat();
      return tk.v;
    }

    function roll(count, faces) {
      count = Math.floor(count);
      faces = Math.floor(faces);
      if (count < 1 || faces < 2) throw new Error('Кубик должен быть хотя бы d2');
      if (count > MAX_DICE) throw new Error(`Не больше ${MAX_DICE} кубиков за раз`);
      if (faces > MAX_SIDES) throw new Error(`Не больше d${MAX_SIDES}`);
      const dice = [];
      let sum = 0;
      for (let i = 0; i < count; i++) {
        const v = 1 + Math.floor(Math.random() * faces);
        dice.push(v);
        sum += v;
      }
      rolls.push({ spec: `${count}d${faces}`, dice, sum });
      return sum;
    }

    const value = expr();
    if (pos < tokens.length) throw new Error('Лишнее в конце выражения');
    if (!Number.isFinite(value)) throw new Error('Получилось не число');
    return { value, rolls };
  }

  const format = (n) => Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');

  /* --- виджет ------------------------------------------------------------ */

  const DICE = [4, 6, 8, 10, 12, 20, 100];
  const KEYS = [
    ['7', '8', '9', '÷'],
    ['4', '5', '6', '×'],
    ['1', '2', '3', '−'],
    ['(', ')', '.', '+'],
    ['C', '⌫', 'd', '='],
  ];
  const INSERT = { '÷': '/', '×': '*', '−': '-' };

  /** Собирает калькулятор. Возвращает готовый DOM-узел. */
  function widget() {
    const { el } = UI;

    const input = el('input', {
      class: 'field calc-display', type: 'text', inputmode: 'text',
      placeholder: '2d6+3', 'aria-label': 'Выражение',
    });
    const out = el('div', { class: 'calc-out' });
    const history = el('div', { class: 'calc-history' });
    const past = [];

    function show(text, kind) {
      out.className = 'calc-out' + (kind ? ' ' + kind : '');
      out.replaceChildren(text);
    }

    function run() {
      const src = input.value.trim();
      if (!src) return;
      let res;
      try {
        res = evaluate(src);
      } catch (err) {
        show(el('span', { class: 'calc-err', text: err.message }));
        return;
      }
      const detail = res.rolls.map((r) => `${r.spec}: ${r.dice.join(' + ')}`).join(' · ');
      show(el('div', {}, [
        el('div', { class: 'calc-value', text: format(res.value) }),
        detail ? el('div', { class: 'calc-detail', text: detail }) : null,
      ]));
      past.unshift({ src, value: format(res.value) });
      past.length = Math.min(past.length, 5);
      history.replaceChildren(...past.map((h) =>
        el('button', {
          class: 'calc-hist', title: 'Подставить обратно',
          onclick: () => { input.value = h.src; input.focus(); },
        }, [
          el('span', { class: 'ch-src', text: h.src }),
          el('span', { class: 'ch-val', text: h.value }),
        ])));
    }

    function press(key) {
      if (key === '=') return run();
      if (key === 'C') { input.value = ''; show(''); input.focus(); return; }
      if (key === '⌫') { input.value = input.value.slice(0, -1); input.focus(); return; }
      input.value += (INSERT[key] || key);
      input.focus();
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); run(); }
    });

    const diceRow = el('div', { class: 'calc-dice' }, DICE.map((d) =>
      el('button', {
        class: 'btn calc-die', title: `Бросить d${d}`,
        onclick: () => { input.value = input.value.trim() ? input.value + `+d${d}` : `d${d}`; run(); },
        text: 'd' + d,
      })));

    const pad = el('div', { class: 'calc-pad' }, KEYS.flat().map((k) =>
      el('button', {
        class: 'btn calc-key' + (k === '=' ? ' btn-primary' : '') + ('C⌫'.includes(k) ? ' calc-key-soft' : ''),
        onclick: () => press(k), text: k,
      })));

    return el('div', { class: 'calc' }, [input, out, diceRow, pad, history]);
  }

  return { evaluate, format, widget };
})();
