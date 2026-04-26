/**
 * Custom ESLint rule: require try/finally around any function body that
 * calls `setLoading(true)` (or `setBusy`/`setSubmitting`/`setFetching`).
 *
 * Origin: the 2026-04-26 admin-loading audit found 21 components that
 * called `setLoading(true)` without a `finally` block — when the wrapped
 * fetch threw, the loader spun forever. This rule catches the regression
 * at lint time before it reaches review.
 *
 * Heuristic, not perfect:
 *   - Triggers on `set\w*(Loading|Busy|Submitting|Fetching)(true)` literal calls.
 *     Variable argument forms (`setLoading(value)`) are skipped.
 *   - Walks up to the enclosing function (declaration / expression / arrow)
 *     and checks for ANY `TryStatement` with a `finalizer` inside the
 *     function body. This is conservative — a try/finally that doesn't
 *     wrap THIS specific setter is still accepted, but in practice that
 *     pattern doesn't exist in this codebase (and the rule would be far
 *     more brittle if it tracked control flow).
 *   - Functions outside a body (top-level setLoading calls in module
 *     scope) are skipped — those don't have a freezing-loader risk.
 */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require try/finally around setLoading/setBusy/setSubmitting/setFetching(true) calls so the loading state is always reset on errors.',
    },
    schema: [],
    messages: {
      missingFinally:
        '"{{name}}(true)" must be inside a function with a try/finally that resets the state. Without `finally`, an unhandled throw will leave the loader spinning forever.',
    },
  },

  create(context) {
    return {
      CallExpression(node) {
        const { callee } = node;
        if (callee.type !== 'Identifier') return;
        if (!/^set\w*(Loading|Busy|Submitting|Fetching)$/.test(callee.name)) return;
        if (node.arguments.length !== 1) return;
        const arg = node.arguments[0];
        if (arg.type !== 'Literal' || arg.value !== true) return;

        // Walk up to the enclosing function. Bail if we hit the program
        // root — top-level setters aren't a freezing-loader risk.
        let fn = node.parent;
        while (fn) {
          if (
            fn.type === 'FunctionDeclaration' ||
            fn.type === 'FunctionExpression' ||
            fn.type === 'ArrowFunctionExpression'
          ) {
            break;
          }
          fn = fn.parent;
        }
        if (!fn || !fn.body) return;

        // Arrow function with expression body (no block) — skip; can't
        // contain a try/finally anyway, and these are typically simple
        // toggles like `() => setLoading(false)` that don't apply here.
        if (fn.body.type !== 'BlockStatement') return;

        if (hasFinalizedTryStatement(fn.body)) return;

        context.report({
          node,
          messageId: 'missingFinally',
          data: { name: callee.name },
        });
      },
    };
  },
};

/**
 * True iff the AST sub-tree contains a TryStatement whose `finalizer`
 * exists. Walks recursively but skips nested function boundaries —
 * a `try/finally` inside a sibling/inner function doesn't help us.
 *
 * Entry point is always called with the enclosing function's
 * BlockStatement body (never a function node), so the function-type
 * guard inside the loop only applies to descendants.
 */
function hasFinalizedTryStatement(node) {
  if (!node || typeof node !== 'object') return false;

  if (node.type === 'TryStatement' && node.finalizer) return true;

  for (const key of Object.keys(node)) {
    if (key === 'parent' || key === 'loc' || key === 'range') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && shouldDescend(item) && hasFinalizedTryStatement(item)) return true;
      }
    } else if (child && typeof child === 'object' && child.type && shouldDescend(child)) {
      if (hasFinalizedTryStatement(child)) return true;
    }
  }
  return false;
}

function shouldDescend(node) {
  // Skip nested function scopes — try/finally there is in a different
  // execution context and doesn't protect setters in the outer function.
  return (
    node.type !== 'FunctionDeclaration' &&
    node.type !== 'FunctionExpression' &&
    node.type !== 'ArrowFunctionExpression'
  );
}

const plugin = {
  rules: {
    'try-finally-loading-state': rule,
  },
};

export default plugin;
