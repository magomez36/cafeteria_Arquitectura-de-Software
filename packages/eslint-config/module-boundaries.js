import path from 'node:path';

const moduleNames = new Set(['identity', 'customers', 'catalog', 'promotions', 'cart', 'orders', 'payments', 'notifications', 'reports']);

export const moduleBoundaryPlugin = {
  rules: {
    'no-cross-module-import': {
      meta: { type: 'problem', schema: [], messages: { boundary: 'Import across Nest modules only through public @cafeteria/contracts exports.' } },
      create(context) {
        const currentModule = context.filename.match(/[\\/]src[\\/]modules[\\/]([^\\/]+)[\\/]/)?.[1];
        if (!currentModule || !moduleNames.has(currentModule)) return {};
        return {
          ImportDeclaration(node) { check(node.source.value, node); },
          ExportNamedDeclaration(node) { if (node.source) check(node.source.value, node); },
          ExportAllDeclaration(node) { check(node.source.value, node); },
        };
        function check(specifier, node) {
          if (typeof specifier !== 'string') return;
          const resolved = specifier.startsWith('.') ? path.resolve(path.dirname(context.filename), specifier) : specifier;
          const target = resolved.match(/[\\/]modules[\\/]([^\\/]+)(?:[\\/]|$)/)?.[1]
            ?? specifier.match(/(?:^|\/)modules\/([^/]+)(?:\/|$)/)?.[1];
          if (target && moduleNames.has(target) && target !== currentModule) context.report({ node, messageId: 'boundary' });
        }
      },
    },
  },
};
