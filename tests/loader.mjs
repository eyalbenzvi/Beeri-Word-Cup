export function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !specifier.endsWith('.js') && !specifier.endsWith('.jsx') && !specifier.endsWith('.json')) {
    return next(specifier + '.js', context);
  }
  return next(specifier, context);
}
