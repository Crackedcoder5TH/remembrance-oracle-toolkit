/**
 * Finite State Machine — Generic, event-driven FSM.
 *
 * @param {object} config - { initial, states: { [name]: { on: { [event]: target | { target, guard, action } } } } }
 * @returns {{ send: (event, context) => string, current: () => string, matches: (state) => boolean, history: () => string[] }}
 */
function createStateMachine(config) {
  if (!config || !config.initial || !config.states) {
    throw new Error('Config must have initial state and states map');
  }
  if (!config.states[config.initial]) {
    throw new Error(`Initial state "${config.initial}" not found in states`);
  }

  let current = config.initial;
  const _history = [current];
  const listeners = [];

  function send(event, context) {
    const stateConfig = config.states[current];
    if (!stateConfig || !stateConfig.on || !stateConfig.on[event]) {
      return current; // No transition defined — stay in current state
    }

    const transition = stateConfig.on[event];
    let target, guard, action;

    if (typeof transition === 'string') {
      target = transition;
    } else {
      target = transition.target;
      guard = transition.guard;
      action = transition.action;
    }

    if (!config.states[target]) {
      throw new Error(`Invalid target state "${target}"`);
    }

    if (guard && !guard(context)) {
      return current; // Guard rejected the transition
    }

    const prev = current;
    current = target;
    _history.push(current);

    if (action) action(context, { from: prev, to: current, event });

    for (const listener of listeners) {
      listener({ from: prev, to: current, event, context });
    }

    return current;
  }

  function subscribe(listener) {
    listeners.push(listener);
    return () => {
      const idx = listeners.indexOf(listener);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  }

  return {
    send,
    subscribe,
    get current() { return current; },
    matches(state) { return current === state; },
    history() { return [..._history]; },
  };
}

module.exports = { createStateMachine };
