import { ZodError } from 'zod';

export const validateRequest = (schema) => (req, res, next) => {
  try {
    // Parse body, params, and query if schema provided
    if (schema.body) req.body = schema.body.parse(req.body);
    if (schema.params) req.params = schema.params.parse(req.params);
    if (schema.query) req.query = schema.query.parse(req.query);
    next();
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: err.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }))
      });
    }
    next(err);
  }
};
